'use client';
import { useEffect,useRef,useState } from 'react';
import { Link } from '@/lib/navigation';
import type { Status } from '../../../shared/features.js';
import { BookingFlow } from './BookingFlow.js';
import { AppointmentActions,ScheduleGrid } from './ScheduleGrid.js';
import { addDays,api,currency,dateKey,useResource,type Appointment,type AppointmentPage,type Business,type Professional,type Service,type WorkingHour } from '../../services/api.js';
import { AppointmentLine,Notice,Result,useAction } from '../ui/index.js';

function Metrics({ values }: { values: { label: string; value: string | number }[] }) {
  return <div className="metricas">{values.map(item => <article className="painel metrica" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</div>;
}

type Report = { occupancy: number; gross_cents:number; net_cents:number; margin_percent:number };

export function Agenda({ base, business, dashboard }: { base: string; business: Business; dashboard: boolean }) {
  const { tenant, flags } = business;
  const today = dateKey(tenant.timezone);
  const [date, setDate] = useState(today);
  const [period, setPeriod] = useState('day');
  const [person, setPerson] = useState('');
  const [page, setPage] = useState(1);
  const [manual, setManual] = useState(false);
  const [view,setView]=useState('grid');
  const query = new URLSearchParams({ from: date, to: addDays(date, period === 'week' ? 6 : 0), ...(person ? { professional_id: person } : {}) });
  const agenda = useResource<AppointmentPage>(`${base}/agenda?${query}&page=${page}`);
  const people = useResource<Professional[]>(!dashboard || manual ? `${base}/professionals` : null);
  const services = useResource<Service[]>(manual ? `${base}/services` : null);
  const report = useResource<Report>(dashboard && flags.enable_reports ? `${base}/reports?${query}` : null);
  const action = useAction(agenda.refresh);
  const shop=useResource<{hours:WorkingHour[]}>(!dashboard&&view==='grid'?`${base}/hours`:null);
  const upcoming = agenda.data?.items.filter(item => ['PENDENTE', 'CONFIRMADO'].includes(item.status) && Date.parse(item.starts_at) >= Date.now()).slice(0, 5);
  const activePeople = people.data?.filter(item => item.active) ?? [];
  const listed = dashboard ? upcoming : agenda.data?.items;
  const actions=(item:Appointment)=><AppointmentActions item={item} tenant={tenant}
    template={flags.enable_manual_whatsapp_confirmation?business.confirmation_message_template:undefined}
    reschedule={starts_at=>action.perform(()=>api(`${base}/agenda/${item.id}`,{method:'PATCH',body:{starts_at}}),'Horário atualizado.')}
    pending={action.pending} save={(status:Status)=>{
    void action.perform(()=>api(`${base}/agenda/${item.id}`,{method:'PATCH',body:{status}}),'Status atualizado.');
  }}/>;
  return <>
    {dashboard && <Metrics values={[{ label: 'Agendamentos de hoje', value: business.stats.today_appointments ?? agenda.data?.items.length ?? '–' },
      { label: 'Profissionais ativos', value: business.stats.professionals }, { label: 'Serviços ativos', value: business.stats.services },
      ...(flags.enable_reports ? [{ label: 'Ocupação de hoje', value: report.data ? `${report.data.occupancy}%` : '–' }, { label: 'Faturamento bruto', value: report.data ? currency(report.data.gross_cents) : '–' },
        {label:'Rendimento da casa',value:report.data?currency(report.data.net_cents):'–'},{label:'Margem da casa',value:report.data?`${report.data.margin_percent.toFixed(1)}%`:'–'}] : [])]} />}
    {!dashboard && <section className="painel formulario"><div className="titulo-painel"><h2>Filtrar agenda</h2>{flags.enable_manual_booking && <button className="botao primario" onClick={() => setManual(value => !value)}>{manual ? 'Fechar encaixe' : 'Novo encaixe'}</button>}</div>
      <div className="form-quatro"><label>Data inicial<input type="date" value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setPage(1); } }} /></label>
        <label>Visualização<select value={period} onChange={event => { setPeriod(event.target.value); setPage(1); }}><option value="day">Dia</option><option value="week">Semana</option></select></label>
        <label>Profissional<select value={person} onChange={event => { setPerson(event.target.value); setPage(1); }}><option value="">Todos</option>{people.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {period==='day'&&<label>Formato<select value={view} onChange={event=>setView(event.target.value)}><option value="grid">Grade por profissional</option><option value="list">Lista detalhada</option></select></label>}</div>
    </section>}
    {manual && flags.enable_manual_booking && <BookingDialog close={()=>setManual(false)}><Notice error={services.error ?? people.error} loading={!services.data || !people.data} />{services.data && people.data && <BookingFlow manual tenant={tenant} services={services.data.filter(item => item.active)} professionals={flags.enable_multi_professionals ? activePeople : activePeople.slice(0, 1)} onDone={agenda.refresh} />}</BookingDialog>}
    <section className="painel"><div className="titulo-painel"><h2>{dashboard ? 'Próximos clientes de hoje' : 'Agendamentos'}</h2>{dashboard && <Link className="botao secundario" to={`/gestao/${tenant.slug}/agenda`}>Abrir agenda</Link>}</div>
      <Notice error={agenda.error ?? report.error} loading={agenda.loading && !agenda.data} empty={!listed?.length ? 'Nenhum agendamento no período.' : undefined} /><Result error={action.error} success={action.success} />
      {!dashboard&&period==='day'&&view==='grid'?<ScheduleGrid items={listed??[]} people={(people.data??[]).filter(item=>person?item.id===person:item.active||listed?.some(a=>a.professional_id===item.id))} tenant={tenant} day={date} hours={shop.data?.hours.filter(rule=>!rule.professional_id)??[]} actions={actions}/>:
        <ul className="linhas">{listed?.map(item => <AppointmentLine key={item.id} item={item} timezone={tenant.timezone}>{!dashboard&&actions(item)}</AppointmentLine>)}</ul>}
      {!dashboard && (page > 1 || agenda.data?.has_more) && <div className="acoes"><button className="botao secundario" onClick={() => setPage(value => value - 1)} disabled={page === 1}>Anterior</button><button className="botao secundario" onClick={() => setPage(value => value + 1)} disabled={!agenda.data?.has_more}>Próxima</button></div>}
    </section>
  </>;
}

function BookingDialog({children,close}:{children:React.ReactNode;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog className="modal-reserva" ref={dialog} onCancel={close} aria-label="Encaixe manual"><div className="titulo-painel"><h2>Encaixe manual</h2><button className="botao secundario" onClick={close}>Fechar</button></div>{children}</dialog>;
}
