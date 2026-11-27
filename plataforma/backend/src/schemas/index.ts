import { z } from 'zod';
import { defaultSite, defaults, statuses } from '../../../shared/features.js';

export const id = z.uuid();
export const slug = z.string().max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const plain = (max: number, min = 0) => z.string().trim().normalize().min(min).max(max)
  .refine(value => !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value), 'Use texto simples.');
export const name = plain(100, 2);
export const phone = z.string().max(25).regex(/^[+()\d .-]+$/).transform(value => value.replace(/\D/g, ''))
  .transform(value => value.length === 10 || value.length === 11 ? `55${value}` : value)
  .pipe(z.string().regex(/^55[1-9]\d{9,10}$/, 'Informe um telefone brasileiro com DDD.')).transform(value => `+${value}`);
export const password = z.string().min(8).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'A senha excede 72 bytes.');
export const login = z.strictObject({ phone, password });
export const registration = login.extend({ name });
export const profile = z.strictObject({ name, phone });

const imageUrl = z.string().trim().max(700).refine(value => {
  if (!value || /^\/[a-z0-9][a-z0-9/_\-.]*\.(?:jpg|jpeg|png|webp|avif)$/i.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}, 'Informe uma URL HTTPS ou uma imagem local.');
const instagram = z.string().trim().max(300).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) && !url.username && !url.password; } catch { return false; }
}, 'Informe uma URL HTTPS do Instagram.');
export const money = z.number().int().min(0).max(10000000);
export const commission = z.number().int().min(0).max(10000);
const catalog = z.strictObject({ name, description: plain(1000), category: plain(80), photo: imageUrl, price_cents: money, active: z.boolean() });
export const service = catalog.extend({ duration_minutes: z.number().int().min(5).max(480), custom_commission_rate: commission.nullable().optional() });
export const product = catalog.extend({ sku: plain(80).optional(), commission_rate: commission.nullable().optional(), stock_quantity: z.number().int().min(0).max(1000000).optional(), stock_expected: z.number().int().min(0).max(1000000).optional() });
export const professional = z.strictObject({ name, photo: imageUrl, active: z.boolean(), service_ids: z.array(id).max(200).refine(values => new Set(values).size === values.length),
  default_service_commission: commission.optional(), default_product_commission: commission.optional() });
export const staffAccount = z.strictObject({ phone, password: password.optional() });
export const category = z.strictObject({ name: plain(80, 2) });
export const site = z.strictObject({
  name, logo: imageUrl, primary: z.string().regex(/^#[a-f\d]{6}$/i), secondary: z.string().regex(/^#[a-f\d]{6}$/i), banner: imageUrl,
  headline: plain(120), bio: plain(1600), address: plain(240), whatsapp: z.union([z.literal(''), phone]), instagram,
  sections: z.strictObject({ about: z.boolean(), services: z.boolean(), products: z.boolean(), team: z.boolean(), hours: z.boolean() }),
  backgrounds: z.strictObject({ home: imageUrl, services: imageUrl, products: imageUrl, loyalty: imageUrl }).optional(), favicon: imageUrl.optional(),
});
export const cancellationPolicy = z.strictObject({ cancellation_minutes: z.number().int().min(0).max(10080), slot_minutes: z.literal(30).optional() });
export const siteDefaults = defaultSite;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const day = z.iso.date();
export const instant = z.iso.datetime({ offset: true });
export const timezone = z.string().max(80).refine(value => {
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: value }); return true; } catch { return false; }
}, 'Fuso horário inválido.');
export const workingDay = z.strictObject({ weekday: z.number().int().min(0).max(6), closed: z.boolean(), opens_at: time.nullable(), closes_at: time.nullable(), break_start: time.nullable(), break_end: time.nullable() }).refine(rule => {
  const { closed, opens_at, closes_at, break_start, break_end } = rule;
  if (closed) return [opens_at, closes_at, break_start, break_end].every(value => value === null);
  if (!opens_at || !closes_at || opens_at >= closes_at) return false;
  return (break_start === null && break_end === null) || Boolean(break_start && break_end && opens_at < break_start && break_start < break_end && break_end < closes_at);
}, 'Confira abertura, fechamento e intervalo.');
export const schedule = z.strictObject({ professional_id: id.nullable(), days: z.array(workingDay).max(7).refine(rules => new Set(rules.map(rule => rule.weekday)).size === rules.length) });
export const block = z.strictObject({ professional_id: id.nullable(), starts_at: instant, ends_at: instant, reason: plain(160) })
  .refine(value => Date.parse(value.ends_at) > Date.parse(value.starts_at), 'O fim deve ser posterior ao início.');

