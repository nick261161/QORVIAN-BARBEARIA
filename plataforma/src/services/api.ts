import { useEffect, useState } from 'react';
import type { Flags, Role, Site, Status } from '../../shared/features.js';

export type Session = { id: string; role: Role; name: string; phone: string; slug: string | null; impersonating: boolean; read_only_support?:boolean;redirect_to?:string;professional_id?: string | null };
export type Tenant = { id: string; slug: string; name: string; kind: string; timezone: string; cancellation_minutes: number; slot_minutes:30; site: Site };
export type CatalogCategory={id:string;name:string;type:'PRODUCT'|'SERVICE';is_active:boolean};
export type Product = { id: string; name: string; description: string; category: string; category_id?:string|null;photo: string; price_cents: number; active?: boolean; sku?:string; stock_quantity?:number; commission_rate?:number|null };
export type Service = Product & { duration_minutes: number; custom_commission_rate?:number|null };
export type Professional = { id: string; name: string; photo: string; service_ids: string[]; active?: boolean; default_service_commission?:number; default_product_commission?:number; staff_phone?:string|null };
export type DayRule = { weekday: number; closed: boolean; opens_at: string | null; closes_at: string | null; break_start: string | null; break_end: string | null };
export type WorkingHour = DayRule & { professional_id: string | null };
export type Block = { id: string; professional_id: string | null; professional_name: string | null; starts_at: string; ends_at: string; reason: string };
export type Reward = {type:'FREE_SERVICE'|'FREE_PRODUCT'|'DISCOUNT_PERCENT'|'DISCOUNT_FIXED';value:number;reference_id:string|null;item_name:string|null;available:boolean};
export type Loyalty = { is_active:boolean;program_name:string; accumulation_type:'STAMPS_PER_SERVICE'|'POINTS_PER_CURRENCY'; include_products:boolean; points_per_real:number; min_spend_amount:number;
  target_value:number;reward_type:Reward['type'];reward_value:number;reward_reference_id:string|null;points_expiration_days:number;rules_description:string;reward?:Reward };
export type Ledger = {config:Loyalty;balance:number;eligible:boolean;items:{id:string;kind:string;delta:number;reason:string;expires_at:string|null;created_at:string;reward_snapshot:Reward|null}[];has_more:boolean};
export type Order = {id:string;client_id:string;client_name?:string;client_phone?:string;professional_id:string|null;modality:'RETIRADA_NO_LOCAL'|'ENTREGA';delivery_address:string;
  status:'PENDENTE'|'CONCLUIDO'|'CANCELADO';created_at:string;completed_at:string|null;total_cents:number;items:{product_id:string;name_snapshot:string; quantity:number;unit_cents:number}[]};
export type OrderPage = {items:Order[];has_more:boolean};
export type Store = { tenant: Tenant; flags: Flags; services: Service[]; products: Product[]; professionals: Professional[]; hours: DayRule[]; loyalty:Loyalty|null };
export type Appointment = { id: string; status: Status; starts_at: string; ends_at: string; professional_id: string; professional_name?: string; total_cents: number;
  line_items: { id: string; name: string; price_cents: number; duration_minutes: number }[]; client_name?: string; client_phone?: string; source?: string };
export type AppointmentPage = { items: Appointment[]; has_more: boolean };
export type Business = { tenant: Tenant; flags: Flags; confirmation_message_template:string;max_professionals: number; stats: { services: number; professionals: number; today_appointments: number } };

export class ApiError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
type Call = { method?: string; body?: object; signal?: AbortSignal };
export async function api<T>(path: string, { method = 'GET', body, signal }: Call = {}): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(`/api${path}`, { method, signal, headers: body && !form ? { 'Content-Type': 'application/json' } : undefined,
    body: form ? body : body ? JSON.stringify(body) : undefined });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, (data?.fields?.[0]?.field ? `${data.fields[0].field}: ${data.fields[0].message}` : data?.error) ?? 'O serviço está indisponível.');
  return data as T;
}

export function useResource<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ path: string; version: number; data?: T; error?: string }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }).then(data => setResult({ path, version, data })).catch(error => {
      if (!controller.signal.aborted) setResult({ path, version, error: message(error) });
    });
    return () => controller.abort();
  }, [path, version]);
  const current = result?.path === path ? result : undefined;
  return { data: current?.data, error: current?.version === version ? current.error : undefined,
    loading: Boolean(path && current?.version !== version), refresh: () => setVersion(value => value + 1) };
}

export const message = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
export const currency = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const dateKey = (timeZone: string) => new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format();
export const addDays = (date: string, days: number) => { const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + days); return day.toISOString().slice(0, 10); };
export const dateTime = (iso: string, timeZone: string, style: 'long' | 'time' = 'long') => new Intl.DateTimeFormat('pt-BR', {
  timeZone, ...(style === 'long' ? { dateStyle: 'medium' } : {}), timeStyle: 'short',
}).format(new Date(iso));
export const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const statusLabel: Record<Status, string> = { PENDENTE: 'Pendente', CONFIRMADO: 'Confirmado', EM_ATENDIMENTO:'Em atendimento', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado', NO_SHOW: 'Não compareceu' };
export function rewardLabel(prize:Reward) {
  return prize.type==='DISCOUNT_FIXED'?`${currency(prize.value)} de desconto`:prize.type==='DISCOUNT_PERCENT'?`${prize.value}% de desconto`:
    prize.item_name ? `${prize.item_name} grátis` : prize.type==='FREE_PRODUCT'?'Produto grátis':'Serviço grátis';
}
