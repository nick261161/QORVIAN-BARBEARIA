import type { Db } from '../lib/db.js';

type Line = { id:string; name:string; gross:number };
export async function snapshotCommission(db: Db, tenant: string, professional: string, kind: 'service' | 'product', source: string, lines: Line[]) {
  if (!lines.length) return;
  const table = kind === 'service' ? 'services' : 'products';
  const column = kind === 'service' ? 'custom_commission_rate' : 'commission_rate';
  const foreignColumn = kind === 'service' ? 'appointment_id' : 'order_id';
  const fallback = kind === 'service' ? 'default_service_commission' : 'default_product_commission';
  await db.query(`INSERT INTO commission_records (tenant_id,professional_id,${foreignColumn},item_id,item_name,gross_cents,rate_snapshot,commission_amount)
    SELECT $1,p.id,$3,l.id,l.name,l.gross,COALESCE(i.${column},p.${fallback}),round(l.gross::numeric*COALESCE(i.${column},p.${fallback})/10000)::bigint
    FROM professionals p CROSS JOIN jsonb_to_recordset($4::jsonb) AS l(id uuid,name text,gross bigint)
    LEFT JOIN ${table} i ON i.tenant_id=$1 AND i.id=l.id WHERE p.tenant_id=$1 AND p.id=$2 ON CONFLICT DO NOTHING`,
  [tenant,professional,source,JSON.stringify(lines)]);
}
