import { Temporal } from '@js-temporal/polyfill';
import type { z } from 'zod';
import type { Status } from '../../shared/features.js';
import { one, pool, transaction } from '../lib/db.js';
import { HttpError } from '../../backend/src/middlewares/error.middleware.js';
import type { booking } from '../../backend/src/schemas/index.js';
import { dateBounds, findAvailability } from './slot.service.js';
import { assertFeature, scopedTenant, type Tenant } from '../../backend/src/services/tenant.service.js';
import { snapshotCommission } from './commission.service.js';
import { creditCompletion } from './loyalty.service.js';
import { queueCalendarSync } from './google-calendar.service.js';

type Appointment = { id: string; status: Status; starts_at: Date; ends_at: Date; professional_id: string; client_id:string | null;
  total_cents:number; line_items: { id:string; name:string; price_cents:number }[] };
type Customer = { id: string | null; name: string; phone: string };
const transitions: Partial<Record<Status, Status[]>> = {
  PENDENTE:['CONFIRMADO','EM_ATENDIMENTO','CONCLUIDO','CANCELADO','NO_SHOW'],
  CONFIRMADO:['EM_ATENDIMENTO','CONCLUIDO','CANCELADO','NO_SHOW'],
  EM_ATENDIMENTO:['CONCLUIDO','CANCELADO','NO_SHOW'],
};

export async function createAppointment(tenantId: string, input: z.infer<typeof booking>, customer: Customer, manual = false, support = false) {
  return transaction(async db => {
    // The tenant lock also serializes changes to schedules, catalog and professional assignments.
    const { tenant, flags } = await scopedTenant(db, tenantId, true, support);
    assertFeature(flags, manual ? 'enable_manual_booking' : 'enable_online_booking');
    const instant = Temporal.Instant.from(input.starts_at);
    const date = instant.toZonedDateTimeISO(tenant.timezone).toPlainDate().toString();
    const availability = await findAvailability(db, tenant, flags.enable_multi_professionals, date, input.service_ids, input.professional_id, manual ? 365 : 90);
    const start = instant.epochMilliseconds;
    if (!availability.starts.includes(start)) throw new HttpError(409, 'Esse horário ficou indisponível. Escolha outro.');
    const total = availability.services.reduce((sum, item) => sum + item.price_cents, 0);
    const client = customer.id ?? (manual ? (await one<{id:string}>(db,"SELECT id FROM users WHERE tenant_id=$1 AND phone=$2 AND role='CLIENT' AND active",[tenantId,customer.phone]))?.id : null);
    const created = (await one<Appointment>(db, `INSERT INTO appointments (tenant_id,professional_id,client_id,client_name,client_phone,source,status,starts_at,ends_at,total_cents,line_items)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      RETURNING id,professional_id,status,starts_at,ends_at,total_cents,line_items`, [tenantId, input.professional_id, client ?? null, customer.name, customer.phone,
      manual ? 'MANUAL' : 'PUBLICO', manual ? 'CONFIRMADO' : 'PENDENTE', new Date(start), new Date(start + availability.duration * 60000), total, JSON.stringify(availability.services)]))!;
    if(flags.enable_google_calendar)await queueCalendarSync(db,tenantId,created.id);
    return created;
  });
}

export async function listAppointments(tenant: Tenant, filter: { from?: string; to?: string; professional_id?: string; clientId?: string }, page = 1) {
  const [from, to] = filter.from && filter.to ? dateBounds(filter.from, filter.to, tenant.timezone) : [null, null];
  const list = await pool.query(`SELECT a.id,a.status,a.starts_at,a.ends_at,a.professional_id,p.name AS professional_name,a.total_cents,a.line_items,a.source,
      CASE WHEN $5::uuid IS NULL THEN a.client_name ELSE NULL END AS client_name,CASE WHEN $5::uuid IS NULL THEN a.client_phone ELSE NULL END AS client_phone
    FROM appointments a JOIN professionals p ON p.tenant_id=a.tenant_id AND p.id=a.professional_id
    WHERE a.tenant_id=$1 AND ($2::timestamptz IS NULL OR (a.starts_at >= $2 AND a.starts_at < $3))
      AND ($4::uuid IS NULL OR a.professional_id=$4) AND ($5::uuid IS NULL OR a.client_id=$5)
    ORDER BY ${filter.clientId ? 'a.starts_at DESC' : 'a.starts_at ASC'}, a.id LIMIT 101 OFFSET $6`, [tenant.id, from, to, filter.professional_id ?? null, filter.clientId ?? null, (page - 1) * 100]);
  return { items: list.rows.slice(0, 100), has_more: list.rows.length > 100 };
}

