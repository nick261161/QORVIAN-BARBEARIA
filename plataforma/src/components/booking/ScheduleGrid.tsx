'use client';
import { Fragment,useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Temporal } from '@js-temporal/polyfill';
import { whatsappLink } from '@/utils/whatsappLink';
import { currency,dateTime,statusLabel,type Appointment,type DayRule,type Professional,type Tenant } from '../../services/api.js';

function minutes(time:string){const [h,m]=time.split(':').map(Number);return h*60+m;}
const print=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;

export function ScheduleGrid({items,people,tenant,hours,day,actions,allowContact=true}:{items:Appointment[];people:Pick<Professional,'id'|'name'>[];tenant:Tenant;hours:DayRule[];day:string;actions:(item:Appointment)=>React.ReactNode;allowContact?:boolean}){
  const interval=tenant.slot_minutes;
  const scheduled=hours.find(rule=>rule.weekday===new Date(`${day}T12:00:00Z`).getUTCDay());
  const starts=items.map(item=>minutes(dateTime(item.starts_at,tenant.timezone,'time')));
  const ends=items.map(item=>minutes(dateTime(item.ends_at,tenant.timezone,'time')));
  const first=Math.floor(Math.min(minutes(scheduled?.opens_at??'09:00'),...starts)/interval)*interval;
  const last=Math.min(1440,Math.ceil(Math.max(minutes(scheduled?.closes_at??'17:00'),...ends)/interval)*interval);
  const columns=people.length?people:Array.from(new Map(items.map(item=>[item.professional_id,{id:item.professional_id,name:item.professional_name??'Profissional'}])).values());
  if(!columns.length)return <p className="vazio">Nenhum profissional para mostrar.</p>;
  const byTime=new Map<string,Appointment[]>();
  items.forEach((item,index)=>{const key=`${item.professional_id}:${Math.floor(starts[index]/interval)*interval}`;byTime.set(key,[...(byTime.get(key)??[]),item]);});
  return <div className="cronograma" tabIndex={0} aria-label="Agenda em grade por profissional"><table><thead><tr><th scope="col">Hora</th>{columns.map(person=><th scope="col" key={person.id}>{person.name}</th>)}</tr></thead><tbody>
    {Array.from({length:Math.max(1,(last-first)/interval)},(_,index)=>first+index*interval).map(time=><tr key={time}><th scope="row">{print(time)}</th>{columns.map(person=><td key={person.id}>
      {byTime.get(`${person.id}:${time}`)?.map(item=><article className="cronograma-card" key={item.id}><p><strong>{dateTime(item.starts_at,tenant.timezone,'time')}–{dateTime(item.ends_at,tenant.timezone,'time')}</strong> · {currency(item.total_cents)}</p>
        <strong>{item.client_name}</strong>{allowContact&&item.client_phone&&<a href={`https://wa.me/${item.client_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        <p>{item.line_items.map(line=>line.name).join(' + ')}</p><div className="acoes"><span className="estado" data-status={item.status}>{statusLabel[item.status]}</span>{actions(item)}</div>
      </article>)}</td>)}</tr>)}
  </tbody></table></div>;
}

export function AppointmentActions({item,staff=false,pending,save,tenant,template,reschedule}:{item:Appointment;staff?:boolean;pending:boolean;
  save:(status:Appointment['status'])=>void;tenant:Tenant;template?:string;reschedule:(start:string)=>Promise<boolean>}){
  const [editing,setEditing]=useState(false);
  const [confirmCancel,setConfirmCancel]=useState(false);
  const [dateError,setDateError]=useState('');
  if(!['PENDENTE','CONFIRMADO','EM_ATENDIMENTO'].includes(item.status))return null;
  const started=Date.parse(item.starts_at)<=Date.now();
  const canMessage=['PENDENTE','CONFIRMADO'].includes(item.status);
  const url=canMessage&&template&&item.client_phone?whatsappLink(item.client_phone,template,{
    cliente:item.client_name??'',servico:item.line_items.map(line=>line.name).join(' + '),profissional:item.professional_name??'',
    data:new Intl.DateTimeFormat('pt-BR',{timeZone:tenant.timezone}).format(new Date(item.starts_at)),
    horario:dateTime(item.starts_at,tenant.timezone,'time'),valor:currency(item.total_cents),empresa:tenant.name,endereco:tenant.site.address,
  }):null;
  return <Fragment>{item.status==='PENDENTE'&&<button className="botao secundario" disabled={pending} onClick={()=>save('CONFIRMADO')}>Confirmar</button>}
    {started&&<>{!staff&&item.status!=='EM_ATENDIMENTO'&&<button className="botao secundario" disabled={pending} onClick={()=>save('EM_ATENDIMENTO')}>Iniciar</button>}
      <button className="botao primario" disabled={pending} onClick={()=>save('CONCLUIDO')}>Concluir</button><button className="botao secundario" disabled={pending} onClick={()=>save('NO_SHOW')}>Não compareceu</button></>}
    {!started&&canMessage&&<button type="button" className="botao secundario" disabled={pending} onClick={()=>{setEditing(value=>!value);setDateError('');}}>{editing?'Fechar reagendamento':'Reagendar'}</button>}
    {url&&<a className="botao secundario" href={url} target="_blank" rel="noopener noreferrer" aria-disabled={pending} onClick={event=>{
      if(pending){event.preventDefault();return;}
      if(item.status==='PENDENTE')save('CONFIRMADO');
    }}><MessageCircle size={16}/> Enviar Confirmação</a>}
    {(!staff||canMessage)&&<button className="botao perigo" disabled={pending} onClick={()=>{
      if(confirmCancel){setConfirmCancel(false);save('CANCELADO');}else setConfirmCancel(true);
    }}>{confirmCancel?'Confirmar cancelamento':'Cancelar'}</button>}
    {confirmCancel&&<button type="button" className="botao secundario" onClick={()=>setConfirmCancel(false)}>Manter agendamento</button>}
    {editing&&<form className="agenda-reagendar" onSubmit={event=>{
      event.preventDefault();
      try{
        const input=String(new FormData(event.currentTarget).get('start'));
        const value=Temporal.PlainDateTime.from(input).toZonedDateTime(tenant.timezone,{disambiguation:'reject'}).toInstant().toString();
        setDateError('');void reschedule(value).then(saved=>{if(saved)setEditing(false);});
      }catch{setDateError('Informe uma data e um horário válidos.');}
    }}><label>Novo horário<input name="start" type="datetime-local" required step={1800}
      min={Temporal.Now.plainDateTimeISO(tenant.timezone).round({smallestUnit:'minute',roundingIncrement:30,roundingMode:'ceil'}).toString({smallestUnit:'minute'})}
      defaultValue={Temporal.Instant.from(item.starts_at).toZonedDateTimeISO(tenant.timezone).toPlainDateTime().toString({smallestUnit:'minute'})}/></label>
      {dateError&&<p className="erro" role="alert">{dateError}</p>}
      <button className="botao primario" disabled={pending}>Salvar novo horário</button>
    </form>}
  </Fragment>;
}
