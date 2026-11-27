'use client';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, currency, dateKey, useResource, type Business,type Professional } from '../../services/api.js';
import { Notice,useAction } from '../../components/ui/index.js';
import { exportReports,type ExportFormat,type ReportTable } from '@/utils/exportReports';

type Summary={occupancy:number;occupied_minutes:number;capacity_minutes:number;estimated_cents:number;completed_cents:number;gross_cents:number;services_cents:number;products_cents:number;commission_cents:number;
  net_cents:number;margin_percent:number;net_change_cents:number;net_change_percent:number|null;series:{date:string;services:number;products:number;commission:number}[];
  change_percent:number|null;staff:{name:string;visits:number;gross:number;commission:number;average:number;share:number}[]};
type Personal=Pick<Summary,'gross_cents'|'services_cents'|'products_cents'|'commission_cents'|'series'> & {visits:number;average:number};
const percent=(value:number)=>`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value)}%`;
function bounds(mode:string,day:string,month:string){
  if(mode==='day')return[day,day];
  if(mode==='week'){const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();const monday=addDays(day,-((weekday+6)%7));return[monday,addDays(monday,6)];}
  const [year,number]=month.split('-').map(Number);
  const end=new Date(Date.UTC(year,number,0)).toISOString().slice(0,10);
  return[`${month}-01`,end];
}

export function FinancialReports({base,business,timezone}:{base:string;business?:Business;timezone?:string}){
  const personal=!business;
  const now=dateKey(timezone??business!.tenant.timezone);
  const [mode,setMode]=useState('week');const [date,setDate]=useState(now);const [month,setMonth]=useState(now.slice(0,7));const [person,setPerson]=useState('');
  const [from,to]=bounds(mode,date,month);
  const people=useResource<Professional[]>(personal?null:`${base}/professionals`);
  const data=useResource<Summary|Personal>(`${base}/reports?${new URLSearchParams({from,to,...(person?{professional_id:person}:{})})}`);
  const report=data.data;
  const company=report&&'staff' in report?report:undefined;
  const metrics=report?[
    [personal?'Meu faturamento':'Faturamento bruto',currency(report.gross_cents)],['Serviços',currency(report.services_cents)],['Produtos',currency(report.products_cents)],
    [personal?'Minhas comissões':'Comissões a pagar',currency(report.commission_cents)],
    ...(company?[
      ['Rendimento da casa',currency(company.net_cents)],['Margem da casa',percent(company.margin_percent)],
      ['Variação de rendimento',`${currency(company.net_change_cents)}${company.net_change_percent===null?'':` · ${percent(company.net_change_percent)}`}`],
      ['Crescimento do faturamento',company.change_percent===null?'Sem base de comparação':percent(company.change_percent)],
      ['Ocupação da agenda',percent(company.occupancy)],
    ]:'visits' in report?[['Meus atendimentos',String(report.visits)],['Ticket médio',currency(report.average)]]:[]),
  ]:[];
  const exporting=useAction();
  function download(format:ExportFormat){
    if(!report||data.loading)return;
    const tables:ReportTable[]=[
      {title:'Indicadores',head:['Indicador','Valor'],rows:metrics},
      {title:'Faturamento diário',head:['Data','Serviços (R$)','Produtos (R$)','Comissões (R$)'],rows:report.series.map(row=>[row.date,row.services/100,row.products/100,row.commission/100])},
    ];
    if(company)tables.push({title:'Desempenho da equipe',head:['Funcionário','Atendimentos','Ticket médio (R$)','Faturamento (R$)','Comissões (R$)','Participação'],rows:company.staff.map(row=>[row.name,row.visits,row.average/100,row.gross/100,row.commission/100,percent(row.share)])});
    void exporting.perform(()=>exportReports(format,`${from} a ${to}`,tables));
  }
  return <><section className="painel formulario"><h2>Período financeiro</h2><div className="form-quatro">
    <label>Período<select value={mode} onChange={event=>setMode(event.target.value)}><option value="day">Diário</option><option value="week">Semanal</option><option value="month">Mensal</option></select></label>
    {mode==='month'?<label>Mês<input type="month" value={month} onChange={event=>{if(event.target.value)setMonth(event.target.value);}}/></label>:<label>{mode==='week'?'Dia da semana selecionada':'Data'}<input type="date" value={date} onChange={event=>{if(event.target.value)setDate(event.target.value);}}/></label>}
    {!personal&&<label>Funcionário<select value={person} onChange={event=>setPerson(event.target.value)}><option value="">Todos</option>{people.data?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
  </div><p className="suave">{personal?'Seus atendimentos e vendas concluídos.':'Receita de atendimentos e pedidos concluídos. O rendimento desconta comissões.'}</p>
    <div className="acoes">{(['pdf','xlsx','csv'] as const).map(format=><button type="button" className="botao secundario" key={format} disabled={!report||data.loading||exporting.pending} onClick={()=>download(format)}>Exportar {format==='xlsx'?'Excel':format.toUpperCase()}</button>)}</div>
    <Notice loading={data.loading} error={data.error??people.error??exporting.error}/></section>
  {report&&<><div className="metricas">{metrics.map(([label,value])=><article className="painel metrica" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
  <section className="painel"><h2>Faturamento por dia</h2><div className="grafico" aria-label="Gráfico de serviços, produtos e comissões">
    <ResponsiveContainer width="100%" height={290}><BarChart data={report.series}><CartesianGrid strokeDasharray="3 3" vertical={false}/>
      <XAxis dataKey="date" tickFormatter={value=>String(value).slice(5).split('-').reverse().join('/')}/><YAxis tickFormatter={value=>`R$ ${Number(value)/100}`}/>
      <Tooltip formatter={value=>currency(Number(value))}/><Legend/><Bar name="Serviços" dataKey="services" fill="#315136"/><Bar name="Produtos" dataKey="products" fill="#8da85a"/><Bar name="Comissões" dataKey="commission" fill="#bd8752"/>
    </BarChart></ResponsiveContainer></div></section>
  {company&&<section className="painel"><h2>Desempenho por funcionário</h2><div className="tabela"><table><thead><tr><th>Funcionário</th><th>Atendimentos</th><th>Ticket médio</th><th>Faturamento</th><th>Comissões</th><th>Participação</th></tr></thead><tbody>
    {company.staff.map((item,index)=><tr key={`${item.name}-${index}`}><th scope="row">{item.name}</th><td>{item.visits}</td><td>{currency(item.average)}</td><td>{currency(item.gross)}</td><td>{currency(item.commission)}</td><td>{percent(item.share)}</td></tr>)}
  </tbody></table></div></section>}</>}
  </>;
}
