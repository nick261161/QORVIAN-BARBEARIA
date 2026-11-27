import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import { activeTenant, tenantBySlug, type Tenant } from '../services/tenant.service.js';
import { clearSession, setSession, type Account } from '../middlewares/auth.middleware.js';
import { one, pool, transaction } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { login,password, profile,recoverPhone,redeemPhoneCode,registration, slug } from '../schemas/index.js';
import {z} from 'zod';
import {issuePhoneCode,resetPhonePassword} from '../../../src/services/password-reset.service.js';

// Static comparison hash keeps timing similar for unknown accounts.
const fallback = '$2b$12$0Gl/Z65mDfULAS9w6bQ.0OdgOXt6fHtTCFVED957mHS/l7mdAjG7e';
const accountFields = 'id, tenant_id, role, name, phone, professional_id, token_version';

export const signIn: RequestHandler = async (request, response) => {
  const input = login.parse(request.body);
  const tenant = request.params.slug ? activeTenant(await tenantBySlug(pool, slug.parse(request.params.slug))) : null;
  const {rows}=await pool.query<Account & {password_hash:string;shop_slug:string|null}>(`SELECT
    u.id,u.tenant_id,u.role,u.name,u.phone,u.professional_id,u.token_version,u.password_hash,t.slug AS shop_slug
    FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id
    WHERE u.phone=$1 AND u.active AND NOT u.platform_blocked AND (u.tenant_id IS NULL OR t.status='ATIVO')
    AND ($2::uuid IS NULL OR u.tenant_id=$2 OR u.role='SUPER_ADMIN')
    AND (u.role<>'STAFF' OR EXISTS(SELECT 1 FROM professionals p WHERE p.tenant_id=u.tenant_id AND p.id=u.professional_id AND p.active AND p.deleted_at IS NULL))
    ORDER BY (u.role='SUPER_ADMIN') DESC,u.id LIMIT 12`,[input.phone,tenant?.id??null]);
  if(!rows.length)await bcrypt.compare(input.password,fallback);
  let account:typeof rows[number]|undefined;
  for(const candidate of rows){
    if(!(await bcrypt.compare(input.password,candidate.password_hash)))continue;
    if(candidate.role==='SUPER_ADMIN'){account=candidate;break;}
    if(account)throw new HttpError(409,'Há mais de uma conta com esse acesso. Entre pelo link do estabelecimento.');
    account=candidate;
  }
  if(!account)throw new HttpError(401,'Telefone ou senha incorretos.');
  const { password_hash: _secret, token_version, shop_slug, ...user } = account;
  await setSession(response, {...user,token_version});
  response.json({ ...user,slug:shop_slug, impersonating:false,redirect_to:destination(user.role,shop_slug) });
};

export function destination(role:Account['role'],shop:string|null){
  if(role==='SUPER_ADMIN')return '/master';
  if(role==='OWNER')return '/admin';
  if(role==='STAFF')return '/admin/agenda';
  return shop&&shop!==(process.env.DEFAULT_TENANT_SLUG??'navalha-e-cia')?`/loja/${shop}/conta`:'/minha-conta';
}

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
  response.status(201).json({ ...user, slug: code, impersonating: false,redirect_to:destination('CLIENT',code) });
};

export const session: RequestHandler = (request, response) => {
  const { actor, role, tenant, impersonating,operator } = request.identity!;
  response.json({ id: actor.id, role, tenant_id: tenant?.id ?? null, name: actor.name, phone: actor.phone, slug: tenant?.slug ?? null,
    impersonating,read_only_support:Boolean(operator),professional_id:actor.professional_id,redirect_to:destination(role,tenant?.slug??null) });
};

export const signOut: RequestHandler = (_request, response) => { clearSession(response); response.status(204).end(); };

export const forgotPassword:RequestHandler=async(request,response)=>{
  response.status(202).json(await issuePhoneCode(recoverPhone.parse(request.body)));
};

export const resetPassword:RequestHandler=async(request,response)=>{
  await resetPhonePassword(redeemPhoneCode.parse(request.body));response.status(204).end();
};

export const changeClientPassword:RequestHandler=async(request,response)=>{
  const {current_password,new_password}=z.strictObject({current_password:password,new_password:password}).parse(request.body);
  const {actor}=request.identity!;
  const version=await transaction(async db=>{
    const row=await one<{password_hash:string;token_version:number}>(db,`SELECT password_hash,token_version FROM users
      WHERE id=$1 AND tenant_id=$2 AND role='CLIENT' AND active AND NOT platform_blocked FOR UPDATE`,[actor.id,actor.tenant_id]);
    if(!row||row.token_version!==actor.token_version||!(await bcrypt.compare(current_password,row.password_hash)))
      throw new HttpError(403,'A senha atual está incorreta ou a sessão encerrou.');
    await db.query('UPDATE users SET password_hash=$2,token_version=token_version+1 WHERE id=$1',[actor.id,await bcrypt.hash(new_password,12)]);
    return row.token_version+1;
  });
  await setSession(response,{...actor,token_version:version});
  response.status(204).end();
};

export const editProfile: RequestHandler = async (request, response) => {
  const { name, phone } = profile.parse(request.body);
  const scope = request.scope!;
  const actor = request.identity!.actor;
  const user = await one<Account>(pool, `UPDATE users SET name=$1, phone=$2 WHERE id=$3 AND tenant_id=$4 AND role='CLIENT' AND active RETURNING ${accountFields}`, [name, phone, actor.id, scope.tenant.id]);
  if (!user) throw new HttpError(404, 'Perfil não encontrado.');
  const {token_version:_version,...account}=user;
  response.json({ ...account, slug: scope.tenant.slug, impersonating: false });
};