export async function changeStatus(tenantId: string, appointmentId: string, status: Status, options: { clientId?: string; professionalId?: string; support?: boolean } = {}) {
  return transaction(async db => {
    const { tenant, flags } = await scopedTenant(db, tenantId, true, options.support);
    if (options.clientId) assertFeature(flags, 'enable_client_cancellation');
    if (options.professionalId && !['CONFIRMADO','CONCLUIDO','NO_SHOW','CANCELADO'].includes(status)) {
      throw new HttpError(403,'A equipe pode confirmar, cancelar, concluir ou registrar não comparecimento.');
    }
    const current = await one<Appointment>(db, `SELECT id,status,starts_at,ends_at,professional_id,client_id,total_cents,line_items FROM appointments WHERE tenant_id=$1 AND id=$2
      AND ($3::uuid IS NULL OR client_id=$3) AND ($4::uuid IS NULL OR professional_id=$4) FOR UPDATE`, [tenantId, appointmentId, options.clientId ?? null, options.professionalId ?? null]);
    if (!current) throw new HttpError(404, 'Agendamento não encontrado.');
    if(options.professionalId&&status==='CANCELADO'&&current.status==='EM_ATENDIMENTO')throw new HttpError(403,'Peça ao empresário para cancelar um atendimento em andamento.');
    if (current.status === status) return current;
    if (!transitions[current.status]?.includes(status)) throw new HttpError(409, 'Essa transição de status não está disponível.');
    if (options.clientId && (current.status==='EM_ATENDIMENTO' || +current.starts_at - Date.now() < tenant.cancellation_minutes * 60000)) throw new HttpError(409, 'O prazo mínimo para cancelamento terminou.');
    if (['EM_ATENDIMENTO','CONCLUIDO','NO_SHOW'].includes(status) && +current.starts_at > Date.now()) throw new HttpError(409, 'O atendimento ainda não começou.');
    if (status==='CONCLUIDO') {
      if (flags.enable_commissions) await snapshotCommission(db,tenant.id,current.professional_id,'service',appointmentId,current.line_items.map(line=>({id:line.id,name:line.name,gross:line.price_cents})));
      if (flags.enable_loyalty_club) await creditCompletion(db,{tenant:tenant.id,client:current.client_id,kind:'APPOINTMENT',source:appointmentId,total:current.total_cents});
    }
    const updated=(await one(db, "UPDATE appointments SET status=$1,updated_at=now(),completed_at=CASE WHEN $1='CONCLUIDO' THEN now() END WHERE tenant_id=$2 AND id=$3 RETURNING id,status,starts_at,ends_at", [status, tenantId, appointmentId]))!;
    if(flags.enable_google_calendar&&['CONFIRMADO','CANCELADO'].includes(status))await queueCalendarSync(db,tenantId,appointmentId);
    return updated;
  });
}

export async function rescheduleAppointment(tenantId:string,appointmentId:string,startAt:string,options:{professionalId?:string;support?:boolean}={}){
  return transaction(async db=>{
    const {tenant,flags}=await scopedTenant(db,tenantId,true,options.support);
    const current=await one<Appointment>(db,`SELECT id,professional_id,status,starts_at,ends_at,line_items FROM appointments
      WHERE tenant_id=$1 AND id=$2 AND ($3::uuid IS NULL OR professional_id=$3) FOR UPDATE`,[tenant.id,appointmentId,options.professionalId??null]);
    if(!current)throw new HttpError(404,'Agendamento não encontrado.');
    if(!['PENDENTE','CONFIRMADO'].includes(current.status)||+current.starts_at<=Date.now())throw new HttpError(409,'Só é possível reagendar atendimentos futuros.');
    const instant=Temporal.Instant.from(startAt);
    const date=instant.toZonedDateTimeISO(tenant.timezone).toPlainDate().toString();
    const duration=(+current.ends_at-+current.starts_at)/60000;
    const availability=await findAvailability(db,tenant,true,date,current.line_items.map(item=>item.id),current.professional_id,365,
      {appointmentId,duration});
    if(!availability.starts.includes(instant.epochMilliseconds))throw new HttpError(409,'Esse horário ficou indisponível. Escolha outro.');
    const result=await one(db,`UPDATE appointments SET starts_at=$3,ends_at=$4,updated_at=now()
      WHERE tenant_id=$1 AND id=$2 RETURNING id,status,starts_at,ends_at`,
    [tenant.id,appointmentId,new Date(instant.epochMilliseconds),new Date(instant.epochMilliseconds+duration*60000)]);
    if(flags.enable_google_calendar)await queueCalendarSync(db,tenant.id,appointmentId);
    return result;
  });
}
