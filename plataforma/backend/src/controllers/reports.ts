import { Temporal } from '@js-temporal/polyfill';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { availabilityWindow, dateBounds, type Rule, type Span } from '../services/slot.service.js';
import { pool } from '../config/database.js';
import { range } from '../schemas/index.js';
import { financialReport } from '../services/report.service.js';

type Event = { professional_id: string | null; starts_at: Date; ends_at: Date; status: string; total_cents: number };
const span = (event: Event): Span => ({ start: +event.starts_at, end: +event.ends_at });

function without(window: Span, exclusions: Span[]) {
  return exclusions.reduce<Span[]>((available, block) => available.flatMap(current => {
    if (block.start >= current.end || block.end <= current.start) return [current];
    const before = { start: current.start, end: block.start };
    const after = { start: block.end, end: current.end };
    return [before, after].filter(item => item.end > item.start);
  }), [window]);
}

const length = (spans: Span[]) => spans.reduce((total, item) => total + item.end - item.start, 0);

export const report: RequestHandler = async (request, response) => {
  const { from, to, professional_id } = range.parse(request.query);
  const { tenant, flags } = request.scope!;
  const bounds = dateBounds(from, to, tenant.timezone);
  const [staff, hours, blocks, appointments, finance] = await Promise.all([
    pool.query<{ id: string }>(`SELECT id FROM professionals WHERE tenant_id=$1 AND active AND deleted_at IS NULL
      ORDER BY created_at,id ${flags.enable_multi_professionals ? '' : 'LIMIT 1'}`, [tenant.id]),
    pool.query<Rule>('SELECT * FROM working_hours WHERE tenant_id=$1', [tenant.id]),
    pool.query<Event>('SELECT professional_id,starts_at,ends_at FROM schedule_blocks WHERE tenant_id=$1 AND starts_at<$3 AND ends_at>$2', [tenant.id, ...bounds]),
    pool.query<Event>(`SELECT professional_id,starts_at,ends_at,status,total_cents FROM appointments WHERE tenant_id=$1 AND starts_at<$3 AND ends_at>$2
      AND ($4::uuid IS NULL OR professional_id=$4)`, [tenant.id, ...bounds, professional_id ?? null]),
    financialReport(tenant.id,tenant.timezone,{from,to,professional_id}),
  ]);
  const planned = appointments.rows.filter(item => ['CONFIRMADO', 'PENDENTE', 'EM_ATENDIMENTO', 'CONCLUIDO'].includes(item.status));
  const byProfessional = staff.rows.filter(person => !professional_id || person.id === professional_id);
  let capacity = 0, occupied = 0;
  const end = Temporal.PlainDate.from(to);
  for (let date = Temporal.PlainDate.from(from); Temporal.PlainDate.compare(date, end) <= 0; date = date.add({ days: 1 })) {
    const dailyRules = hours.rows.filter(rule => rule.weekday === date.dayOfWeek % 7);
    const shop = dailyRules.find(rule => rule.professional_id === null);
    for (const { id } of byProfessional) {
      const available = availabilityWindow(date.toString(), tenant.timezone, shop, dailyRules.find(rule => rule.professional_id === id));
      if (!available) continue;
      const interruptions = blocks.rows.filter(item => item.professional_id === id || item.professional_id === null).map(span);
      const reserved = planned.filter(item => item.professional_id === id).map(span);
      for (const work of without(available.open, [...available.breaks, ...interruptions])) {
        const workLength = work.end - work.start;
        capacity += workLength;
        occupied += workLength - length(without(work, reserved));
      }
    }
  }
  const within = planned.filter(item => item.starts_at >= bounds[0]);
  response.json({ ...finance, occupied_minutes: Math.round(occupied / 60000), capacity_minutes: Math.round(capacity / 60000),
    occupancy: capacity ? Math.round(100 * occupied / capacity) : 0,
    estimated_cents: within.reduce((sum, item) => sum + item.total_cents, 0),
    completed_cents: within.filter(item => item.status === 'CONCLUIDO').reduce((sum, item) => sum + item.total_cents, 0) });
};

export const commissions:RequestHandler=async(request,response)=>{
  const {page,...dates}=request.query;
  const {from,to,professional_id}=range.parse(dates);
  const current=z.coerce.number().int().min(1).max(10000).default(1).parse(page);
  const {tenant}=request.scope!;
  const rows=(await pool.query(`SELECT c.id,c.item_name,c.gross_cents::float8,c.rate_snapshot,c.commission_amount::float8,c.created_at,c.order_id,p.name AS professional_name
    FROM commission_records c JOIN professionals p ON p.tenant_id=c.tenant_id AND p.id=c.professional_id WHERE c.tenant_id=$1 AND c.created_at >= $2 AND c.created_at < $3
    AND ($4::uuid IS NULL OR c.professional_id=$4) ORDER BY c.created_at DESC,c.id LIMIT 51 OFFSET $5`,[tenant.id,...dateBounds(from,to,tenant.timezone),professional_id??null,(current-1)*50])).rows;
  response.json({items:rows.slice(0,50),has_more:rows.length>50});
};
