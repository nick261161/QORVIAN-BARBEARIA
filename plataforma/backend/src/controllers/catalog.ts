import type { RequestHandler } from 'express';
import { assertFeature } from '../services/tenant.service.js';
import { one,pool } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { id,product,service } from '../schemas/index.js';
import { exists,write } from './owner-scope.js';
import { assertMediaUrl,queueRetiredMedia } from '../../../src/lib/storage.js';

export function catalog(table: 'services' | 'products') {
  const isService = table === 'services';
  const feature = isService ? undefined : 'enable_products_store';
  const columns = `id,name,description,category,photo,price_cents,active${isService ? ',duration_minutes,custom_commission_rate' : ',sku,stock_quantity,commission_rate'}`;
  const list: RequestHandler = async (request, response) => {
    response.json((await pool.query(`SELECT ${columns} FROM ${table} WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY name,id`, [request.scope!.tenant.id])).rows);
  };
  const save: RequestHandler = async (request, response) => {
    const input = (isService ? service : product).parse(request.body);
    const record = request.params.id ? id.parse(request.params.id) : null;
    const row = await write(request, async (db, { tenant,flags }) => {
      const previous=record?exists(await one<{photo:string}>(db,`SELECT photo FROM ${table} WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL`,[tenant.id,record])).photo:'';
      if(input.photo!==previous)await assertMediaUrl(db,tenant.id,input.photo);
      const fields: Record<string,string|number|boolean|null|undefined> = { name:input.name,description:input.description,category:input.category,photo:input.photo,price_cents:input.price_cents,active:input.active };
      let stockDifference=0;
      if ('duration_minutes' in input) {
        const serviceInput=service.parse(input);
        fields.duration_minutes=serviceInput.duration_minutes;
        if (serviceInput.custom_commission_rate!==undefined) { assertFeature(flags,'enable_commissions'); fields.custom_commission_rate=serviceInput.custom_commission_rate; }
        if (input.category) await db.query('INSERT INTO service_categories(tenant_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',[tenant.id,input.category]);
      } else {
        const productInput=product.parse(input);
        fields.sku=productInput.sku;
        if (productInput.commission_rate!==undefined) { assertFeature(flags,'enable_commissions'); fields.commission_rate=productInput.commission_rate; }
        if (productInput.stock_quantity!==undefined) {
          const current=record?exists(await one<{stock_quantity:number}>(db,'SELECT stock_quantity FROM products WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE',[tenant.id,record])).stock_quantity:0;
          if (record && productInput.stock_expected!==current) throw new HttpError(409,'O estoque mudou. Atualize os dados e tente novamente.');
          fields.stock_quantity=productInput.stock_quantity;
          stockDifference=productInput.stock_quantity-current;
        }
      }
      const entries=Object.entries(fields).filter(([,value])=>value!==undefined);
      const values=[tenant.id,...entries.map(([,value])=>value)];
      const names=entries.map(([key])=>key);
      let saved;
      if (!record) {
        saved=exists(await one<{id:string}>(db, `INSERT INTO ${table} (tenant_id,${names.join(',')}) VALUES (${values.map((_, index) => `$${index + 1}`).join(',')}) RETURNING ${columns}`, values));
      } else {
        saved=exists(await one<{id:string}>(db, `UPDATE ${table} SET ${names.map((key,index)=>`${key}=$${index+2}`).join(',')}
          WHERE tenant_id=$1 AND id=$${values.length + 1} AND deleted_at IS NULL RETURNING ${columns}`, [...values, record]));
      }
      if (stockDifference) await db.query("INSERT INTO stock_movements (tenant_id,product_id,delta,reason) VALUES ($1,$2,$3,'AJUSTE')",[tenant.id,saved.id,stockDifference]);
      if(previous!==input.photo)await queueRetiredMedia(db,tenant.id,[previous]);
      return saved;
    }, feature);
    response.status(record ? 200 : 201).json(row);
  };
  const remove: RequestHandler = async (request, response) => {
    const record = id.parse(request.params.id);
    await write(request, async (db, { tenant }) => {
      const {photo}=exists(await one<{photo:string}>(db,`UPDATE ${table} SET active=false,deleted_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING photo`,[tenant.id,record]));
      await queueRetiredMedia(db,tenant.id,[photo]);
    },feature);
    response.status(204).end();
  };
  return { list, save, remove };
}
