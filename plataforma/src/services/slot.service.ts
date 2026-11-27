import { Temporal } from '@js-temporal/polyfill';
import { one, type Db } from '../lib/db.js';
import { HttpError } from '../../backend/src/middlewares/error.middleware.js';
import type { Tenant } from '../../backend/src/services/tenant.service.js';

export type Rule = { professional_id: string | null; weekday: number; closed: boolean; opens_at: string | null; closes_at: string | null; break_start: string | null; break_end: string | null };
export type Span = { start: number; end: number };
type Busy = { starts_at: Date; ends_at: Date };
type Item = { id: string; name: string; duration_minutes: number; price_cents: number };
const minute = 60000;
export const overlaps = (x: Span, y: Span) => x.start < y.end && y.start < x.end;

export function localTime(date: string, time: string, timezone: string) {
  return Temporal.PlainDate.from(date).toPlainDateTime(Temporal.PlainTime.from(time)).toZonedDateTime(timezone).epochMilliseconds;
}

export function dateBounds(from: string, to: string, timezone: string) {
  return [new Date(localTime(from, '00:00', timezone)), new Date(localTime(Temporal.PlainDate.from(to).add({ days: 1 }).toString(), '00:00', timezone))];
}

export function availabilityWindow(date: string, timezone: string, shop: Rule | undefined, staff: Rule | undefined) {
  if (!shop || shop.closed || staff?.closed) return null;
  const at = (time: string) => localTime(date, time, timezone);
  const open = { start: Math.max(at(shop.opens_at!), staff ? at(staff.opens_at!) : -Infinity), end: Math.min(at(shop.closes_at!), staff ? at(staff.closes_at!) : Infinity) };
  if (open.end <= open.start) return null;
  const breaks = [shop, staff].flatMap(rule => rule?.break_start && rule.break_end ? [{ start: at(rule.break_start), end: at(rule.break_end) }] : []);
  return { open, breaks };
}

export function availableStarts(input: { open: Span; busy: Span[]; duration: number; now: number; startsAt: number }) {
  const { open, busy, duration, now, startsAt } = input;
  const starts: number[] = [];
  const step=30*minute;
  let start=startsAt+Math.ceil((open.start-startsAt)/step)*step;
  for (;start + duration * minute <= open.end; start+=step) {
    const candidate = { start, end: start + duration * minute };
    if (start > now && !busy.some(event => overlaps(event, candidate))) starts.push(start);
  }
  return starts;
}

export async function offeredProfessionals(db: Db, tenantId: string, multiple: boolean) {
  return (await db.query<{ id: string; name: string; photo: string; service_ids: string[] }>(`
    SELECT p.id, p.name, p.photo, ARRAY(SELECT ps.service_id FROM professional_services ps JOIN services s
      ON s.tenant_id=ps.tenant_id AND s.id=ps.service_id WHERE ps.tenant_id=p.tenant_id AND ps.professional_id=p.id AND s.active AND s.deleted_at IS NULL ORDER BY ps.service_id) AS service_ids
    FROM professionals p WHERE p.tenant_id=$1 AND p.active AND p.deleted_at IS NULL ORDER BY p.created_at, p.id ${multiple ? '' : 'LIMIT 1'}`, [tenantId])).rows;
}

export async function findAvailability(db: Db, tenant: Tenant, multiple: boolean, date: string, serviceIds: string[], requested?: string, maxDays = 90,
  existing?:{appointmentId:string;duration:number}): Promise<{ professional_id: string | null; starts: number[]; services: Item[]; duration: number }> {
  const today = Temporal.Now.plainDateISO(tenant.timezone);
  const day = Temporal.PlainDate.from(date);
  if (Temporal.PlainDate.compare(day, today) < 0 || Temporal.PlainDate.compare(day, today.add({ days: maxDays })) > 0) {
    return { professional_id: null, starts: [], services: [], duration: 0 };
  }
  const id = tenant.id;
  const people = await offeredProfessionals(db, id, multiple);
  const professional = requested ? people.find(person => person.id === requested) : people.length === 1 ? people[0] : undefined;
  if (!professional || serviceIds.some(serviceId => !professional.service_ids.includes(serviceId))) throw new HttpError(404, 'Profissional indisponível para os serviços selecionados.');
  const [from, to] = dateBounds(date, date, tenant.timezone);
  const items = (await db.query<Item>('SELECT id,name,duration_minutes,price_cents FROM services WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND active AND deleted_at IS NULL', [id, serviceIds])).rows;
  if (items.length !== serviceIds.length) throw new HttpError(404, 'Serviço indisponível.');
  const selected = serviceIds.map(serviceId => items.find(item => item.id === serviceId)!);
  const duration = existing?.duration??selected.reduce((sum, item) => sum + item.duration_minutes, 0);
  const weekday = day.dayOfWeek % 7;
  const rules = (await db.query<Rule>('SELECT * FROM working_hours WHERE tenant_id=$1 AND weekday=$2 AND (professional_id=$3 OR professional_id IS NULL)', [id, weekday, professional.id])).rows;
  const window = availabilityWindow(date, tenant.timezone, rules.find(rule => rule.professional_id === null), rules.find(rule => rule.professional_id === professional.id));
  if (!window) return { professional_id: professional.id, starts: [], services: selected, duration };
  const busy = (await db.query<Busy>(`
    SELECT starts_at,ends_at FROM schedule_blocks WHERE tenant_id=$1 AND (professional_id=$2 OR professional_id IS NULL) AND starts_at<$4 AND ends_at>$3
    UNION ALL
    SELECT starts_at,ends_at FROM appointments WHERE tenant_id=$1 AND professional_id=$2 AND status IN ('PENDENTE','CONFIRMADO','EM_ATENDIMENTO')
      AND starts_at<$4 AND ends_at>$3 AND ($5::uuid IS NULL OR appointments.id<>$5)`, [id, professional.id, from, to,existing?.appointmentId??null])).rows;
  const starts = availableStarts({ open: window.open, busy: [...window.breaks, ...busy.map(event => ({ start: +event.starts_at, end: +event.ends_at }))], duration, now: Date.now(), startsAt:+from });
  return { professional_id: professional.id, starts, services: selected, duration };
}

export async function assertProfessional(db: Db, tenantId: string, professionalId: string) {
  const found = await one(db, 'SELECT id FROM professionals WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL', [tenantId, professionalId]);
  if (!found) throw new HttpError(404, 'Profissional não encontrado.');
}
