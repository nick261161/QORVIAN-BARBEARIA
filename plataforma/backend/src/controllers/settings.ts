import { Temporal } from '@js-temporal/polyfill';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { assertProfessional,dateBounds } from '../services/slot.service.js';
import { presentTenant,type Tenant } from '../services/tenant.service.js';
import { one,pool } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { block,cancellationPolicy,id,schedule,site } from '../schemas/index.js';
import { exists,write } from './owner-scope.js';
import { assertMediaUrl,queueRetiredMedia } from '../../../src/lib/storage.js';
import { defaultConfirmation } from '../../../src/utils/whatsappLink.js';

export async function confirmationTemplate(tenant:string){
  return (await one<{confirmation_message_template:string}>(pool,'SELECT confirmation_message_template FROM business_settings WHERE tenant_id=$1',[tenant]))?.confirmation_message_template??defaultConfirmation;
}

export const overview: RequestHandler = async (request, response) => {
  const { tenant, flags, max_professionals } = request.scope!;
  const today = Temporal.Now.plainDateISO(tenant.timezone).toString();
  const stats = await one(pool, `SELECT
    (SELECT count(*)::int FROM services WHERE tenant_id=$1 AND active AND deleted_at IS NULL) AS services,
    (SELECT count(*)::int FROM professionals WHERE tenant_id=$1 AND active AND deleted_at IS NULL) AS professionals,
    (SELECT count(*)::int FROM appointments WHERE tenant_id=$1 AND starts_at >= $2 AND starts_at < $3 AND status <> 'CANCELADO') AS today_appointments`, [tenant.id, ...dateBounds(today, today, tenant.timezone)]);
  response.json({ tenant: presentTenant(tenant), flags, max_professionals, stats,confirmation_message_template:await confirmationTemplate(tenant.id) });
};

export const listHours: RequestHandler = async (request, response) => {
  const tenant = request.scope!.tenant.id;
  const [hours, blocks] = await Promise.all([
    pool.query(`SELECT professional_id,weekday,closed,to_char(opens_at,'HH24:MI') AS opens_at,to_char(closes_at,'HH24:MI') AS closes_at,
      to_char(break_start,'HH24:MI') AS break_start,to_char(break_end,'HH24:MI') AS break_end FROM working_hours WHERE tenant_id=$1 ORDER BY weekday`, [tenant]),
    pool.query(`SELECT b.id,b.professional_id,p.name AS professional_name,b.starts_at,b.ends_at,b.reason FROM schedule_blocks b LEFT JOIN professionals p ON p.tenant_id=b.tenant_id AND p.id=b.professional_id
      WHERE b.tenant_id=$1 AND b.ends_at>now() ORDER BY b.starts_at LIMIT 500`, [tenant]),
  ]);
  response.json({ hours: hours.rows, blocks: blocks.rows });
};

export const saveHours: RequestHandler = async (request, response) => {
  const input = schedule.parse(request.body);
  await write(request, async (db, { tenant }) => {
    if (input.professional_id) await assertProfessional(db, tenant.id, input.professional_id);
    await db.query('DELETE FROM working_hours WHERE tenant_id=$1 AND professional_id IS NOT DISTINCT FROM $2::uuid', [tenant.id, input.professional_id]);
    await db.query(`INSERT INTO working_hours (tenant_id,professional_id,weekday,closed,opens_at,closes_at,break_start,break_end)
      SELECT $1,$2,weekday,closed,opens_at,closes_at,break_start,break_end FROM jsonb_to_recordset($3::jsonb)
      AS rules(weekday int,closed bool,opens_at time,closes_at time,break_start time,break_end time)`, [tenant.id, input.professional_id, JSON.stringify(input.days)]);
  });
  response.status(204).end();
};

export const saveBlock: RequestHandler = async (request, response) => {
  const input = block.parse(request.body);
  const row = await write(request, async (db, { tenant }) => {
    if (input.professional_id) await assertProfessional(db, tenant.id, input.professional_id);
    if (Date.parse(input.ends_at) <= Date.now()) throw new HttpError(400, 'O bloqueio precisa terminar no futuro.');
    const values = [tenant.id, input.professional_id, input.starts_at, input.ends_at];
    const busy = await one(db, `SELECT id FROM appointments WHERE tenant_id=$1 AND ($2::uuid IS NULL OR professional_id=$2)
      AND status IN ('PENDENTE','CONFIRMADO','EM_ATENDIMENTO') AND starts_at<$4 AND ends_at>$3 LIMIT 1`, values);
    if (busy) throw new HttpError(409, 'Já existe um agendamento nesse intervalo. Ajuste a agenda antes de bloquear.');
    return one(db, 'INSERT INTO schedule_blocks (tenant_id,professional_id,starts_at,ends_at,reason) VALUES ($1,$2,$3,$4,$5) RETURNING *', [...values, input.reason]);
  });
  response.status(201).json(row);
};

export const removeBlock: RequestHandler = async (request, response) => {
  const record = id.parse(request.params.id);
  await write(request, async (db, { tenant }) => exists(await one(db, 'DELETE FROM schedule_blocks WHERE tenant_id=$1 AND id=$2 RETURNING id', [tenant.id, record])));
  response.status(204).end();
};

export const saveSite: RequestHandler = async (request, response) => {
  const { name, ...settings } = site.parse(request.body);
  const tenant = await write(request, async (db, { tenant }) => {
    const previous=presentTenant(tenant).site;
    const oldUrls=[previous.logo,previous.favicon,previous.banner,...Object.values(previous.backgrounds),...previous.slides];
    const newUrls=[settings.logo,settings.favicon??'',settings.banner,...Object.values(settings.backgrounds??{}),...(settings.slides??[])];
    for(const url of new Set(newUrls))if(!oldUrls.includes(url))await assertMediaUrl(db,tenant.id,url);
    const updated=exists(await one<Tenant>(db,'UPDATE tenants SET name=$2,site_settings=$3 WHERE id=$1 RETURNING *',[tenant.id,name,settings]));
    await queueRetiredMedia(db,tenant.id,oldUrls.filter(url=>!newUrls.includes(url)));
    return updated;
  }, 'enable_site_customizer');
  response.json(presentTenant(tenant));
};

export const savePolicy: RequestHandler = async (request, response) => {
  const { cancellation_minutes,slot_minutes } = cancellationPolicy.parse(request.body);
  await write(request, async (db, { tenant }) => db.query('UPDATE tenants SET cancellation_minutes=$2,slot_minutes=COALESCE($3,slot_minutes) WHERE id=$1', [tenant.id, cancellation_minutes,slot_minutes??null]));
  response.status(204).end();
};

export const saveConfirmation:RequestHandler=async(request,response)=>{
  if(request.identity?.actor.role!=='OWNER')throw new HttpError(403,'Apenas o empresário pode editar a mensagem.');
  const {confirmation_message_template:template}=z.strictObject({confirmation_message_template:z.string().trim().min(1).max(2000)}).parse(request.body);
  await write(request,async(db,{tenant})=>db.query(`INSERT INTO business_settings(tenant_id,confirmation_message_template) VALUES($1,$2)
    ON CONFLICT (tenant_id) DO UPDATE SET confirmation_message_template=EXCLUDED.confirmation_message_template`,[tenant.id,template]));
  response.json({confirmation_message_template:template});
};
