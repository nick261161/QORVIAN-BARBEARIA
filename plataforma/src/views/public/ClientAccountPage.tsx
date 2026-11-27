'use client';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from '@/lib/navigation';
import { api, currency, message, useResource, type AppointmentPage, type Session } from '../../services/api.js';
import { AccessForm, useSession } from '../../contexts/AuthContext.js';
import { useStore } from './HomePage.js';
import { AppointmentLine, FormPanel, Notice, Result, useAction, useFeatureFlags } from '../../components/ui/index.js';
import { LoyaltyCard, OrderHistory } from './StorePages.js';
import {PasswordInput} from '@/components/ui/PasswordInput';
import {SupportNotice} from '@/components/layout/SupportNotice';

export function ClientArea() {
  const { tenant, flags } = useStore();
  const { session, loading, error } = useSession();
  if (loading || error) return <main className="largura pagina"><Notice loading={loading} error={error} /></main>;
  if (session?.slug === tenant.slug && session.role === 'OWNER') return <Navigate replace to={`/gestao/${tenant.slug}`} />;
  if (session?.slug === tenant.slug && session.role === 'STAFF') return <Navigate replace to={`/equipe/${tenant.slug}`} />;
  return <main className="largura pagina"><SupportNotice/><Link className="voltar" to={`/loja/${tenant.slug}`}>Voltar à vitrine</Link>
    {session?.slug === tenant.slug && session.role === 'CLIENT' ? <Account key={session.id} session={session} /> :
      <section className="painel acesso"><h1>Minha conta</h1><p>Entre para ver ou gerenciar suas reservas.</p><AccessForm slug={tenant.slug} allowRegistration onSuccess={() => {}} /></section>}
    {flags.enable_online_booking && session?.slug === tenant.slug&&!session.read_only_support && <Link className="botao primario" to={`/loja/${tenant.slug}/agendar`}>Novo agendamento</Link>}
  </main>;
}

function Account({ session }: { session: Session }) {
  const { tenant, flags } = useStore();
  const enabled = useFeatureFlags(flags);
  const { authenticate } = useSession();
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<string>();
  const base = `/client/${tenant.slug}`;
  const agenda = useResource<AppointmentPage>(`${base}/appointments?page=${page}`);
  const action = useAction(agenda.refresh);
  const edit = useAction();
  const password=useAction();
  const [name, setName] = useState(session.name);
  const [phone, setPhone] = useState(session.phone);
  function profile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void edit.perform(async () => {
      const next = await api<Session>(`${base}/profile`, { method: 'PATCH', body: { name, phone } });
      authenticate(next); setName(next.name); setPhone(next.phone);
    });
  }
  return <><div className="cabecalho-pagina"><h1>Olá, {session.name.split(' ')[0]}.</h1></div>
    <div className="conta-grade"><section className="painel"><h2>Meus agendamentos</h2>
      <Notice error={agenda.error} loading={agenda.loading && !agenda.data} empty={!agenda.data?.items.length ? 'Nenhuma reserva neste histórico.' : undefined} />
      <Result error={action.error} success={action.success} />
      <ul className="linhas">{agenda.data?.items.map(item => {
        const canCancel = !session.read_only_support&&enabled('enable_client_cancellation') && ['PENDENTE', 'CONFIRMADO'].includes(item.status) && Date.parse(item.starts_at) - Date.now() >= tenant.cancellation_minutes * 60000;
        return <AppointmentLine key={item.id} item={item} timezone={tenant.timezone}><span>{currency(item.total_cents)}</span>
          {canCancel && (confirm === item.id ? <><button className="botao perigo" disabled={action.pending} onClick={() => {
            void action.perform(() => api(`${base}/appointments/${item.id}/cancel`, { method: 'POST' }), 'Reserva cancelada.').then(success => { if (success) setConfirm(undefined); });
          }}>Confirmar cancelamento</button><button className="botao secundario" onClick={() => setConfirm(undefined)}>Voltar</button></> : <button className="botao secundario" onClick={() => setConfirm(item.id)}>Cancelar reserva</button>)}
        </AppointmentLine>;
      })}</ul>
      {(page > 1 || agenda.data?.has_more) && <div className="acoes"><button className="botao secundario" onClick={() => setPage(value => value - 1)} disabled={page === 1}>Anterior</button><button className="botao secundario" onClick={() => setPage(value => value + 1)} disabled={!agenda.data?.has_more}>Próxima</button></div>}
      {enabled('enable_client_cancellation') && <p className="suave">Antecedência mínima para cancelamento: {tenant.cancellation_minutes} min.</p>}
    </section>{!session.read_only_support&&<FormPanel title="Meu perfil" submit={profile} pending={edit.pending}>
      <label>Nome completo<input value={name} required onChange={event => setName(event.target.value)} /></label>
      <label>Telefone / WhatsApp<input value={phone} type="tel" required onChange={event => setPhone(event.target.value)} /></label>
      <Result error={edit.error} success={edit.success} />
    </FormPanel>}</div>
    {!session.read_only_support&&<FormPanel title="Alterar senha" pending={password.pending} submit={event=>{
      event.preventDefault();
      const form=event.currentTarget;
      void password.perform(async()=>{
        await api(`${base}/password`,{method:'PATCH',body:Object.fromEntries(new FormData(form))});
        form.reset();
      },'Senha atualizada.');
    }}>
      <label>Senha atual<PasswordInput name="current_password" autoComplete="current-password" minLength={8} maxLength={72} required/></label>
      <label>Nova senha<PasswordInput name="new_password" autoComplete="new-password" minLength={8} maxLength={72} required/></label>
      <Result error={password.error} success={password.success}/>
    </FormPanel>}
    <div className="conta-grade"><OrderHistory base={base} timezone={tenant.timezone}/>{flags.enable_loyalty_club&&<LoyaltyCard endpoint={`${base}/loyalty`} timezone={tenant.timezone}/>}</div>
  </>;
}
