import type { RequestHandler } from 'express';
import { z } from 'zod';
import { changeBalance, credits, loyaltySettings, reward } from '../services/loyalty.service.js';
import { assertFeature, scopedTenant } from '../services/tenant.service.js';
import { one, pool, transaction } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { id, loyaltyAdjustment, loyaltyConfig } from '../schemas/index.js';

export const getLoyalty: RequestHandler = async (request,response) => {
  const tenant=request.scope!.tenant.id;
  const config=await loyaltySettings(pool,tenant);
  const prize=await reward(pool,tenant,config);
  response.json({...config,reward:prize});
};

export const setLoyalty: RequestHandler = async (request,response) => {
  const settings = loyaltyConfig.parse(request.body);
  await transaction(async db => {
    const {tenant,flags}=await scopedTenant(db,request.scope!.tenant.id,true,request.identity!.impersonating);
    assertFeature(flags,'enable_loyalty_club');
    if (settings.reward_reference_id && !(await reward(db,tenant.id,settings)).item_name) throw new HttpError(400,'Selecione um prêmio ativo deste estabelecimento.');
    await db.query(`INSERT INTO loyalty_config (tenant_id,is_active,program_name,accumulation_type,include_products,points_per_real,min_spend_amount,target_value,reward_type,reward_value,reward_reference_id,points_expiration_days,rules_description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (tenant_id) DO UPDATE SET is_active=excluded.is_active,program_name=excluded.program_name,
      accumulation_type=excluded.accumulation_type,include_products=excluded.include_products,points_per_real=excluded.points_per_real,min_spend_amount=excluded.min_spend_amount,target_value=excluded.target_value,
      reward_type=excluded.reward_type,reward_value=excluded.reward_value,reward_reference_id=excluded.reward_reference_id,points_expiration_days=excluded.points_expiration_days,rules_description=excluded.rules_description`,
    [tenant.id,settings.is_active,settings.program_name,settings.accumulation_type,settings.include_products,settings.points_per_real,settings.min_spend_amount,settings.target_value,settings.reward_type,settings.reward_value,settings.reward_reference_id,settings.points_expiration_days,settings.rules_description]);
  });
  response.status(204).end();
};

export function wallet(owner = false): RequestHandler {
  return async (request,response) => {
    const tenant=request.scope!.tenant.id;
    const client=owner?id.parse(request.params.id):request.identity!.actor.id;
    const page=z.coerce.number().int().min(1).max(10000).default(1).parse(request.query.page);
    if (owner && !await one(pool,"SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND role='CLIENT'",[tenant,client])) throw new HttpError(404,'Cliente não encontrado.');
    const [config,lots,list]=await Promise.all([loyaltySettings(pool,tenant),credits(pool,tenant,client),pool.query(`SELECT id,kind,delta,reason,expires_at,created_at,reward_snapshot,accumulation_type FROM loyalty_transactions
      WHERE tenant_id=$1 AND client_id=$2 ORDER BY created_at DESC,id LIMIT 51 OFFSET $3`,[tenant,client,(page-1)*50])]);
    const balance=lots.reduce((sum,item)=>sum+item.remaining,0);
    response.json({config,balance,eligible:config.is_active&&balance>=config.target_value&&(await reward(pool,tenant,config)).available,items:list.rows.slice(0,50),has_more:list.rows.length>50});
  };
}

export function adjust(redeem = false): RequestHandler {
  return async (request,response) => {
    const client=id.parse(request.params.id);
    const values=redeem?{}:loyaltyAdjustment.parse(request.body);
    const result=await transaction(async db=>{
      const {tenant,flags}=await scopedTenant(db,request.scope!.tenant.id,true,request.identity!.impersonating);
      assertFeature(flags,'enable_loyalty_club');
      return changeBalance(db,{tenant:tenant.id,client,actor:request.identity!.actor.id,redeem,...values});
    });
    response.status(201).json(result);
  };
}
