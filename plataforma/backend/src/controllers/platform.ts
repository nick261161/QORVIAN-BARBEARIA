import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import type { Flags } from '../../../shared/features.js';
import { setSession } from '../middlewares/auth.middleware.js';
import { effective, settings, tenantById, type Tenant } from '../services/tenant.service.js';
import { one, pool, transaction, type Db } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { controls, id, newTenant, tenantControls } from '../schemas/index.js';

async function audit(db: Db, actorId: string, tenantId: string | null, event: string) {
  await db.query('INSERT INTO audit_events (actor_id,tenant_id,event) VALUES ($1,$2,$3)', [actorId, tenantId, event]);
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
    await db.query(`INSERT INTO users (tenant_id,role,name,phone,password_hash) VALUES ($1,'OWNER',$2,$3,$4)`, [tenant.id, input.owner.name, input.owner.phone, hash]);
    await audit(db, actorId, tenant.id, 'TENANT_CREATED');
    return expose(tenant, global);
  });
  response.status(201).json(row);
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
  if (!identity.impersonating || identity.actor.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Sessão de suporte não está ativa.');
  await audit(pool, identity.actor.id, identity.tenant?.id ?? null, 'SUPPORT_ENDED');
  await setSession(response, identity.actor);
  response.status(204).end();
};
