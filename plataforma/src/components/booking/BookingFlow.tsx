'use client';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Check, Clock3, Scissors, UserRound } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { addDays, api, ApiError, currency, dateKey, dateTime, message, useResource, type Appointment, type Professional, type Service, type Session, type Tenant } from '../../services/api.js';
import { AccessForm, useSession } from '../../contexts/AuthContext.js';
import { Notice } from '../ui/index.js';

const labels = ['Serviços', 'Profissional', 'Data e horário', 'Confirmar'];
type Props = { tenant: Tenant; services: Service[]; professionals: Professional[]; initial?: string | null; suggested?:string|null; manual?: boolean; onDone?: () => void };

export function BookingFlow({ tenant, services, professionals, initial, suggested,manual = false, onDone }: Props) {
  const { session, loading } = useSession();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(() => initial && services.some(item => item.id === initial) ? [initial] : []);
  const [person, setPerson] = useState('');
  const [date, setDate] = useState(() => dateKey(tenant.timezone));
  const [start, setStart] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState<Appointment>();
  const items = services.filter(item => selected.includes(item.id));
  const price = items.reduce((sum, item) => sum + item.price_cents, 0);
  const minutes = items.reduce((sum, item) => sum + item.duration_minutes, 0);
  const staff = professionals.filter(professional => selected.every(id => professional.service_ids.includes(id)));
  const base = manual ? `/owner/${tenant.slug}` : `/public/${tenant.slug}`;
  const params = new URLSearchParams({ date, professional_id: person, service_ids: selected.join(',') });
  const slots = useResource<{ starts: string[] }>(step >= 2 && person && !booked ? `${base}/available-slots?${params}` : null);
  const authorized = session?.role === 'CLIENT' && session.slug === tenant.slug;
  const today = dateKey(tenant.timezone);
  const last = addDays(today, manual ? 365 : 90);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);

  function changeStep(next: number) { setError(''); setStep(next); }
  function turnService(id: string) {
    setSelected(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id]);
    setPerson(''); setStart('');
  }
  function chooseDate(value: string) {
    if (value && value >= today && value <= last) { setDate(value); setStart(''); }
  }
  async function submit(event?: FormEvent<HTMLFormElement>, account?: Session) {
    event?.preventDefault();
    if (!manual && !authorized && !(account?.role === 'CLIENT' && account.slug === tenant.slug)) return;
    const client = manual && event ? Object.fromEntries(new FormData(event.currentTarget)) : {};
    setError(''); setPending(true);
    try {
      const appointment = await api<Appointment>(manual ? `${base}/agenda` : '/appointments', { method: 'POST', body: {
        service_ids: selected, professional_id: person, starts_at: start, ...(manual ? client : { slug: tenant.slug }),
      } });
      setBooked(appointment); onDone?.();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) { slots.refresh(); setStart(''); setStep(2); }
      setError(message(failure));
    } finally { setPending(false); }
  }

  if (booked) return <section className="painel reserva-sucesso"><span className="icone-suave"><Check size={25} /></span><h2>{manual ? 'Encaixe confirmado' : 'Reserva recebida'}</h2>
    <p>{booked.line_items.map(item => item.name).join(' + ')} com {staff.find(item => item.id === person)?.name}.</p>
    <strong>{dateTime(booked.starts_at, tenant.timezone)} · {currency(booked.total_cents)}</strong>
    {!manual && <Link className="botao primario" to={`/loja/${tenant.slug}/conta`}>Ver meus agendamentos</Link>}
  </section>;

  return <div className="reserva-grid">
    <section className="painel fluxo">
      <ol className="etapas" aria-label="Etapas do agendamento">{labels.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-concluida={index < step}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}</li>)}</ol>
      <h2 ref={heading} tabIndex={-1}>{['O que vamos fazer?', 'Quem vai atender?', 'Quando você quer vir?', 'Revise e confirme'][step]}</h2>
      {step === 0 && <div className="opcoes">
        {services.map(item => <button type="button" className="opcao" key={item.id} aria-pressed={selected.includes(item.id)} disabled={!selected.includes(item.id) && selected.length >= 8} onClick={() => turnService(item.id)}>
          <span className="icone-suave"><Scissors size={17} /></span><span><strong>{item.name}</strong><small>{item.duration_minutes} min · {currency(item.price_cents)}</small></span>{selected.includes(item.id) && <Check size={18} />}
        </button>)}{!services.length && <Notice empty="Nenhum serviço disponível." />}
      </div>}
      {step === 1 && <div className="opcoes">
        {staff.map(item => <button type="button" className="opcao" key={item.id} aria-pressed={person === item.id} onClick={() => { setPerson(item.id); setStart(''); }}>
          {item.photo ? <OptimizedImage className="avatar" src={item.photo} alt="" /> : <span className="icone-suave"><UserRound size={18} /></span>}<strong>{item.name}</strong>{person === item.id && <Check size={18} />}
        </button>)}{!staff.length && <Notice empty="Nenhum profissional faz todos os serviços selecionados. Volte e ajuste a seleção." />}
      </div>}
      {step === 2 && <div className="formulario">
        <label>Data<input type="date" min={today} max={last} value={date} onInput={event => chooseDate(event.currentTarget.value)} onChange={event => chooseDate(event.currentTarget.value)} /></label>
        <div className="acoes"><button type="button" className="botao secundario" disabled={date <= today} onClick={() => chooseDate(addDays(date, -1))}>Dia anterior</button>
          <button type="button" className="botao secundario" disabled={date >= last} onClick={() => chooseDate(addDays(date, 1))}>Próximo dia</button></div>
        <Notice error={slots.error} loading={slots.loading} empty={slots.data?.starts.length === 0 ? 'Sem horários livres nesse dia. Escolha outra data.' : undefined} />
        <div className="slots">{slots.data?.starts.map(iso => <button type="button" className="botao secundario" key={iso} aria-pressed={iso === start} onClick={() => setStart(iso)}>{dateTime(iso, tenant.timezone, 'time')}</button>)}</div>
      </div>}
      {step === 3 && (manual ? <form className="formulario" onSubmit={submit} id="confirmacao-manual">
        <label>Nome do cliente<input name="client_name" minLength={2} maxLength={100} required /></label><label>WhatsApp do cliente<input name="client_phone" type="tel" required /></label>
      </form> : authorized ? <p>Reserva em nome de <strong>{session.name}</strong>.</p> : loading ? <Notice loading /> :
        <><p>Entre ou crie sua conta para continuar com a reserva.</p><AccessForm slug={tenant.slug} allowRegistration onSuccess={account => { if (account.role !== 'CLIENT') setError('Use uma conta de cliente para reservar.'); }} /></>)}
      {error && <p className="erro" role="alert">{error}</p>}
      <div className="fluxo-acoes acoes">
        {step > 0 && <button type="button" className="botao secundario" disabled={pending} onClick={() => changeStep(step - 1)}>Voltar</button>}
        {step < 3 && <button className="botao primario" type="button" disabled={step === 0 ? !selected.length : step === 1 ? !person : !start || slots.loading || !slots.data?.starts.includes(start)} onClick={() => {
          if (step === 0) setPerson(staff.find(item=>item.id===suggested)?.id??(staff.length===1?staff[0].id:''));
          changeStep(step + 1);
        }}>Continuar</button>}
        {step === 3 && manual && <button className="botao primario" form="confirmacao-manual" disabled={pending}>Confirmar encaixe</button>}
        {step === 3 && authorized && !manual && <button type="button" className="botao primario" disabled={pending} onClick={() => void submit()}>{pending ? 'Confirmando…' : 'Confirmar reserva'}</button>}
      </div>
    </section>
    <aside className="painel resumo-reserva"><span className="icone-suave"><CalendarDays size={20} /></span><h2>Sua reserva</h2>
      {items.length ? <ul>{items.map(item => <li key={item.id}><span>{item.name}</span><strong>{currency(item.price_cents)}</strong></li>)}</ul> : <p>Escolha seus serviços.</p>}
      {person && <p><UserRound size={17} /> {staff.find(item => item.id === person)?.name}</p>}
      {start && <p><Clock3 size={17} /> {dateTime(start, tenant.timezone)} · {minutes} min</p>}
      <div className="reserva-total"><span>Total</span><strong>{currency(price)}</strong></div>
    </aside>
  </div>;
}
