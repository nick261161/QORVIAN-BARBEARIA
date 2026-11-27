'use client';
import {useState} from 'react';
import {MapPin,Navigation} from 'lucide-react';
import type {Site} from '../../../shared/features.js';

export function LocationStreetView({site,compact=false}:{site:Site;compact?:boolean}){
  const [mode,setMode]=useState<'map'|'street'>('map');
  const [show,setShow]=useState(false);
  const address=site.address_full||site.address;
  const coordinates=site.latitude!==null&&site.longitude!==null?`${site.latitude},${site.longitude}`:'';
  const destination=coordinates||address;
  if(!destination)return null;
  const mapKey=process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  const params=new URLSearchParams({key:mapKey??''});
  if(mode==='street'){params.set('location',coordinates);params.set('heading',String(site.street_view_heading));}
  else params.set('q',destination);
  const embed=`https://www.google.com/maps/embed/v1/${mode==='street'?'streetview':'place'}?${params}`;
  const maps=coordinates
    ?`https://www.google.com/maps/dir/?${new URLSearchParams({api:'1',destination})}`
    :`https://www.google.com/maps/search/?${new URLSearchParams({api:'1',query:destination})}`;
  const street=`https://www.google.com/maps/@?${new URLSearchParams({api:'1',map_action:'pano',viewpoint:coordinates,heading:String(site.street_view_heading)})}`;
  return <section className={compact?'localizacao compacta':'localizacao'} aria-label="Localização do estabelecimento">
    {compact?<h3>Localização</h3>:<h2>Como chegar</h2>}
    {address&&<p><MapPin size={16} aria-hidden="true"/> {address}</p>}
    {coordinates&&mapKey&&<div className="acoes">
      <button type="button" className="botao secundario" aria-pressed={show&&mode==='street'} onClick={()=>{setMode('street');setShow(true);}}>Fachada (Street View)</button>
      <button type="button" className="botao secundario" aria-pressed={show&&mode==='map'} onClick={()=>{setMode('map');setShow(true);}}>Mapa interativo</button>
    </div>}
    {show&&mapKey&&<iframe title={mode==='street'?'Fachada do estabelecimento no Street View':'Localização no Google Maps'}
      src={embed} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}
    <div className="acoes">
      <a className="botao destaque" href={maps} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden="true"/>{coordinates?'Como chegar (abrir GPS)':'Buscar no Google Maps'}</a>
      {coordinates&&!mapKey&&<a className="botao secundario" href={street} target="_blank" rel="noopener noreferrer">Ver fachada no Street View</a>}
    </div>
  </section>;
}
