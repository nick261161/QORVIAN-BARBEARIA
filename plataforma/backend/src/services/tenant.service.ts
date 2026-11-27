import { defaults, defaultSite, type Feature, type Flags, type Site } from '../../../shared/features.js';
import { one, type Db } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';

type ControlRow = { feature_flags: Partial<Flags>; limits: { max_professionals?: number } };
export type Tenant = ControlRow & {
  id: string; slug: string; name: string; kind: string; status: string; timezone: string;
  cancellation_minutes: number; slot_minutes: 15 | 30; site_settings: Partial<Site>;
};

export async function settings(db: Db, lock = false): Promise<ControlRow> {
  const row = await one<ControlRow>(db, `SELECT feature_flags, limits FROM platform_settings WHERE id = true ${lock ? 'FOR SHARE' : ''}`);
  if (!row) throw new HttpError(503, 'Configuração da plataforma indisponível.');
  return row;
}

export function tenantBySlug(db: Db, slug: string) { return one<Tenant>(db, 'SELECT * FROM tenants WHERE slug = $1', [slug]); }
export function tenantById(db: Db, id: string, lock = false) { return one<Tenant>(db, `SELECT * FROM tenants WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]); }

export function activeTenant(tenant: Tenant | undefined) {
  if (!tenant || tenant.status !== 'ATIVO') throw new HttpError(404, 'Estabelecimento indisponível.');
  return tenant;
}

export function effective(tenant: ControlRow, global: ControlRow) {
  return {
    flags: { ...defaults, ...global.feature_flags, ...tenant.feature_flags },
    max_professionals: tenant.limits.max_professionals ?? global.limits.max_professionals ?? 5,
  };
}

export function assertFeature(flags: Flags, flag: Feature) {
  if (!flags[flag]) throw new HttpError(403, 'Esta funcionalidade está desativada para o estabelecimento.');
}

export async function scopedTenant(db: Db, id: string, lock = false, support = false) {
  const global = await settings(db, lock);
  const row = await tenantById(db, id, lock);
  const tenant = support && row ? row : activeTenant(row);
  return { tenant, ...effective(tenant, global) };
}

export function presentTenant(tenant: Tenant) {
  return { id: tenant.id, slug: tenant.slug, name: tenant.name, kind: tenant.kind, timezone: tenant.timezone, cancellation_minutes: tenant.cancellation_minutes,
    slot_minutes: tenant.slot_minutes, site: { ...defaultSite, ...tenant.site_settings, sections: { ...defaultSite.sections, ...tenant.site_settings.sections },
      backgrounds: { ...defaultSite.backgrounds, ...tenant.site_settings.backgrounds } } };
}
