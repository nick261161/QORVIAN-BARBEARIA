import type { RequestHandler } from 'express';
import { z } from 'zod';
import { createAppointment, changeStatus, listAppointments,rescheduleAppointment } from '../services/appointment.service.js';
import { findAvailability, offeredProfessionals } from '../services/slot.service.js';
import { activeTenant, assertFeature, effective, presentTenant, settings, tenantBySlug } from '../services/tenant.service.js';
import { pool } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { id,instant,manualBooking, publicBooking, range, slots, slug, status } from '../schemas/index.js';
import { loyaltySettings, reward } from '../services/loyalty.service.js';

async function storefront(code: string) {
  const [global, row] = await Promise.all([settings(pool), tenantBySlug(pool, code)]);
  const tenant = activeTenant(row);
  return { tenant, ...effective(tenant, global) };
}

export const store: RequestHandler = async (request, response) => {
  const { tenant, flags } = await storefront(slug.parse(request.params.slug));
  const [services, products, professionals, hours, loyalty] = await Promise.all([
    pool.query('SELECT id,name,description,category,photo,price_cents,duration_minutes FROM services WHERE tenant_id=$1 AND active AND deleted_at IS NULL ORDER BY name,id', [tenant.id]),
    flags.enable_products_store ? pool.query('SELECT id,name,description,category,photo,price_cents,sku,stock_quantity FROM products WHERE tenant_id=$1 AND active AND deleted_at IS NULL ORDER BY name,id', [tenant.id]) : null,
    offeredProfessionals(pool, tenant.id, flags.enable_multi_professionals),
    pool.query(`SELECT weekday,closed,to_char(opens_at,'HH24:MI') AS opens_at,to_char(closes_at,'HH24:MI') AS closes_at,
      to_char(break_start,'HH24:MI') AS break_start,to_char(break_end,'HH24:MI') AS break_end FROM working_hours
      WHERE tenant_id=$1 AND professional_id IS NULL ORDER BY weekday`, [tenant.id]),
    flags.enable_loyalty_club ? loyaltySettings(pool,tenant.id) : null,
  ]);
  response.json({ tenant: presentTenant(tenant), flags, services: services.rows, products: products?.rows ?? [], professionals, hours: hours.rows,
    loyalty:loyalty?.is_active?{...loyalty,reward:await reward(pool,tenant.id,loyalty)}:null });
};

export function availability(manual = false): RequestHandler {
  return async (request, response) => {
    const input = slots.parse(request.query);
    const { tenant, flags } = manual ? request.scope! : await storefront(slug.parse(request.params.slug));
    assertFeature(flags, manual ? 'enable_manual_booking' : 'enable_online_booking');
    const result = await findAvailability(pool, tenant, flags.enable_multi_professionals, input.date, input.service_ids, input.professional_id, manual ? 365 : 90);
    response.json({ professional_id: result.professional_id, starts: result.starts.map(start => new Date(start).toISOString()), duration: result.duration });
  };
}

export const makeBooking: RequestHandler = async (request, response) => {
  const input = publicBooking.parse(request.body);
  const identity = request.identity!;
  const tenant = identity.tenant;
  if (!tenant || tenant.slug !== input.slug) throw new HttpError(404, 'Estabelecimento não encontrado.');
  const { id, name, phone } = identity.actor;
  response.status(201).json(await createAppointment(tenant.id, input, { id, name, phone }));
};

export const makeManualBooking: RequestHandler = async (request, response) => {
  const input = manualBooking.parse(request.body);
  response.status(201).json(await createAppointment(request.scope!.tenant.id, input, { id: null, name: input.client_name, phone: input.client_phone }, true, request.identity!.impersonating));
};

const pageNumber = z.coerce.number().int().min(1).max(10000).default(1);
export const ownerAgenda: RequestHandler = async (request, response) => {
  const { page, ...dates } = request.query;
  const staff=request.identity?.role==='STAFF'?request.identity.actor.professional_id:undefined;
  response.json(await listAppointments(request.scope!.tenant, { ...range.parse(dates), ...(staff?{professional_id:staff}:{}) }, pageNumber.parse(page)));
};

export const clientAgenda: RequestHandler = async (request, response) => {
  response.json(await listAppointments(request.scope!.tenant, { clientId: request.identity!.actor.id }, pageNumber.parse(request.query.page)));
};

export const ownerStatus: RequestHandler = async (request, response) => {
  const identity=request.identity!;
  const options={support:identity.impersonating,professionalId:identity.role==='STAFF'?identity.actor.professional_id??undefined:undefined};
  const body=z.union([status,z.strictObject({starts_at:instant})]).parse(request.body);
  const tenant=request.scope!.tenant.id;
  const appointment=id.parse(request.params.id);
  response.json('starts_at' in body?await rescheduleAppointment(tenant,appointment,body.starts_at,options):await changeStatus(tenant,appointment,body.status,options));
};

export const clientCancel: RequestHandler = async (request, response) => {
  response.json(await changeStatus(request.scope!.tenant.id, id.parse(request.params.id), 'CANCELADO', { clientId: request.identity!.actor.id }));
};
