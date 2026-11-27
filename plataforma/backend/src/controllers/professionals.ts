import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import { assertFeature } from '../services/tenant.service.js';
import { one,pool } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { id,professional,staffAccount } from '../schemas/index.js';
import { exists,write } from './owner-scope.js';
import { assertMediaUrl,queueRetiredMedia } from '../../../src/lib/storage.js';

export const listProfessionals: RequestHandler = async (request, response) => {
  response.json((await pool.query(`SELECT p.id,p.name,p.photo,p.active,p.default_service_commission,p.default_product_commission,
    (SELECT phone FROM users u WHERE u.tenant_id=p.tenant_id AND u.professional_id=p.id AND u.role='STAFF' AND u.active) AS staff_phone,
    ARRAY(SELECT ps.service_id FROM professional_services ps JOIN services s ON s.tenant_id=ps.tenant_id AND s.id=ps.service_id
    WHERE ps.tenant_id=p.tenant_id AND ps.professional_id=p.id AND s.deleted_at IS NULL ORDER BY ps.service_id) AS service_ids
    FROM professionals p WHERE p.tenant_id=$1 AND p.deleted_at IS NULL ORDER BY p.created_at,p.id`, [request.scope!.tenant.id])).rows);
};

export const saveProfessional: RequestHandler = async (request, response) => {
  const input = professional.parse(request.body);
  const record = request.params.id ? id.parse(request.params.id) : null;
  const saved = await write(request, async (db, { tenant, flags, max_professionals }) => {
    const previous=record?exists(await one<{photo:string}>(db,'SELECT photo FROM professionals WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL',[tenant.id,record])).photo:'';
    if(previous!==input.photo)await assertMediaUrl(db,tenant.id,input.photo);
    if (!record) {
      const count = await one<{ count: number }>(db, 'SELECT count(*)::int AS count FROM professionals WHERE tenant_id=$1 AND deleted_at IS NULL', [tenant.id]);
      const limit = flags.enable_multi_professionals ? flags.enable_professional_limit ? max_professionals : Infinity : 1;
      if (count!.count >= limit) throw new HttpError(409, 'O limite de profissionais cadastrados foi atingido.');
    }
    const available = await one<{ count: number }>(db, 'SELECT count(*)::int AS count FROM services WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL', [tenant.id, input.service_ids]);
    if (available!.count !== input.service_ids.length) throw new HttpError(404, 'Um ou mais serviços não pertencem ao estabelecimento.');
    const fields = 'id,name,photo,active';
    const values = [tenant.id, input.name, input.photo, input.active];
    const row = exists(record
      ? await one<{ id: string }>(db, `UPDATE professionals SET name=$2,photo=$3,active=$4 WHERE tenant_id=$1 AND id=$5 AND deleted_at IS NULL RETURNING ${fields}`, [...values, record])
      : await one<{ id: string }>(db, `INSERT INTO professionals (tenant_id,name,photo,active) VALUES ($1,$2,$3,$4) RETURNING ${fields}`, values));
    if (input.default_service_commission!==undefined || input.default_product_commission!==undefined) {
      assertFeature(flags,'enable_commissions');
      await db.query('UPDATE professionals SET default_service_commission=COALESCE($3,default_service_commission),default_product_commission=COALESCE($4,default_product_commission) WHERE tenant_id=$1 AND id=$2',
        [tenant.id,row.id,input.default_service_commission??null,input.default_product_commission??null]);
    }
    await db.query('DELETE FROM professional_services WHERE tenant_id=$1 AND professional_id=$2', [tenant.id, row.id]);
    await db.query('INSERT INTO professional_services (tenant_id,professional_id,service_id) SELECT $1,$2,unnest($3::uuid[])', [tenant.id, row.id, input.service_ids]);
    if(previous!==input.photo)await queueRetiredMedia(db,tenant.id,[previous]);
    return { ...row, service_ids: input.service_ids };
  });
  response.status(record ? 200 : 201).json(saved);
};

export const removeProfessional: RequestHandler = async (request, response) => {
  const record = id.parse(request.params.id);
  await write(request, async (db,{tenant})=>{
    const {photo}=exists(await one<{photo:string}>(db,`UPDATE professionals SET active=false,deleted_at=now(),
      google_refresh_token=NULL,google_email=NULL,google_subject=NULL,google_connection_id=NULL
      WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING photo`,[tenant.id,record]));
    await queueRetiredMedia(db,tenant.id,[photo]);
  });
  response.status(204).end();
};

export const saveStaff: RequestHandler = async (request,response) => {
  const code=id.parse(request.params.id);
  const {phone,password}=staffAccount.parse(request.body);
  const hash=password?await bcrypt.hash(password,12):null;
  await write(request,async (db,{tenant})=>{
    const person=exists(await one<{name:string}>(db,'SELECT name FROM professionals WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL',[tenant.id,code]));
    const existing=await one<{id:string}>(db,"SELECT id FROM users WHERE tenant_id=$1 AND professional_id=$2 AND role='STAFF'",[tenant.id,code]);
    if (existing) await db.query('UPDATE users SET name=$3,phone=$4,password_hash=COALESCE($5,password_hash),token_version=token_version+CASE WHEN $5::text IS NULL THEN 0 ELSE 1 END,active=true WHERE tenant_id=$1 AND id=$2',[tenant.id,existing.id,person.name,phone,hash]);
    else {
      if (!hash) throw new HttpError(400,'Informe uma senha inicial.');
      await db.query("INSERT INTO users (tenant_id,role,professional_id,name,phone,password_hash) VALUES($1,'STAFF',$2,$3,$4,$5)",[tenant.id,code,person.name,phone,hash]);
    }
  });
  response.status(204).end();
};

export const removeStaff: RequestHandler = async (request,response) => {
  await write(request,async (db,{tenant})=>{
    const args=[tenant.id,id.parse(request.params.id)];
    await db.query("UPDATE users SET active=false,token_version=token_version+1 WHERE tenant_id=$1 AND professional_id=$2 AND role='STAFF'",args);
    await db.query(`UPDATE professionals SET google_refresh_token=NULL,google_email=NULL,google_subject=NULL,google_connection_id=NULL
      WHERE tenant_id=$1 AND id=$2`,args);
  });
  response.status(204).end();
};
