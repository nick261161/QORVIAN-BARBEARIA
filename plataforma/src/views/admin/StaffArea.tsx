'use client';
import { lazy,Suspense,useState } from 'react';
import { CalendarDays,ChartNoAxesCombined,LogOut,UserRound } from 'lucide-react';
import { Link,useNavigate,useParams } from '@/lib/navigation';
import { api,dateKey,useResource,type AppointmentPage,type DayRule,type Tenant } from '../../services/api.js';
import { AccessForm,useSession } from '../../contexts/AuthContext.js';
import { Brand,Notice,Result,useAction } from '../../components/ui/index.js';
import { AppointmentActions,ScheduleGrid } from '../../components/booking/ScheduleGrid.js';
import { Pagination } from '../public/StorePages.js';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { StaffProfile } from './StaffProfile';
import {SupportNotice} from '@/components/layout/SupportNotice';
const FinancialReports=lazy(()=>import('./AdminReportsPage').then(module=>({default:module.FinancialReports})));

export function StaffArea({store,section='agenda'}:{store?:string;section?:string}={}){
  const params=useParams();const slug=store??String(params.slug??'');
  const {session,loading,error,logout}=useSession();
  const navigate=useNavigate();
  const allowed=session?.role==='STAFF'&&session.slug===slug;
  const data=useResource<{tenant:Tenant;confirmation_message_template:string;flags:{enable_reports:boolean;enable_manual_whatsapp_confirmation:boolean}}>(allowed?`/staff/${slug}`:null);
  const action=useAction();
  if(loading||error)return <main className="largura pagina"><Notice loading={loading} error={error}/></main>;
  if(!allowed)return <main className="largura pagina acesso-wrap"><Brand url={`/loja/${slug}`}/><section className="painel acesso"><h1>Área da equipe</h1><p>Entre com sua conta de funcionário.</p><AccessForm slug={slug} onSuccess={account=>{if(account.role==='STAFF')navigate('/admin/agenda');}}/></section></main>;
  const active=section||'agenda';
  const title=active==='meu-perfil'?'Meu perfil':active==='relatorios'?'Meus relatórios':'Minha agenda';
  const tabs=[
    {path:'agenda',label:'Minha agenda',icon:CalendarDays},
    ...(data.data?.flags.enable_reports?[{path:'relatorios',label:'Meus relatórios',icon:ChartNoAxesCombined}]:[]),
    {path:'meu-perfil',label:'Meu perfil',icon:UserRound},
  ];
  return <div className="painel-app">
    <header className="topo-gestao"><div className="linha-topo largura-painel"><Brand title={data.data?.tenant.name} url="/admin/agenda" logo={data.data?.tenant.site.logo}/>
      <div className="acoes"><Link className="botao secundario" to={`/loja/${slug}`}>Vitrine</Link><button className="botao secundario quadrado" aria-label="Sair" onClick={()=>void action.perform(async()=>{await logout();navigate(`/loja/${slug}/entrar`);})}><LogOut size={18}/></button></div></div></header>
    <SupportNotice/>
    <div className="layout-painel largura-painel"><AdminSidebar path="/admin" tabs={tabs} label="Painel da equipe"/>
      <main className="conteudo-painel"><div className="cabecalho-pagina"><p className="suave">Área da equipe</p><h1>{title}</h1></div>
        <Notice loading={data.loading} error={data.error??action.error}/>
        {data.data&&(active==='meu-perfil'?(session.read_only_support?<Notice empty="As configurações pessoais ficam disponíveis ao funcionário."/>:<StaffProfile base={`/staff/${slug}`} template={data.data.confirmation_message_template}/>):active==='relatorios'?
          data.data.flags.enable_reports?<Suspense fallback={<Notice loading/>}><FinancialReports base={`/staff/${slug}`} timezone={data.data.tenant.timezone}/></Suspense>:<Notice empty="Relatórios indisponíveis."/>:
          <StaffAgenda tenant={data.data.tenant} person={{id:session.professional_id??'',name:session.name}} readOnly={session.read_only_support}
            template={data.data.flags.enable_manual_whatsapp_confirmation?data.data.confirmation_message_template:undefined}/>)}
      </main>
    </div>
  </div>;
}

function StaffAgenda({tenant,template,readOnly,person}:{tenant:Tenant;template?:string;readOnly?:boolean;person:{id:string;name:string}}){
  const [date,setDate]=useState(()=>dateKey(tenant.timezone));const [page,setPage]=useState(1);const base=`/staff/${tenant.slug}`;
  const agenda=useResource<AppointmentPage>(`${base}/agenda?${new URLSearchParams({from:date,to:date,page:String(page)})}`);const action=useAction(agenda.refresh);
  const store=useResource<{hours:DayRule[]}>(`/public/${tenant.slug}`);
  return <section className="painel formulario"><label>Data<input type="date" value={date} onChange={event=>{if(event.target.value){setDate(event.target.value);setPage(1);}}}/></label><Notice loading={agenda.loading} error={agenda.error} empty={!agenda.data?.items.length?'Nenhum atendimento para este dia.':undefined}/><Result error={action.error} success={action.success}/>
    <ScheduleGrid items={agenda.data?.items??[]} people={[person]} tenant={tenant} hours={store.data?.hours??[]} day={date} allowContact={!readOnly}
      actions={item=>!readOnly&&<AppointmentActions item={item} tenant={tenant} template={template} staff pending={action.pending}
        reschedule={starts_at=>action.perform(()=>api(`${base}/agenda/${item.id}`,{method:'PATCH',body:{starts_at}}),'Horário atualizado.')}
        save={status=>void action.perform(()=>api(`${base}/agenda/${item.id}`,{method:'PATCH',body:{status}}),'Atendimento atualizado.')}/>}/>
    <Pagination page={page} more={agenda.data?.has_more} set={setPage}/></section>;
}
