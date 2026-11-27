import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Flags } from '../../../shared/features.js';
import { activeAccount,setSession } from '../middlewares/auth.middleware.js';
import { effective, settings, tenantById, type Tenant } from '../services/tenant.service.js';
import { one, pool, transaction, type Db } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { controls, id, newTenant, ownerEmail,password,tenantControls } from '../schemas/index.js';

async function audit(db: Db, actorId: string, tenantId: string | null, event: string,target?:string) {
  await db.query('INSERT INTO audit_events (actor_id,tenant_id,event,target_user_id) VALUES ($1,$2,$3,$4)', [actorId, tenantId, event,target??null]);
}

const expose = (tenant: Tenant, global: Awaited<ReturnType<typeof settings>>) => ({
  id: tenant.id, slug: tenant.slug, name: tenant.name, kind: tenant.kind, status: tenant.status, ...effective(tenant, global),
  feature_flags: tenant.feature_flags, override_limit: tenant.limits.max_professionals ?? null,
});

export const platformDashboard: RequestHandler = async (_request, response) => {
  const [global, tenants, stats] = await Promise.all([
    settings(pool), pool.query<Tenant>('SELECT * FROM tenants ORDER BY name,id'),
    one(pool, `SELECT (SELECT count(*)::int FROM tenants WHERE status='ATIVO') AS active_tenants,
      (SELECT count(*)::int FROM users WHERE role='CLIENT') AS clients,
      (SELECT count(*)::int FROM appointments) AS appointments`),
  ]);
  response.json({ global: { ...effective(global, global), feature_flags: global.feature_flags, override_limit: global.limits.max_professionals ?? null }, tenants: tenants.rows.map(tenant => expose(tenant, global)), stats });
};

function patchFlags(current: Partial<Flags>, patch: { [K in keyof Flags]?: boolean | null }) {
  const result = { ...current };
  for (const key of Object.keys(patch) as (keyof Flags)[]) {
    const value = patch[key];
    if (value === null) delete result[key];
    else if (value !== undefined) result[key] = value;
  }
  return result;
}

export const setGlobal: RequestHandler = async (request, response) => {
  const input = controls.parse(request.body);
  const actorId = request.identity!.actor.id;
  await transaction(async db => {
    const row = await one<Awaited<ReturnType<typeof settings>>>(db, 'SELECT feature_flags,limits FROM platform_settings WHERE id=true FOR UPDATE');
    if (!row) throw new HttpError(503, 'Configuração da plataforma indisponível.');
    const limit = input.max_professionals === undefined ? row.limits.max_professionals : input.max_professionals;
    await db.query('UPDATE platform_settings SET feature_flags=$1,limits=$2 WHERE id=true', [patchFlags(row.feature_flags, input.feature_flags), limit === null ? {} : { max_professionals: limit }]);
    await audit(db, actorId, null, 'GLOBAL_CONTROLS_UPDATED');
  });
  response.status(204).end();
};

export const setTenantControls: RequestHandler = async (request, response) => {
  const tenantId = id.parse(request.params.id);
  const input = tenantControls.parse(request.body);
  const actorId = request.identity!.actor.id;
  const updated = await transaction(async db => {
    const global = await settings(db, true);
    const row = await tenantById(db, tenantId, true);
    if (!row) throw new HttpError(404, 'Estabelecimento não encontrado.');
    const limit = input.max_professionals === undefined ? row.limits.max_professionals : input.max_professionals;
    const tenant = (await one<Tenant>(db, 'UPDATE tenants SET status=$2, feature_flags=$3, limits=$4 WHERE id=$1 RETURNING *', [tenantId, input.status ?? row.status, patchFlags(row.feature_flags, input.feature_flags), limit === null ? {} : { max_professionals: limit }]))!;
    await audit(db, actorId, tenantId, 'TENANT_CONTROLS_UPDATED');
    return expose(tenant, global);
  });
  response.json(updated);
};

export const createTenant: RequestHandler = async (request, response) => {
  const input = newTenant.parse(request.body);
  const actorId = request.identity!.actor.id;
  const hash = await bcrypt.hash(input.owner.password, 12);
  const row = await transaction(async db => {
    const global = await settings(db, true);
    const tenant = (await one<Tenant>(db, 'INSERT INTO tenants (slug,name,kind,timezone) VALUES ($1,$2,$3,$4) RETURNING *', [input.slug, input.name, input.kind, input.timezone]))!;
    await db.query(`INSERT INTO users (tenant_id,role,name,phone,password_hash,email) VALUES ($1,'OWNER',$2,$3,$4,$5)`, [tenant.id, input.owner.name, input.owner.phone, hash,input.owner.email??null]);
    await audit(db, actorId, tenant.id, 'TENANT_CREATED');
    return expose(tenant, global);
  });
  response.status(201).json(row);
};

