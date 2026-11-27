import { Temporal } from '@js-temporal/polyfill';
import { one, pool } from '../lib/db.js';
import { dateBounds } from './slot.service.js';

type Financial={services_cents:number;products_cents:number;commission_cents:number};
type Range={from:string;to:string;professional_id?:string};
const actualEvents=`SELECT completed_at AS instant,professional_id,total_cents::bigint AS gross,1 AS visits,'service' AS kind FROM appointments
  WHERE tenant_id=$1 AND status='CONCLUIDO' AND completed_at >= $2 AND completed_at < $3 AND ($4::uuid IS NULL OR professional_id=$4)
  UNION ALL SELECT completed_at,professional_id,total_cents,0,'product' FROM orders
  WHERE tenant_id=$1 AND status='CONCLUIDO' AND completed_at >= $2 AND completed_at < $3 AND ($4::uuid IS NULL OR professional_id=$4)`;

function prior(from:string,to:string) {
  const first=Temporal.PlainDate.from(from),last=Temporal.PlainDate.from(to);
  const days=first.until(last).days+1;
  const month=first.day===1 && first.add({months:1}).subtract({days:1}).equals(last);
  return [month?first.subtract({months:1}).toString():first.subtract({days}).toString(),first.subtract({days:1}).toString()] as const;
}

async function totals(values: unknown[]) {
  return (await one<Financial>(pool,`WITH events AS (${actualEvents}) SELECT COALESCE(sum(gross) FILTER (WHERE kind='service'),0)::float8 AS services_cents,
    COALESCE(sum(gross) FILTER (WHERE kind='product'),0)::float8 AS products_cents,(SELECT COALESCE(sum(commission_amount),0)::float8 FROM commission_records
    WHERE tenant_id=$1 AND created_at >= $2 AND created_at < $3 AND ($4::uuid IS NULL OR professional_id=$4)) AS commission_cents FROM events`,values))!;
}

export async function financialReport(tenant:string,timezone:string,range:Range) {
  const {from,to,professional_id}=range;
  const values=[tenant,...dateBounds(from,to,timezone),professional_id??null];
  const [previousFrom,previousTo]=prior(from,to);
  const [current,previous,series,staff]=await Promise.all([totals(values),totals([tenant,...dateBounds(previousFrom,previousTo,timezone),professional_id??null]),
    pool.query(`WITH events AS (${actualEvents}), daily AS (SELECT (instant AT TIME ZONE $5)::date AS date,
      COALESCE(sum(gross) FILTER (WHERE kind='service'),0)::float8 AS services,COALESCE(sum(gross) FILTER (WHERE kind='product'),0)::float8 AS products FROM events GROUP BY 1), payout AS (
      SELECT (created_at AT TIME ZONE $5)::date AS date,sum(commission_amount)::float8 AS commission FROM commission_records WHERE tenant_id=$1
      AND created_at >= $2 AND created_at < $3 AND ($4::uuid IS NULL OR professional_id=$4) GROUP BY 1)
      SELECT day::date::text AS date,coalesce(daily.services,0) AS services,coalesce(daily.products,0) AS products,coalesce(payout.commission,0) AS commission
      FROM generate_series($6::date::timestamp,$7::date::timestamp,'1 day') day LEFT JOIN daily ON daily.date=day::date LEFT JOIN payout ON payout.date=day::date ORDER BY day`,[...values,timezone,from,to]),
    pool.query<{name:string; visits:number; gross:number; service_gross:number; commission:number}>(`WITH events AS (${actualEvents}), sales AS (
      SELECT professional_id,sum(visits)::int AS visits,sum(gross)::float8 AS gross,COALESCE(sum(gross) FILTER (WHERE kind='service'),0)::float8 AS service_gross FROM events WHERE professional_id IS NOT NULL GROUP BY 1
    ), payouts AS (SELECT professional_id,sum(commission_amount)::float8 AS amount FROM commission_records WHERE tenant_id=$1 AND created_at >= $2 AND created_at < $3
       AND ($4::uuid IS NULL OR professional_id=$4) GROUP BY 1)
    SELECT p.name,coalesce(s.visits,0) AS visits,coalesce(s.gross,0) AS gross,coalesce(s.service_gross,0) AS service_gross,coalesce(c.amount,0) AS commission
    FROM professionals p LEFT JOIN sales s ON s.professional_id=p.id LEFT JOIN payouts c ON c.professional_id=p.id
    WHERE p.tenant_id=$1 AND ($4::uuid IS NULL OR p.id=$4) AND ((p.active AND p.deleted_at IS NULL) OR s.professional_id IS NOT NULL OR c.professional_id IS NOT NULL) ORDER BY gross DESC,p.name`,values)]);
  const gross=current.services_cents+current.products_cents;
  const old=previous.services_cents+previous.products_cents;
  const net=gross-current.commission_cents,oldNet=old-previous.commission_cents;
  return {...current,gross_cents:gross,net_cents:net,margin_percent:gross?net*100/gross:0,
    net_change_cents:net-oldNet,net_change_percent:oldNet?(net-oldNet)*100/oldNet:null,
    change_cents:gross-old,change_percent:old?(gross-old)*100/old:null,previous_gross:old,series:series.rows,
    staff:staff.rows.map(item=>({...item,average:item.visits?Math.round(item.service_gross/item.visits):0,share:gross?item.gross*100/gross:0}))};
}
