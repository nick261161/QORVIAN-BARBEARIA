'use client';
import { useState, type FormEvent } from 'react';
import { api, currency, dateTime, rewardLabel, useResource, type Appointment, type Ledger, type Loyalty, type Order, type OrderPage, type Product, type Professional, type Tenant } from '../../services/api.js';
import { AppointmentLine, FormPanel, Notice, Result, useAction } from '../../components/ui/index.js';
import { LoyaltyCard, OrderLine, Pagination } from '../public/StorePages.js';

export function ManageOrders({base,tenant,commission}:{base:string;tenant:Tenant;commission:boolean}){
  const [page,setPage]=useState(1);const [target,setTarget]=useState<string>();const [staff,setStaff]=useState('');
  const orders=useResource<OrderPage>(`${base}/orders?page=${page}`);const people=useResource<Professional[]>(commission?`${base}/professionals`:null);
  const action=useAction(orders.refresh);
  function update(item:Order,status:Order['status']){
    void action.perform(()=>api(`${base}/orders/${item.id}`,{method:'PATCH',body:{status,professional_id:status==='CONCLUIDO'?staff||null:null}}),status==='CONCLUIDO'?'Pedido concluído.':'Pedido cancelado e estoque devolvido.').then(ok=>{if(ok){setTarget(undefined);setStaff('');}});
  }
  return <section className="painel"><h2>Pedidos de produtos</h2><Notice error={orders.error||people.error} loading={orders.loading} empty={!orders.data?.items.length?'Nenhum pedido registrado.':undefined}/><Result error={action.error} success={action.success}/>
    <ul className="linhas">{orders.data?.items.map(item=><OrderLine key={item.id} item={item} timezone={tenant.timezone}>
      {item.status==='PENDENTE'&&(target===item.id?<>
        {commission&&<select aria-label="Funcionário da venda" value={staff} onChange={event=>setStaff(event.target.value)}><option value="">Venda da casa</option>{people.data?.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</select>}
        <button className="botao primario" onClick={()=>update(item,'CONCLUIDO')} disabled={action.pending}>Concluir pedido</button><button className="botao perigo" onClick={()=>update(item,'CANCELADO')} disabled={action.pending}>Cancelar e devolver estoque</button><button className="botao secundario" onClick={()=>setTarget(undefined)}>Voltar</button>
      </>:<button className="botao secundario" onClick={()=>{setTarget(item.id);setStaff(item.professional_id??'');}}>Gerenciar pedido</button>)}
    </OrderLine>)}</ul><Pagination page={page} more={orders.data?.has_more} set={setPage}/>
  </section>;
}

export function ManageLoyalty({base,productsEnabled}:{base:string;productsEnabled:boolean}){
  const config=useResource<Loyalty>(`${base}/loyalty`);
  const services=useResource<Product[]>(`${base}/services`);
  const products=useResource<Product[]>(productsEnabled?`${base}/products`:null);
  if(!config.data)return <Notice loading={config.loading} error={config.error}/>;
  return <><Notice error={services.error??products.error}/><LoyaltyEditor base={base} config={config.data} serviceItems={services.data??[]} products={products.data??[]} refresh={config.refresh}/></>;
}

function LoyaltyEditor({base,config,serviceItems,products,refresh}:{base:string;config:Loyalty;serviceItems:Product[];products:Product[];refresh:()=>void}){
  const [reward,setReward]=useState(config.reward_type);const [mode,setMode]=useState(config.accumulation_type);
  const action=useAction(refresh);
  const isItem=reward==='FREE_SERVICE'||reward==='FREE_PRODUCT';
  const items=reward==='FREE_SERVICE'?serviceItems:products;
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget);
    const body={is_active:form.has('active'),program_name:form.get('name'),accumulation_type:mode,include_products:form.has('products'),points_per_real:mode==='POINTS_PER_CURRENCY'?Number(form.get('points')):1,
      min_spend_amount:Math.round(Number(form.get('minimum'))*100),target_value:Number(form.get('target')),reward_type:reward,
      reward_value:isItem?0:reward==='DISCOUNT_FIXED'?Math.round(Number(form.get('reward_value'))*100):Number(form.get('reward_value')),
      reward_reference_id:isItem?form.get('reference'):null,points_expiration_days:Number(form.get('expiration')),rules_description:form.get('rules')};
    void action.perform(()=>api(`${base}/loyalty`,{method:'PUT',body}));
  }
  return <FormPanel title="Configurar clube" submit={submit} pending={action.pending}>
    <label className="checkbox"><input type="checkbox" name="active" defaultChecked={config.is_active}/> Clube ativo</label>
    <div className="form-colunas"><label>Nome do programa<input name="name" required defaultValue={config.program_name}/></label><label>Modo<select value={mode} onChange={event=>setMode(event.target.value as Loyalty['accumulation_type'])}><option value="STAMPS_PER_SERVICE">Selos por atendimento</option><option value="POINTS_PER_CURRENCY">Pontos por real</option></select></label></div>
    <div className="form-quatro"><label>Meta<input name="target" type="number" min="1" max="1000000" required defaultValue={config.target_value}/></label>
      {mode==='POINTS_PER_CURRENCY'&&<label>Pontos por real<input name="points" type="number" min="1" max="1000" required defaultValue={config.points_per_real}/></label>}
      <label>Valor mínimo (R$)<input name="minimum" type="number" min="0" step="0.01" required defaultValue={config.min_spend_amount/100}/></label><label>Validade (dias)<input name="expiration" type="number" min="0" max="3650" required defaultValue={config.points_expiration_days}/></label></div>
    <label className="checkbox"><input type="checkbox" name="products" defaultChecked={config.include_products}/> Incluir pedidos concluídos de produtos</label>
    <div className="form-colunas"><label>Tipo de prêmio<select value={reward} onChange={event=>setReward(event.target.value as Loyalty['reward_type'])}><option value="FREE_SERVICE">Serviço grátis</option><option value="FREE_PRODUCT">Produto grátis</option><option value="DISCOUNT_PERCENT">Desconto percentual</option><option value="DISCOUNT_FIXED">Desconto em reais</option></select></label>
      {isItem?<label key={reward}>Item do prêmio<select name="reference" defaultValue={config.reward_reference_id??''} required><option value="">Selecione</option>{items.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:
      <label key={reward}>{reward==='DISCOUNT_FIXED'?'Desconto (R$)':'Desconto (%)'}<input name="reward_value" required type="number" min={reward==='DISCOUNT_FIXED'?.01:1} max={reward==='DISCOUNT_PERCENT'?100:100000} step={reward==='DISCOUNT_FIXED'?.01:1} defaultValue={config.reward_type===reward?config.reward_value/(reward==='DISCOUNT_FIXED'?100:1):undefined}/></label>}</div>
    <label>Regras públicas<textarea rows={4} name="rules" maxLength={2000} defaultValue={config.rules_description}/></label><p className="suave">Validade zero mantém os créditos sem vencimento.</p><Result error={action.error} success={action.success}/>
  </FormPanel>;
}

