'use client';
import { useState } from 'react';
import { Gift,ShoppingBag } from 'lucide-react';
import { currency,dateTime,rewardLabel,useResource,type Ledger,type Order,type OrderPage } from '../../services/api.js';
import { FullBleedHero } from '../../components/layout/FullBleedHero.js';
import { useStore } from '../../contexts/ThemeConfigContext.js';
import { CatalogCollection } from './HomePage.js';
import { Notice } from '../../components/ui/index.js';

export function PublicCatalog({products=false}:{products?:boolean}){
  const {tenant,flags}=useStore();
  if(products&&!flags.enable_products_store)return <main className="largura pagina"><Notice empty="A loja de produtos está desativada."/></main>;
  const photo=tenant.site.backgrounds[products?'products':'services']||tenant.site.backgrounds.home||tenant.site.banner;
  return <><main><FullBleedHero compact photos={photo?[photo]:[]}><h1>{products?'Produtos':'Serviços'}</h1>
    <p>{products?'Escolha os produtos da sua rotina de cuidados.':'Veja as opções, duração e valores antes de agendar.'}</p></FullBleedHero>
    <section className="vitrine-secao"><div className="largura"><CatalogCollection products={products}/></div></section>
  </main></>;
}

export function OrderHistory({base,timezone}:{base:string;timezone:string}){
  const [page,setPage]=useState(1);const orders=useResource<OrderPage>(`${base}/orders?page=${page}`);
  return <section className="painel"><h2>Meus pedidos</h2><Notice loading={orders.loading} error={orders.error} empty={!orders.data?.items.length?'Nenhum pedido registrado.':undefined}/>
    <ul className="linhas">{orders.data?.items.map(item=><OrderLine item={item} key={item.id} timezone={timezone}/>)}</ul><Pagination page={page} more={orders.data?.has_more} set={setPage}/></section>;
}

export function OrderLine({item,timezone,children}:{item:Order;timezone:string;children?:React.ReactNode}){
  return <li className="linha-dados"><span className="icone-suave"><ShoppingBag size={18}/></span><div className="corpo-linha"><strong>{item.items.map(line=>`${line.quantity}× ${line.name_snapshot}`).join(', ')}</strong>
    <p>{dateTime(item.created_at,timezone)} · {item.modality==='ENTREGA'?'Entrega':'Retirada no local'}</p>
    {item.client_name&&item.client_phone&&<p>{item.client_name} · <a href={`https://wa.me/${item.client_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">WhatsApp</a></p>}{item.delivery_address&&<p>{item.delivery_address}</p>}</div>
    <div className="acoes"><strong>{currency(item.total_cents)}</strong><span className="estado" data-status={item.status}>{item.status==='PENDENTE'?'Pendente':item.status==='CONCLUIDO'?'Concluído':'Cancelado'}</span>{children}</div></li>;
}

export function Pagination({page,more,set}:{page:number;more?:boolean;set:(page:number)=>void}){
  if(page===1&&!more)return null;
  return <div className="acoes"><button className="botao secundario" disabled={page===1} onClick={()=>set(page-1)}>Anterior</button><button className="botao secundario" disabled={!more} onClick={()=>set(page+1)}>Próxima</button></div>;
}

export function LoyaltyCard({endpoint,timezone}:{endpoint:string;timezone:string}){
  const [page,setPage]=useState(1);const wallet=useResource<Ledger>(`${endpoint}?page=${page}`);const data=wallet.data;
  return <section className="painel formulario"><h2>Cartão fidelidade</h2><Notice error={wallet.error} loading={wallet.loading}/>
    {data&&<><div className="cartao-fidelidade"><Gift size={22}/><h3>{data.config.program_name}</h3><strong>{data.balance} {data.config.accumulation_type==='STAMPS_PER_SERVICE'?'selos':'pontos'}</strong><progress aria-label="Progresso para o prêmio" value={Math.min(data.balance,data.config.target_value)} max={data.config.target_value}/><p>{data.eligible?'Prêmio disponível. Solicite na loja.':`Meta de resgate: ${data.config.target_value}`}</p></div>
      <h3>Extrato</h3><Notice empty={!data.items.length?'Nenhuma movimentação.':undefined}/><ul className="linhas">{data.items.map(item=><li className="linha-dados" key={item.id}><div className="corpo-linha"><strong>{item.reason}</strong><p>{dateTime(item.created_at,timezone)}{item.expires_at?` · vence em ${dateTime(item.expires_at,timezone)}`:''}{item.reward_snapshot?` · ${rewardLabel(item.reward_snapshot)}`:''}</p></div><strong>{item.delta>0?'+':''}{item.delta}</strong></li>)}</ul><Pagination page={page} more={data.has_more} set={setPage}/></>}
  </section>;
}
