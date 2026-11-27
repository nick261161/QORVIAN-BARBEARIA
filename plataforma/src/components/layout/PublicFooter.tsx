'use client';
import { Camera,MessageCircle } from 'lucide-react';
import { LocationStreetView } from './LocationStreetView';
import { useStore } from '../../contexts/ThemeConfigContext.js';

export function PublicFooter(){
  const {tenant}=useStore();const {site}=tenant;
  const whats=site.whatsapp?`https://wa.me/${site.whatsapp.replace(/\D/g,'')}`:'';
  return <footer className="rodape-publico"><div className="largura linha-topo"><div><strong>{tenant.name}</strong>{site.address&&<p>{site.address}</p>}
    {site.sections.hours&&<a href={`/loja/${tenant.slug}#horarios`}>Horários de funcionamento</a>}</div><div className="acoes">
    {whats&&<a className="botao contorno-claro" href={whats} target="_blank" rel="noreferrer"><MessageCircle size={17}/> WhatsApp</a>}
    {site.instagram&&<a className="botao contorno-claro" href={site.instagram} target="_blank" rel="noreferrer"><Camera size={17}/> Instagram</a>}
  </div></div>{(site.address_full||site.address||site.latitude!==null)&&<details className="largura rodape-local"><summary>Localização e como chegar</summary>
    <LocationStreetView site={site} compact/>
  </details>}</footer>;
}
