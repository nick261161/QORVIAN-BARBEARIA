import type { RequestHandler } from 'express';
import { z } from 'zod';
import { listAppointments } from '../services/appointment.service.js';
import { loyaltySettings,reward } from '../services/loyalty.service.js';
import { one, pool } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { id, plain } from '../schemas/index.js';

const query=z.object({search:plain(100).default(''),filter:z.enum(['all','vip','inactive','reward']).default('all'),
  sort:z.enum(['name','spend','visits','last','balance']).default('name'),page:z.coerce.number().int().min(1).max(10000).default(1)});
const order={name:'name ASC',spend:'spent DESC',visits:'visits DESC',last:'last_visit DESC NULLS LAST',balance:'balance DESC'};

export const clients:RequestHandler=async(request,response)=>{
  const {search,filter,sort,page}=query.parse(request.query);
  const {tenant,flags}=request.scope!;
  const config=await loyaltySettings(pool,tenant.id);
  const eligible=flags.enable_loyalty_club&&config.is_active&&(await reward(pool,tenant.id,config)).available;
  const rows=(await pool.query(`WITH visits AS (
    SELECT client_id,count(*)::int AS visits,sum(total_cents) AS spent,max(completed_at) AS last_visit FROM appointments
    WHERE tenant_id=$1 AND client_id IS NOT NULL AND status='CONCLUIDO' GROUP BY client_id
  ), sales AS (SELECT client_id,sum(total_cents) AS spent FROM orders WHERE tenant_id=$1 AND status='CONCLUIDO' GROUP BY client_id),
  used AS (SELECT client_id,credit_id,sum(units) AS units FROM loyalty_allocations WHERE tenant_id=$1 GROUP BY client_id,credit_id),
  wallets AS (SELECT c.client_id,sum(c.delta-coalesce(used.units,0))::float8 AS balance FROM loyalty_transactions c LEFT JOIN used ON used.credit_id=c.id AND used.client_id=c.client_id
    WHERE c.tenant_id=$1 AND c.delta>0 AND (c.expires_at IS NULL OR c.expires_at>now()) AND c.accumulation_type=$8 GROUP BY c.client_id), totals AS (
    SELECT u.id,u.name,u.phone,u.created_at,coalesce(v.visits,0) AS visits,(coalesce(v.spent,0)+coalesce(s.spent,0))::float8 AS spent,v.last_visit,coalesce(w.balance,0) AS balance
    FROM users u LEFT JOIN visits v ON v.client_id=u.id LEFT JOIN sales s ON s.client_id=u.id LEFT JOIN wallets w ON w.client_id=u.id
    WHERE u.tenant_id=$1 AND u.role='CLIENT' AND (strpos(lower(u.name),lower($2))>0 OR ($3<>'' AND strpos(u.phone,$3)>0))
  ) SELECT id,name,phone,visits,spent,last_visit,balance,($4::boolean AND balance>=$5) AS eligible,(spent>=50000 OR visits>=10) AS vip
    FROM totals WHERE ($6='all' OR ($6='vip' AND (spent>=50000 OR visits>=10)) OR ($6='inactive' AND coalesce(last_visit,created_at)<now()-interval '30 days')
      OR ($6='reward' AND $4 AND balance>=$5)) ORDER BY ${order[sort]},id LIMIT 51 OFFSET $7`,
    [tenant.id,search,search.replace(/\D/g,''),eligible,config.target_value,filter,(page-1)*50,config.accumulation_type])).rows;
  response.json({items:rows.slice(0,50),has_more:rows.length>50});
};

export const clientHistory:RequestHandler=async(request,response)=>{
  const {tenant}=request.scope!;
  const client=id.parse(request.params.id);
  const page=z.coerce.number().int().min(1).max(10000).default(1).parse(request.query.page);
  const data=await one(pool,"SELECT id,name,phone FROM users WHERE tenant_id=$1 AND id=$2 AND role='CLIENT'",[tenant.id,client]);
  if (!data) throw new HttpError(404,'Cliente não encontrado.');
  const [visits,orders]=await Promise.all([listAppointments(tenant,{clientId:client},page),pool.query(`SELECT id,modality,status,total_cents::float8,created_at,completed_at FROM orders
    WHERE tenant_id=$1 AND client_id=$2 ORDER BY created_at DESC,id LIMIT 101 OFFSET $3`,[tenant.id,client,(page-1)*100])]);
  response.json({client:data,visits:visits.items,orders:orders.rows.slice(0,100),has_more:visits.has_more||orders.rows.length>100});
};
