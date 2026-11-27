import type { z } from 'zod';
import { one, type Db } from '../lib/db.js';
import { HttpError } from '../../backend/src/middlewares/error.middleware.js';
import type { loyaltyConfig } from '../../backend/src/schemas/index.js';

export type Loyalty = z.infer<typeof loyaltyConfig>;
export const defaultLoyalty: Loyalty = { is_active:false, program_name:'Clube Fidelidade', accumulation_type:'STAMPS_PER_SERVICE', include_products:false,
  points_per_real:1, min_spend_amount:0, target_value:10, reward_type:'DISCOUNT_FIXED', reward_value:1000, reward_reference_id:null, points_expiration_days:0, rules_description:'' };

export async function loyaltySettings(db: Db, tenant: string) {
  return await one<Loyalty>(db, `SELECT is_active, program_name, accumulation_type, include_products, points_per_real, min_spend_amount, target_value,
    reward_type,reward_value,reward_reference_id,points_expiration_days,rules_description FROM loyalty_config WHERE tenant_id=$1`, [tenant]) ?? defaultLoyalty;
}

export async function reward(db: Db, tenant: string, config: Loyalty) {
  const table = config.reward_type === 'FREE_SERVICE' ? 'services' : config.reward_type === 'FREE_PRODUCT' ? 'products' : null;
  const item = table && config.reward_reference_id ? await one<{ name: string; available:boolean }>(db, `SELECT name,${table==='products'?'stock_quantity>0':'true'} AS available
    FROM ${table} WHERE tenant_id=$1 AND id=$2 AND active AND deleted_at IS NULL`, [tenant, config.reward_reference_id]) : null;
  return { type: config.reward_type, value: config.reward_value, reference_id: config.reward_reference_id, item_name: item?.name ?? null, available: !table || Boolean(item?.available) };
}

export async function credits(db: Db, tenant: string, client: string) {
  return (await db.query<{ id: string; remaining: number }>(`SELECT c.id,(c.delta - COALESCE(SUM(a.units),0))::int AS remaining
    FROM loyalty_transactions c LEFT JOIN loyalty_allocations a ON (a.tenant_id,a.client_id,a.credit_id)=(c.tenant_id,c.client_id,c.id)
    WHERE c.tenant_id=$1 AND c.client_id=$2 AND c.delta>0 AND (c.expires_at IS NULL OR c.expires_at>now())
      AND c.accumulation_type=coalesce((SELECT accumulation_type FROM loyalty_config WHERE tenant_id=$1),'STAMPS_PER_SERVICE')
    GROUP BY c.id HAVING c.delta > COALESCE(SUM(a.units),0) ORDER BY c.expires_at NULLS LAST,c.created_at,c.id`, [tenant, client])).rows;
}

export async function creditCompletion(db: Db, input: { tenant: string; client: string | null; kind: 'ORDER' | 'APPOINTMENT'; source: string; total: number }) {
  if (!input.client) return;
  const config = await loyaltySettings(db, input.tenant);
  if (!config.is_active || input.total < config.min_spend_amount || (input.kind === 'ORDER' && !config.include_products)) return;
  const delta = config.accumulation_type === 'STAMPS_PER_SERVICE' ? 1 : Math.floor(input.total * config.points_per_real / 100);
  if (!delta) return;
  await db.query(`INSERT INTO loyalty_transactions (tenant_id,client_id,kind,source_id,delta,reason,expires_at,accumulation_type)
    VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $7::int>0 THEN now()+make_interval(days=>$7) END,$8) ON CONFLICT DO NOTHING`,
    [input.tenant,input.client,input.kind,input.source,delta,input.kind === 'ORDER' ? 'Pedido concluído' : 'Atendimento concluído',config.points_expiration_days,config.accumulation_type]);
}

export async function changeBalance(db: Db, input: { tenant: string; client: string; actor: string; delta?: number; reason?: string; redeem?: boolean }) {
  const { tenant, client, actor } = input;
  if (!await one(db, `SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND role='CLIENT' AND active`, [tenant,client])) throw new HttpError(404,'Cliente não encontrado.');
  const config = await loyaltySettings(db,tenant);
  if (!config.is_active) throw new HttpError(409,'Ative o programa antes de movimentar o saldo.');
  const prize = input.redeem ? await reward(db, tenant, config) : null;
  if (prize && !prize.available) throw new HttpError(409,'O item do prêmio está indisponível.');
  const delta = input.redeem ? -config.target_value : input.delta!;
  const lots = delta < 0 ? await credits(db, tenant, client) : [];
  if (delta < 0 && lots.reduce((sum,item) => sum + item.remaining,0) < -delta) throw new HttpError(409,'O cliente não tem saldo disponível suficiente.');
  const row = (await one<{ id: string }>(db, `INSERT INTO loyalty_transactions (tenant_id,client_id,actor_id,kind,delta,reason,reward_snapshot,expires_at,accumulation_type)
    VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $5::int>0 AND $8::int>0 THEN now()+make_interval(days=>$8) END,$9) RETURNING id`,
    [tenant,client,actor,input.redeem?'REDEMPTION':'ADJUSTMENT',delta,input.reason ?? 'Prêmio resgatado',prize,config.points_expiration_days,config.accumulation_type]))!;
  let remaining = -delta;
  for (const lot of lots) {
    if (!remaining) break;
    const units = Math.min(remaining,lot.remaining);
    await db.query('INSERT INTO loyalty_allocations (tenant_id,client_id,debit_id,credit_id,units) VALUES ($1,$2,$3,$4,$5)',[tenant,client,row.id,lot.id,units]);
    remaining -= units;
  }
  if(prize?.type==='FREE_PRODUCT'&&prize.reference_id){
    const stock=await db.query('UPDATE products SET stock_quantity=stock_quantity-1 WHERE tenant_id=$1 AND id=$2 AND stock_quantity>0',[tenant,prize.reference_id]);
    if(!stock.rowCount)throw new HttpError(409,'O produto do prêmio está sem estoque.');
    await db.query("INSERT INTO stock_movements(tenant_id,product_id,delta,reason) VALUES($1,$2,-1,'FIDELIDADE')",[tenant,prize.reference_id]);
  }
  return { id:row.id, delta, reward:prize };
}
