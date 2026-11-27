import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import { activeTenant, tenantBySlug, type Tenant } from '../services/tenant.service.js';
import { clearSession, setSession, type Account } from '../middlewares/auth.middleware.js';
import { one, pool, transaction } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { login, profile, registration, slug } from '../schemas/index.js';

// Static comparison hash keeps timing similar for unknown accounts.
const fallback = '$2b$12$0Gl/Z65mDfULAS9w6bQ.0OdgOXt6fHtTCFVED957mHS/l7mdAjG7e';
const accountFields = 'id, tenant_id, role, name, phone, professional_id, token_version';

export const signIn: RequestHandler = async (request, response) => {
  const input = login.parse(request.body);
  const tenant = request.params.slug ? activeTenant(await tenantBySlug(pool, slug.parse(request.params.slug))) : null;
  const account = await one<Account & { password_hash: string }>(pool, `SELECT ${accountFields}, password_hash FROM users u WHERE tenant_id IS NOT DISTINCT FROM $1::uuid AND phone=$2 AND active
    AND (role <> 'STAFF' OR EXISTS (SELECT 1 FROM professionals p WHERE p.tenant_id=u.tenant_id AND p.id=u.professional_id AND p.active AND p.deleted_at IS NULL))`, [tenant?.id ?? null, input.phone]);
  const valid = await bcrypt.compare(input.password, account?.password_hash ?? fallback);
  if (!account || !valid) throw new HttpError(401, 'Telefone ou senha incorretos.');
  const { password_hash: _secret, token_version, ...user } = account;
  await setSession(response, {...user,token_version});
  response.json({ ...user, slug: tenant?.slug ?? null, impersonating: false });
};

export const signUp: RequestHandler = async (request, response) => {
  const input = registration.parse(request.body);
  const code = slug.parse(request.params.slug);
  const hash = await bcrypt.hash(input.password, 12);
  const account = await transaction(async db => {
    const tenant = activeTenant(await one<Tenant>(db, 'SELECT * FROM tenants WHERE slug=$1 FOR SHARE', [code]));
    return (await one<Account>(db, `INSERT INTO users (tenant_id, role, name, phone, password_hash) VALUES ($1,'CLIENT',$2,$3,$4) RETURNING ${accountFields}`, [tenant.id, input.name, input.phone, hash]))!;
  });
  await setSession(response, account);
  const {token_version:_version,...user}=account;
  response.status(201).json({ ...user, slug: code, impersonating: false });
};

export const session: RequestHandler = (request, response) => {
  const { actor, role, tenant, impersonating } = request.identity!;
  response.json({ id: actor.id, role, tenant_id: tenant?.id ?? null, name: actor.name, phone: actor.phone, slug: tenant?.slug ?? null, impersonating, professional_id: actor.professional_id });
};

export const signOut: RequestHandler = (_request, response) => { clearSession(response); response.status(204).end(); };

export const editProfile: RequestHandler = async (request, response) => {
  const { name, phone } = profile.parse(request.body);
  const scope = request.scope!;
  const actor = request.identity!.actor;
  const user = await one<Account>(pool, `UPDATE users SET name=$1, phone=$2 WHERE id=$3 AND tenant_id=$4 AND role='CLIENT' AND active RETURNING ${accountFields}`, [name, phone, actor.id, scope.tenant.id]);
  if (!user) throw new HttpError(404, 'Perfil não encontrado.');
  const {token_version:_version,...account}=user;
  response.json({ ...account, slug: scope.tenant.slug, impersonating: false });
};