export const createOwner:RequestHandler=async(request,response,next)=>{
  const body=newTenant.parse(request.body);
  ownerEmail.parse(body.owner.email);
  await createTenant(request,response,next);
};

const accountQuery=z.strictObject({q:z.string().trim().max(100).default(''),role:z.enum(['OWNER','STAFF','CLIENT']).optional(),
  page:z.coerce.number().int().min(1).max(1000).default(1)});
export const listAccounts:RequestHandler=async(request,response)=>{
  const {q,role,page}=accountQuery.parse(request.query);
  const needle=q.replace(/[\\%_]/g,'\\$&');
  const {rows}=await pool.query(`SELECT u.id,u.name,u.phone,u.email,u.role,u.active,u.platform_blocked,t.name AS company,t.slug,t.status AS tenant_status
    FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.role IN ('OWNER','STAFF','CLIENT')
    AND ($1::text IS NULL OR u.role=$1)
    AND ($2='' OR concat_ws(' ',u.name,u.email,u.phone,t.name,t.slug) ILIKE '%'||$2||'%' OR ($3<>'' AND u.phone LIKE '%'||$3||'%'))
    ORDER BY u.name,u.id LIMIT 26 OFFSET $4`,[role??null,needle,q.replace(/\D/g,''),(page-1)*25]);
  response.json({items:rows.slice(0,25),has_more:rows.length>25});
};

const accountPatch=z.union([z.strictObject({blocked:z.boolean()}),z.strictObject({password})]);
export const updateAccount:RequestHandler=async(request,response)=>{
  const account=id.parse(request.params.id);
  const data=accountPatch.parse(request.body);
  const hash='password' in data?await bcrypt.hash(data.password,12):null;
  const blocked='blocked' in data?data.blocked:null;
  await transaction(async db=>{
    const row=await one<{tenant_id:string}>(db,`UPDATE users SET platform_blocked=coalesce($2,platform_blocked),
      password_hash=coalesce($3,password_hash),token_version=token_version+1 WHERE id=$1 AND role<>'SUPER_ADMIN' RETURNING tenant_id`,
    [account,blocked,hash]);
    if(!row)throw new HttpError(404,'Conta não encontrada.');
    await db.query('DELETE FROM password_reset_tokens WHERE user_id=$1',[account]);
    await audit(db,request.identity!.actor.id,row.tenant_id,hash?'ACCOUNT_PASSWORD_RESET':blocked?'ACCOUNT_BLOCKED':'ACCOUNT_UNBLOCKED',account);
  });
  response.status(204).end();
};

export const impersonate:RequestHandler=async(request,response)=>{
  const {user_id}=z.strictObject({user_id:id}).parse(request.body);
  const target=await activeAccount(user_id);
  if(!target?.tenant_id||target.role==='SUPER_ADMIN')throw new HttpError(404,'Conta disponível não encontrada.');
  const tenant=await tenantById(pool,target.tenant_id);
  if(tenant?.status!=='ATIVO')throw new HttpError(409,'O estabelecimento está suspenso.');
  const {actor}=request.identity!;
  await audit(pool,actor.id,tenant.id,'ACCOUNT_SUPPORT_STARTED',target.id);
  await setSession(response,actor,tenant.id,target);
  const redirect_to=target.role==='CLIENT'?`/loja/${tenant.slug}/conta`:target.role==='STAFF'?'/admin/agenda':'/admin';
  response.json({redirect_to});
};

export const support: RequestHandler = async (request, response) => {
  const tenantId = id.parse(request.params.id);
  const actor = request.identity!.actor;
  const tenant = await tenantById(pool, tenantId);
  if (!tenant) throw new HttpError(404, 'Estabelecimento não encontrado.');
  await audit(pool, actor.id, tenantId, 'SUPPORT_STARTED');
  await setSession(response, actor, tenantId);
  response.json({ slug: tenant.slug });
};

export const exitSupport: RequestHandler = async (request, response) => {
  const identity = request.identity!;
  const operator=identity.operator??identity.actor;
  if (!identity.impersonating || operator.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Sessão de suporte não está ativa.');
  await audit(pool,operator.id,identity.tenant?.id??null,'SUPPORT_ENDED',identity.operator?identity.actor.id:undefined);
  await setSession(response,operator);
  response.status(204).end();
};