type Client={id:string;name:string;phone:string;visits:number;spent:number;last_visit:string|null;balance:number;eligible:boolean;vip:boolean};
type History={visits:Appointment[];orders:Order[];has_more:boolean};
export function ManageClients({base,tenant,loyalty}:{base:string;tenant:Tenant;loyalty:boolean}){
  const [search,setSearch]=useState('');const [filter,setFilter]=useState('all');const [sort,setSort]=useState('name');const [page,setPage]=useState(1);const [chosen,setChosen]=useState<Client>();
  const list=useResource<{items:Client[];has_more:boolean}>(`${base}/clients?${new URLSearchParams({search,filter,sort,page:String(page)})}`);
  return <><section className="painel formulario"><h2>Clientes</h2><div className="form-quatro"><label>Buscar por nome ou telefone<input value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/></label><label>Filtrar<select value={filter} onChange={event=>{setFilter(event.target.value);setPage(1);}}><option value="all">Todos</option><option value="vip">VIPs</option><option value="inactive">Inativos há mais de 30 dias</option>{loyalty&&<option value="reward">Com prêmio disponível</option>}</select></label>
    <label>Ordenar por<select value={sort} onChange={event=>{setSort(event.target.value);setPage(1);}}><option value="name">Nome</option><option value="spend">Total gasto</option><option value="visits">Atendimentos</option><option value="last">Última visita</option>{loyalty&&<option value="balance">Saldo</option>}</select></label></div>
    <Notice error={list.error} loading={list.loading} empty={!list.data?.items.length?'Nenhum cliente encontrado.':undefined}/><div className="tabela"><table><thead><tr><th>Nome</th><th>WhatsApp</th><th>Atendimentos</th><th>Total gasto</th><th>Última visita</th>{loyalty&&<th>Fidelidade</th>}<th>Ações</th></tr></thead><tbody>
      {list.data?.items.map(item=><tr key={item.id}><th scope="row">{item.name}{item.vip&&<span className="estado">VIP</span>}</th><td><a href={`https://wa.me/${item.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">{item.phone}</a></td><td>{item.visits}</td><td>{currency(item.spent)}</td><td>{item.last_visit?dateTime(item.last_visit,tenant.timezone):'—'}</td>{loyalty&&<td>{item.balance}{item.eligible?' · prêmio disponível':''}</td>}<td><button className="botao secundario" onClick={()=>setChosen(item)}>Ver histórico</button></td></tr>)}
    </tbody></table></div><Pagination page={page} more={list.data?.has_more} set={setPage}/></section>
    {chosen&&<ClientDetails key={chosen.id} client={chosen} base={base} tenant={tenant} loyalty={loyalty} refresh={list.refresh}/>}
  </>;
}

function ClientDetails({client,base,tenant,loyalty,refresh}:{client:Client;base:string;tenant:Tenant;loyalty:boolean;refresh:()=>void}){
  const [page,setPage]=useState(1);const [version,setVersion]=useState(0);
  const endpoint=`${base}/clients/${client.id}`;
  const history=useResource<History>(`${endpoint}/history?page=${page}`);
  const wallet=useResource<Ledger>(loyalty?`${endpoint}/loyalty`:null);
  const action=useAction(()=>{wallet.refresh();setVersion(value=>value+1);refresh();});
  return <><section className="painel formulario"><h2>{client.name}</h2><Notice error={history.error} loading={history.loading}/><h3>Histórico de atendimentos</h3>
    <ul className="linhas">{history.data?.visits.map(item=><AppointmentLine key={item.id} item={item} timezone={tenant.timezone}/>)}</ul><h3>Histórico de pedidos</h3>
    <ul className="linhas">{history.data?.orders.map(item=><li className="linha-dados" key={item.id}><span>{dateTime(item.created_at,tenant.timezone)} · {item.status}</span><strong>{currency(item.total_cents)}</strong></li>)}</ul><Pagination page={page} more={history.data?.has_more} set={setPage}/></section>
    {loyalty&&<><section className="painel formulario"><h2>Ajustar fidelidade</h2><p>Saldo disponível: <strong>{wallet.data?.balance??0}</strong></p>
      <form className="formulario" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);void action.perform(()=>api(`${endpoint}/loyalty/adjust`,{method:'POST',body:{delta:Number(data.get('delta')),reason:data.get('reason')}}),'Movimentação registrada.').then(ok=>{if(ok)form.reset();});}}>
        <div className="form-colunas"><label>Quantidade positiva ou negativa<input name="delta" required type="number" min="-1000000" max="1000000"/></label><label>Motivo<input name="reason" minLength={3} maxLength={240} required/></label></div><div className="acoes"><button className="botao secundario" disabled={action.pending}>Registrar ajuste</button></div></form>
      <div className="acoes"><button className="botao primario" disabled={action.pending||!wallet.data?.eligible} onClick={()=>void action.perform(async()=>{const data=await api<{reward:NonNullable<Loyalty['reward']>}>(`${endpoint}/loyalty/redeem`,{method:'POST'});return rewardLabel(data.reward);},'Prêmio resgatado. Confira o registro no extrato.')}>Validar e resgatar prêmio</button></div>
      <Notice error={wallet.error}/><Result error={action.error} success={action.success}/></section><LoyaltyCard key={version} endpoint={`${endpoint}/loyalty`} timezone={tenant.timezone}/></>}
  </>;
}
