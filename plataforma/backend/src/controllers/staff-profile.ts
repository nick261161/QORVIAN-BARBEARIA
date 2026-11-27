import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { one,pool,transaction } from '../config/database.js';
import { setSession } from '../middlewares/auth.middleware.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { id,range } from '../schemas/index.js';
import { scopedTenant } from '../services/tenant.service.js';
import { financialReport } from '../services/report.service.js';
import { assertMediaUrl,queueRetiredMedia } from '../../../src/lib/storage.js';
import { exists } from './owner-scope.js';

const profileFields=z.strictObject({
  photo:z.string().max(1024).optional(),current_password:z.string().max(72).optional(),
  new_password:z.string().min(8).max(72).refine(value=>Buffer.byteLength(value)<=72).optional(),
});
const passwordPair=(value:{current_password?:string;new_password?:string})=>Boolean(value.current_password)===Boolean(value.new_password);
const profile=profileFields.refine(passwordPair,'Informe a senha atual e a nova senha.');
const ownerProfile=profileFields.extend({professional_id:id.nullable().optional()}).refine(passwordPair,'Informe a senha atual e a nova senha.');

const ownerOnly=(request:Parameters<RequestHandler>[0])=>{
  const identity=request.identity!;
  if(identity.actor.role!=='OWNER'||identity.impersonating)throw new HttpError(403,'Apenas o titular pode acessar este perfil.');
  return identity.actor;
};

export const getOwnerProfile:RequestHandler=async(request,response)=>{
  const actor=ownerOnly(request);
  const [account,people]=await Promise.all([
    one(pool,'SELECT name,photo,professional_id FROM users WHERE tenant_id=$1 AND id=$2',[actor.tenant_id,actor.id]),
    pool.query(`SELECT p.id,p.name FROM professionals p WHERE p.tenant_id=$1 AND p.active AND p.deleted_at IS NULL AND NOT EXISTS
      (SELECT 1 FROM users u WHERE u.tenant_id=p.tenant_id AND u.professional_id=p.id AND u.id<>$2) ORDER BY p.name,p.id`,[actor.tenant_id,actor.id]),
  ]);
  response.json({...exists(account),professionals:people.rows});
};

export const editOwnerProfile:RequestHandler=async(request,response)=>{
  const actor=ownerOnly(request);
  const input=ownerProfile.parse(request.body);
  const hash=input.new_password?await bcrypt.hash(input.new_password,12):null;
  const result=await transaction(async db=>{
    const tenant=actor.tenant_id!;
    await scopedTenant(db,tenant,true);
    const current=exists(await one<{name:string;photo:string;professional_id:string|null;password_hash:string;token_version:number}>(db,
      "SELECT name,photo,professional_id,password_hash,token_version FROM users WHERE tenant_id=$1 AND id=$2 AND role='OWNER' AND active AND NOT platform_blocked FOR UPDATE",[tenant,actor.id]));
    if(current.token_version!==actor.token_version)throw new HttpError(401,'Entre novamente para continuar.');
    if(hash&&!(await bcrypt.compare(input.current_password!,current.password_hash)))throw new HttpError(403,'A senha atual está incorreta.');
    const person=input.professional_id===undefined?current.professional_id:input.professional_id;
    if(person!==current.professional_id){
      const connected=current.professional_id&&await one(db,'SELECT id FROM professionals WHERE tenant_id=$1 AND id=$2 AND google_refresh_token IS NOT NULL',[tenant,current.professional_id]);
      if(connected)throw new HttpError(409,'Desconecte o Google Agenda antes de trocar o profissional.');
      if(person&&!await one(db,`SELECT p.id FROM professionals p WHERE p.tenant_id=$1 AND p.id=$2 AND p.active AND p.deleted_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM users u WHERE u.tenant_id=p.tenant_id AND u.professional_id=p.id)`,[tenant,person]))
        throw new HttpError(409,'Esse profissional já está vinculado ou indisponível.');
    }
    const photo=input.photo??current.photo;
    if(photo&&photo!==current.photo)await assertMediaUrl(db,tenant,photo,actor.id);
    const saved=exists(await one<{name:string;photo:string;professional_id:string|null;token_version:number}>(db,`UPDATE users
      SET photo=$3,professional_id=$4,password_hash=coalesce($5,password_hash),token_version=token_version+CASE WHEN $5::text IS NULL THEN 0 ELSE 1 END
      WHERE tenant_id=$1 AND id=$2 RETURNING name,photo,professional_id,token_version`,[tenant,actor.id,photo,person,hash]));
    if(photo!==current.photo)await queueRetiredMedia(db,tenant,[current.photo]);
    return saved;
  });
  if(hash)await setSession(response,{...actor,token_version:result.token_version});
  response.json({name:result.name,photo:result.photo,professional_id:result.professional_id});
};

export const getStaffProfile:RequestHandler=async(request,response)=>{
  const actor=request.identity!.actor;
  response.json(exists(await one(pool,'SELECT id,name,photo FROM professionals WHERE tenant_id=$1 AND id=$2',[actor.tenant_id,actor.professional_id])));
};

export const editStaffProfile:RequestHandler=async(request,response)=>{
  const input=profile.parse(request.body);
  const actor=request.identity!.actor;
  const nextHash=input.new_password?await bcrypt.hash(input.new_password,12):null;
  const result=await transaction(async db=>{
    await scopedTenant(db,actor.tenant_id!,true);
    const current=exists(await one<{photo:string;name:string;password_hash:string;token_version:number}>(db,`SELECT p.photo,p.name,u.password_hash,u.token_version
      FROM professionals p JOIN users u ON u.tenant_id=p.tenant_id AND u.professional_id=p.id
      WHERE p.tenant_id=$1 AND p.id=$2 AND u.id=$3 AND u.active AND u.role='STAFF' AND p.active AND p.deleted_at IS NULL FOR UPDATE OF u`,
    [actor.tenant_id,actor.professional_id,actor.id]));
    if(current.token_version!==actor.token_version)throw new HttpError(401,'Entre novamente para continuar.');
    if(nextHash&&!(await bcrypt.compare(input.current_password!,current.password_hash)))throw new HttpError(403,'A senha atual está incorreta.');
    if(input.photo!==undefined&&input.photo!==current.photo){
      if(input.photo)await assertMediaUrl(db,actor.tenant_id!,input.photo,actor.id);
      await db.query('UPDATE professionals SET photo=$3 WHERE tenant_id=$1 AND id=$2',[actor.tenant_id,actor.professional_id,input.photo]);
      await queueRetiredMedia(db,actor.tenant_id!,[current.photo]);
    }
    if(nextHash)await db.query("UPDATE users SET password_hash=$3,token_version=token_version+1 WHERE tenant_id=$1 AND id=$2 AND role='STAFF'",[actor.tenant_id,actor.id,nextHash]);
    return {name:current.name,photo:input.photo??current.photo,version:current.token_version};
  });
  if(nextHash)await setSession(response,{...actor,token_version:result.version+1});
  response.json({name:result.name,photo:result.photo});
};

export const staffReport:RequestHandler=async(request,response)=>{
  const {from,to}=range.parse(request.query);
  const {tenant}=request.scope!;
  const person=request.identity!.actor.professional_id;
  if(!person)throw new HttpError(403,'Conta sem profissional vinculado.');
  const {gross_cents,products_cents,services_cents,commission_cents,series,staff}=await financialReport(tenant.id,tenant.timezone,{from,to,professional_id:person});
  response.json({gross_cents,products_cents,services_cents,commission_cents,series,visits:staff[0]?.visits??0,average:staff[0]?.average??0});
};
