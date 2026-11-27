import type { CookieOptions, RequestHandler, Response } from 'express';
import { jwtVerify,SignJWT } from 'jose';
import { z } from 'zod';
import type { Role } from '../../../shared/features.js';
import { scopedTenant, type Tenant } from '../services/tenant.service.js';
import { config } from '../config/env.js';
import { one, pool } from '../config/database.js';
import { HttpError } from './error.middleware.js';
import { slug } from '../schemas/index.js';

export type Account = { id: string; tenant_id: string | null; role: Role; name: string; phone: string; professional_id: string | null; token_version?:number };
type Identity = { actor: Account; role: Role; tenant?: Tenant; impersonating: boolean };

declare global {
  namespace Express { interface Request { identity?: Identity; scope?: Awaited<ReturnType<typeof scopedTenant>> } }
}

export const cookie = config.secure ? '__Host-agenda_session' : 'agenda_session';
const cookieOptions: CookieOptions = { path: '/', httpOnly: true, secure: config.secure, sameSite: 'lax' };
const claims = z.object({ sub: z.uuid(), support: z.uuid().optional(), exp: z.number(), version:z.number().int().min(0).default(0) });
const secret=new TextEncoder().encode(config.JWT_SECRET);

export async function setSession(response: Response, account: Account, support?: string) {
  const seconds = support ? 20 * 60 : 8 * 60 * 60;
  const token=await new SignJWT({version:account.token_version??0,...(support?{support}:{})}).setProtectedHeader({alg:'HS256'}).setIssuer('agenda').setAudience('agenda-web')
    .setSubject(account.id).setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)+seconds).sign(secret);
  response.cookie(cookie, token, { ...cookieOptions, maxAge: seconds * 1000 });
}

export function clearSession(response: Response) { response.clearCookie(cookie, cookieOptions); }

export async function verifySession(token:string|undefined):Promise<Identity>{
  if (!token) throw new HttpError(401, 'Entre para continuar.');
  let payload;
  try { payload = claims.parse((await jwtVerify(token,secret,{algorithms:['HS256'],issuer:'agenda',audience:'agenda-web'})).payload); }
  catch { throw new HttpError(401, 'Sua sessão expirou. Entre novamente.'); }
  const actor = await one<Account>(pool, `SELECT u.id,u.tenant_id,u.role,u.name,u.phone,u.professional_id,u.token_version FROM users u WHERE u.id=$1 AND u.active
    AND (u.role <> 'STAFF' OR EXISTS (SELECT 1 FROM professionals p WHERE p.tenant_id=u.tenant_id AND p.id=u.professional_id AND p.active AND p.deleted_at IS NULL))`, [payload.sub]);
  if (!actor || actor.token_version!==payload.version) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
  if (payload.support && actor.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Sessão de suporte inválida.');
  const tenantId = payload.support ?? actor.tenant_id;
  const tenant = tenantId ? await one<Tenant>(pool, 'SELECT * FROM tenants WHERE id=$1', [tenantId]) : undefined;
  if (tenantId && (!tenant || (tenant.status !== 'ATIVO' && !payload.support))) throw new HttpError(403, 'Estabelecimento indisponível.');
  return {actor,role:payload.support?'OWNER':actor.role,tenant,impersonating:Boolean(payload.support)};
}

export const requireAuth: RequestHandler = async (request, _response, next) => {
  request.identity=await verifySession(request.cookies[cookie]);
  next();
};

export function requireRole(role: Role): RequestHandler {
  return (request, _response, next) => {
    if (request.identity?.role !== role) throw new HttpError(403, 'Você não tem acesso a esta área.');
    next();
  };
}

export const requireTenant: RequestHandler = async (request, _response, next) => {
  const code = slug.parse(request.params.slug);
  const tenant = request.identity?.tenant;
  if (!tenant || tenant.slug !== code) throw new HttpError(404, 'Estabelecimento não encontrado.');
  request.scope = await scopedTenant(pool, tenant.id, false, request.identity?.impersonating);
  next();
};