const serviceIds = z.array(id).min(1).max(8).refine(values => new Set(values).size === values.length, 'Selecione serviços distintos.');
export const slots = z.strictObject({ professional_id: id.optional(), date: day, service_ids: z.string().max(320).transform(value => value.split(',')).pipe(serviceIds) });
export const booking = z.strictObject({ professional_id: id, starts_at: instant, service_ids: serviceIds });
export const publicBooking = booking.extend({ slug });
export const manualBooking = booking.extend({ client_name: name, client_phone: phone });
export const range = z.strictObject({ from: day, to: day, professional_id: id.optional() }).refine(value => {
  const length = (Date.parse(value.to) - Date.parse(value.from)) / 86400000;
  return length >= 0 && length <= 31;
}, 'Escolha um intervalo de até 32 dias.');
export const status = z.strictObject({ status: z.enum(statuses) });
export const checkout = z.strictObject({ items: z.array(z.strictObject({ product_id: id, quantity: z.number().int().min(1).max(100) })).min(1).max(40)
  .refine(items => new Set(items.map(item => item.product_id)).size === items.length), modality: z.enum(['RETIRADA_NO_LOCAL','ENTREGA']), delivery_address: plain(500).default(''), request_key:id.optional() })
  .refine(item => item.modality !== 'ENTREGA' || item.delivery_address.length >= 5, 'Informe o endereço da entrega.');
export const orderStatus = z.strictObject({ status: z.enum(['CONCLUIDO', 'CANCELADO']), professional_id: id.nullable().optional() });
export const loyaltyConfig = z.strictObject({ is_active: z.boolean(), program_name: plain(120, 2), accumulation_type: z.enum(['STAMPS_PER_SERVICE', 'POINTS_PER_CURRENCY']),
  include_products: z.boolean(), points_per_real: z.number().int().min(1).max(1000), min_spend_amount: money, target_value: z.number().int().min(1).max(1000000),
  reward_type: z.enum(['FREE_SERVICE', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'FREE_PRODUCT']), reward_value: money, reward_reference_id: id.nullable(),
  points_expiration_days: z.number().int().min(0).max(3650), rules_description: plain(2000) }).refine(item => item.reward_type === 'FREE_SERVICE' || item.reward_type === 'FREE_PRODUCT'
  ? Boolean(item.reward_reference_id) : item.reward_reference_id === null && item.reward_value > 0 && (item.reward_type !== 'DISCOUNT_PERCENT' || item.reward_value <= 100), 'Informe um prêmio válido.');
export const loyaltyAdjustment = z.strictObject({ delta: z.number().int().min(-1000000).max(1000000).refine(value => value !== 0), reason: plain(240, 3) });

const flags = z.strictObject(Object.fromEntries(Object.keys(defaults).map(key => [key, z.boolean().nullable().optional()])) as Record<keyof typeof defaults, z.ZodOptional<z.ZodNullable<z.ZodBoolean>>>);
export const controls = z.strictObject({ feature_flags: flags, max_professionals: z.number().int().min(1).max(500).nullable().optional() });
export const tenantControls = controls.extend({ status: z.enum(['ATIVO', 'SUSPENSO']).optional() });
export const newTenant = z.strictObject({ slug, name, kind: z.enum(['BARBEARIA', 'SALAO', 'ESTETICA']), timezone, owner: registration });
