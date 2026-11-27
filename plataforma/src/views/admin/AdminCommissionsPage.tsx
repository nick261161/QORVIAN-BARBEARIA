'use client';
import { useState } from 'react';
import { addDays,currency,dateKey,dateTime,useResource,type Tenant,type Professional } from '../../services/api.js';
import { Notice } from '../../components/ui/index.js';
import { Pagination } from '../public/StorePages.js';

type Record={id:string;item_name:string;gross_cents:number;rate_snapshot:number;commission_amount:number;created_at:string;order_id:string|null;professional_name:string};
export function AdminCommissionsPage({base,tenant}:{base:string;tenant:Tenant}){
  const today=dateKey(tenant.timezone);
  const [from,setFrom]=useState(()=>addDays(today,-6));const [to,setTo]=useState(today);const [person,setPerson]=useState('');const [page,setPage]=useState(1);
  const people=useResource<Professional[]>(`${base}/professionals`);
  const valid=from<=to&&to<=addDays(from,31);
  const data=useResource<{items:Record[];has_more:boolean}>(valid?`${base}/commissions?${new URLSearchParams({from,to,page:String(page),...(person?{professional_id:person}:{})})}`:null);
  return <section className="painel formulario"><h2>Histórico de comissões</h2><div className="form-quatro">
    <label>Período de<input type="date" value={from} onChange={event=>{if(event.target.value){setFrom(event.target.value);setPage(1);}}}/></label><label>Até<input type="date" value={to} onChange={event=>{if(event.target.value){setTo(event.target.value);setPage(1);}}}/></label>
    <label>Funcionário<select value={person} onChange={event=>{setPerson(event.target.value);setPage(1);}}><option value="">Todos</option>{people.data?.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
    <Notice error={!valid?'Escolha um intervalo de até 32 dias.':data.error??people.error} loading={data.loading} empty={!data.data?.items.length?'Nenhuma comissão no período.':undefined}/>
    <div className="tabela"><table><thead><tr><th>Funcionário</th><th>Origem</th><th>Registro</th><th>Bruto</th><th>Taxa</th><th>Comissão</th></tr></thead><tbody>{data.data?.items.map(item=><tr key={item.id}><th scope="row">{item.professional_name}</th><td>{item.item_name} · {item.order_id?'Produto':'Serviço'}</td><td>{dateTime(item.created_at,tenant.timezone)}</td><td>{currency(item.gross_cents)}</td><td>{item.rate_snapshot/100}%</td><td>{currency(item.commission_amount)}</td></tr>)}</tbody></table></div><Pagination page={page} more={data.data?.has_more} set={setPage}/>
  </section>;
}
