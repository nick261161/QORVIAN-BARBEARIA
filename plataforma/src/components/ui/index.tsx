'use client';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { CalendarDays, Scissors } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { dateTime, message, statusLabel, type Appointment, type Tenant } from '../../services/api.js';

function foreground(hex: string) {
  const linear = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2] > .179 ? '#121a13' : '#ffffff';
}
export function theme(tenant: Tenant) {
  const { primary, secondary } = tenant.site;
  return { '--marca': primary, '--destaque': secondary, '--texto-marca': foreground(primary), '--texto-destaque': foreground(secondary) } as CSSProperties;
}

export function Brand({ title = 'Agenda', url = '/', logo }: { title?: string; url?: string; logo?: string }) {
  return <Link to={url} className="marca">{logo ? <OptimizedImage src={logo} alt="" /> : <span><Scissors size={21} /></span>}{title}</Link>;
}

export function Notice({ error, loading, empty }: { error?: string; loading?: boolean; empty?: string }) {
  if (error) return <p className="erro" role="alert">{error}</p>;
  if (loading) return <p className="vazio" role="status">Carregando…</p>;
  return empty ? <p className="vazio">{empty}</p> : null;
}

export function useAction(refresh?: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function perform(action: () => Promise<unknown>, successMessage = 'Alterações salvas.') {
    setPending(true); setError(''); setSuccess('');
    try { await action(); setSuccess(successMessage); refresh?.(); return true; }
    catch (failure) { setError(message(failure)); return false; }
    finally { setPending(false); }
  }
  return { perform, error, pending, success };
}

export function Result({ error, success }: { error: string; success: string }) {
  return error ? <p className="erro" role="alert">{error}</p> : success ? <p className="sucesso" role="status">{success}</p> : null;
}

export function FormPanel({ title, submit, pending, children, label = 'Salvar' }: { title?: string; submit: (event: FormEvent<HTMLFormElement>) => void; pending?: boolean; children: ReactNode; label?: string }) {
  return <form className="painel formulario" onSubmit={submit}>
    {title && <h2>{title}</h2>}{children}<div className="acoes"><button className="botao primario" disabled={pending}>{pending ? 'Aguarde…' : label}</button></div>
  </form>;
}

export function AppointmentLine({ item, timezone, children }: { item: Appointment; timezone: string; children?: ReactNode }) {
  return <li className="linha-dados"><span className="icone-suave"><CalendarDays size={19} /></span><div className="corpo-linha">
    <strong>{item.line_items.map(line => line.name).join(' + ')}</strong><p>{dateTime(item.starts_at, timezone)} · {item.professional_name}</p>
    {item.client_name && <p>{item.client_name}{item.client_phone && <> · <a href={`https://wa.me/${item.client_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a></>}</p>}
  </div><div className="acoes"><span className="estado" data-status={item.status}>{statusLabel[item.status]}</span>{children}</div></li>;
}
export { useFeatureFlags } from '../../hooks/useFeatureFlags.js';
export { useDocumentTitle as usePageTitle } from '../../hooks/useDocumentTitle.js';
