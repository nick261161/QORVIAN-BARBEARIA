import type { RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assertProfessional } from '../services/slot.service.js';
import { snapshotCommission } from '../services/commission.service.js';
import { creditCompletion } from '../services/loyalty.service.js';
import { assertFeature, scopedTenant } from '../services/tenant.service.js';
import { one, pool, transaction } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { checkout, id, orderStatus } from '../schemas/index.js';

type Product = { id:string; name:string; sku:string; price_cents:number; stock_quantity:number };
type Order = { id:string; status:string; professional_id:string | null; client_id:string; total_cents:string };
type Line = { product_id:string; name_snapshot:string; unit_cents:number; quantity:number };

export const createOrder: RequestHandler = async (request,response) => {
  const input = checkout.parse(request.body);
  const actor = request.identity!.actor;
  const address=input.modality==='ENTREGA'?input.delivery_address:'';
  const fingerprint=input.request_key?createHash('sha256').update(JSON.stringify([input.modality,address,[...input.items].sort((a,b)=>a.product_id.localeCompare(b.product_id))])).digest('hex'):null;
  const result = await transaction(async db => {
    const { tenant, flags } = await scopedTenant(db,request.scope!.tenant.id,true);
    assertFeature(flags,'enable_products_store'); assertFeature(flags,'enable_shopping_cart');
    if(input.request_key){
      const saved=await one<{id:string;status:string;total_cents:number;request_fingerprint:string}>(db,'SELECT id,status,total_cents::float8,request_fingerprint FROM orders WHERE tenant_id=$1 AND client_id=$2 AND request_key=$3',[tenant.id,actor.id,input.request_key]);
      if(saved){
        if(saved.request_fingerprint!==fingerprint)throw new HttpError(409,'Este pedido já foi enviado com outros itens.');
        const items=(await db.query('SELECT product_id,name_snapshot,sku_snapshot,unit_cents,quantity FROM order_items WHERE tenant_id=$1 AND order_id=$2',[tenant.id,saved.id])).rows;
        return {id:saved.id,status:saved.status,total_cents:saved.total_cents,items};
      }
    }
    const catalog = (await db.query<Product>('SELECT id,name,sku,price_cents,stock_quantity FROM products WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND active AND deleted_at IS NULL ORDER BY id FOR UPDATE',
      [tenant.id,input.items.map(item=>item.product_id)])).rows;
    const lines = input.items.map(item => {
      const product = catalog.find(row=>row.id===item.product_id);
      if (!product || product.stock_quantity<item.quantity) throw new HttpError(409,product ? `Estoque insuficiente para ${product.name}.` : 'Um produto está indisponível.');
      return { ...item, name_snapshot:product.name, sku_snapshot:product.sku, unit_cents:product.price_cents };
    });
    const total = lines.reduce((sum,item)=>sum+item.unit_cents*item.quantity,0);
    if (total>100000000) throw new HttpError(400,'O total excede o limite por pedido.');
    const order = (await one<{ id:string; status:string }>(db, `INSERT INTO orders (tenant_id,client_id,modality,delivery_address,total_cents,request_key,request_fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,status`,
      [tenant.id,actor.id,input.modality,address,total,input.request_key??null,fingerprint]))!;
    for (const item of lines) {
      await db.query('INSERT INTO order_items (tenant_id,order_id,product_id,name_snapshot,sku_snapshot,unit_cents,quantity) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [tenant.id,order.id,item.product_id,item.name_snapshot,item.sku_snapshot,item.unit_cents,item.quantity]);
      await db.query('UPDATE products SET stock_quantity=stock_quantity-$3 WHERE tenant_id=$1 AND id=$2',[tenant.id,item.product_id,item.quantity]);
      await db.query("INSERT INTO stock_movements (tenant_id,product_id,order_id,delta,reason) VALUES ($1,$2,$3,$4,'PEDIDO')",[tenant.id,item.product_id,order.id,-item.quantity]);
    }
    return { ...order,total_cents:total,items:lines };
  });
  response.status(201).json(result);
};

export function listOrders(owner = false): RequestHandler {
  return async (request,response) => {
    const page = z.coerce.number().int().min(1).max(10000).default(1).parse(request.query.page);
    const tenant = request.scope!.tenant.id;
    const actor = request.identity!.actor;
    const list = await pool.query(`SELECT o.id,o.client_id,o.professional_id,o.modality,o.delivery_address,o.status,o.created_at,o.completed_at,o.total_cents::float8,
      u.name AS client_name, CASE WHEN $2::uuid IS NULL THEN u.phone ELSE NULL END AS client_phone,
      (SELECT jsonb_agg(jsonb_build_object('product_id',i.product_id,'name_snapshot',i.name_snapshot,'quantity',i.quantity,'unit_cents',i.unit_cents) ORDER BY i.name_snapshot)
      FROM order_items i WHERE i.tenant_id=o.tenant_id AND i.order_id=o.id) AS items
      FROM orders o JOIN users u ON u.tenant_id=o.tenant_id AND u.id=o.client_id
      WHERE o.tenant_id=$1 AND ($2::uuid IS NULL OR o.client_id=$2) ORDER BY o.created_at DESC,o.id LIMIT 51 OFFSET $3`,[tenant,owner?null:actor.id,(page-1)*50]);
    response.json({items:list.rows.slice(0,50),has_more:list.rows.length>50});
  };
}

export const finishOrder: RequestHandler = async (request,response) => {
  const orderId = id.parse(request.params.id);
  const input = orderStatus.parse(request.body);
  const result = await transaction(async db => {
    const { tenant,flags } = await scopedTenant(db,request.scope!.tenant.id,true,request.identity!.impersonating);
    const row = await one<Order>(db,'SELECT id,status,professional_id,client_id,total_cents FROM orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant.id,orderId]);
    if (!row) throw new HttpError(404,'Pedido não encontrado.');
    if (row.status===input.status) return { id:row.id,status:row.status };
    if (row.status!=='PENDENTE') throw new HttpError(409,'Somente pedidos pendentes podem mudar de status.');
    const lines = (await db.query<Line>('SELECT product_id,name_snapshot,unit_cents,quantity FROM order_items WHERE tenant_id=$1 AND order_id=$2',[tenant.id,orderId])).rows;
    const professional = input.professional_id ?? row.professional_id;
    if (professional) await assertProfessional(db,tenant.id,professional);
    if (input.status==='CANCELADO') {
      for (const item of lines) {
        await db.query('UPDATE products SET stock_quantity=stock_quantity+$3 WHERE tenant_id=$1 AND id=$2',[tenant.id,item.product_id,item.quantity]);
        await db.query("INSERT INTO stock_movements (tenant_id,product_id,order_id,delta,reason) VALUES ($1,$2,$3,$4,'CANCELAMENTO')",[tenant.id,item.product_id,orderId,item.quantity]);
      }
    } else {
      if (flags.enable_commissions && professional) await snapshotCommission(db,tenant.id,professional,'product',orderId,lines.map(item=>({id:item.product_id,name:item.name_snapshot,gross:item.unit_cents*item.quantity})));
      if (flags.enable_loyalty_club) await creditCompletion(db,{tenant:tenant.id,client:row.client_id,kind:'ORDER',source:orderId,total:Number(row.total_cents)});
    }
    return one(db,"UPDATE orders SET status=$3,professional_id=$4,completed_at=CASE WHEN $3='CONCLUIDO' THEN now() END WHERE tenant_id=$1 AND id=$2 RETURNING id,status",[tenant.id,orderId,input.status,professional]);
  });
  response.json(result);
};
