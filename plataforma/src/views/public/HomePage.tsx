'use client';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useState,type ReactNode } from 'react';
import { CalendarDays,Clock3,MapPin,Package,Scissors,UserRound } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { currency,weekdays,type Product } from '../../services/api.js';
import { Notice } from '../../components/ui/index.js';
import { useCart } from '../../contexts/CartContext.js';
import { useStore } from '../../contexts/ThemeConfigContext.js';
import { FullBleedHero } from '../../components/layout/FullBleedHero.js';

export { useStore };

export function CatalogCard({item,duration,action}:{item:Product;duration?:number;action?:ReactNode}) {
  return <article className="vitrine-cartao"><div className="vitrine-foto">{item.photo?<OptimizedImage src={item.photo} alt="" loading="lazy"/>:duration?<Scissors size={34}/>:<Package size={34}/>}
    {duration&&<span className="duracao"><Clock3 size={14}/> {duration} min</span>}</div><div className="vitrine-corpo"><h3>{item.name}</h3>
    {item.description&&<p>{item.description}</p>}<div className="vitrine-valor"><strong>{currency(item.price_cents)}</strong>{action}</div></div></article>;
}
export function ProductAction({item}:{item:Product}){
  const {tenant,flags}=useStore();const cart=useCart();
  const units=cart?.lines.find(line=>line.product.id===item.id)?.quantity??0;
  if(flags.enable_shopping_cart&&cart)return <button type="button" className="botao secundario" disabled={units>=(item.stock_quantity??0)||units>=100}
    aria-label={item.stock_quantity?`Adicionar ${item.name} ao carrinho`:undefined} onClick={()=>cart.set(item.id,units+1)}>{!item.stock_quantity?'Esgotado':units?`Adicionar · ${units}`:'Adicionar'}</button>;
  if(!tenant.site.whatsapp)return null;
  const phone=tenant.site.whatsapp.replace(/\D/g,'');
  return <a className="botao secundario" href={`https://wa.me/${phone}?text=${encodeURIComponent(`Olá! Gostaria de consultar ${item.name}.`)}`} target="_blank" rel="noreferrer">Consultar</a>;
}
export function CatalogCollection({products=false}:{products?:boolean}){
  const store=useStore();const [category,setCategory]=useState('');
  const rows=products?store.products:store.services;
  const categories=[...new Set(rows.map(item=>item.category).filter(Boolean))];
  const visible=rows.filter(item=>!category||item.category===category);
  return <>{categories.length>0&&<div className="acoes filtros" aria-label="Categorias">{['',...categories].map(value=><button className="botao secundario" key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{value||'Todas'}</button>)}</div>}
    {visible.length?<div className="vitrine-grade">{visible.map(item=><CatalogCard item={item} key={item.id} duration={'duration_minutes' in item&&typeof item.duration_minutes==='number'?item.duration_minutes:undefined}
      action={products?<ProductAction item={item}/>:store.flags.enable_online_booking?<Link className="botao secundario" to={`/loja/${store.tenant.slug}/agendar?serviceId=${item.id}`} aria-label={`Agendar ${item.name}`}>Agendar</Link>:null}/>)}</div>:<Notice empty="Nenhum item disponível."/>}</>;
}
export function Storefront(){
  const {tenant,flags,services,professionals,hours}=useStore();const {site}=tenant;
  const root=`/loja/${tenant.slug}`;
  const photos=[...new Set([site.backgrounds.home||site.banner,...services.map(item=>item.photo)].filter(Boolean))].slice(0,6);
  return <><main><FullBleedHero photos={photos}>
    {site.address&&<p className="sobretitulo"><MapPin size={17}/> {site.address}</p>}<h1>{site.headline||tenant.name}</h1>
    {site.sections.about&&site.bio&&<p>{site.bio}</p>}<div className="acoes">
      {flags.enable_online_booking&&<Link className="botao destaque" to={`${root}/agendar`}><CalendarDays size={20}/> Agendar horário</Link>}
      {site.sections.services&&<Link className="botao contorno-claro" to={`${root}/servicos`}>Ver serviços</Link>}
    </div></FullBleedHero>
    {site.sections.services&&<section className="vitrine-secao" id="servicos"><div className="largura"><h2>Escolha seu serviço.</h2><CatalogCollection/></div></section>}
    {site.sections.products&&flags.enable_products_store&&<section className="vitrine-secao contraste" id="produtos"><div className="largura"><h2>Cuidados em casa.</h2><CatalogCollection products/></div></section>}
    {(site.sections.team||site.sections.hours)&&<section className="vitrine-secao" id="horarios"><div className="largura info-loja">
      {site.sections.team&&<div><h2>Nossa equipe</h2><ul className="equipe">{professionals.map(person=><li key={person.id}>{person.photo?<OptimizedImage src={person.photo} alt=""/>:<span className="icone-suave"><UserRound size={20}/></span>}<strong>{person.name}</strong></li>)}</ul></div>}
      {site.sections.hours&&<div><h2>Horários</h2><ul className="horarios-loja">{hours.map(day=><li key={day.weekday}><strong>{weekdays[day.weekday]}</strong><span>{day.closed?'Fechado':`${day.opens_at}–${day.closes_at}${day.break_start?` · intervalo ${day.break_start}–${day.break_end}`:''}`}</span></li>)}</ul></div>}
    </div></section>}
  </main></>;
}
