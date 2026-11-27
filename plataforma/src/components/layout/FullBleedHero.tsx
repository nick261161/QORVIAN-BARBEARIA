'use client';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useState, type ReactNode } from 'react';
import { ChevronLeft,ChevronRight } from 'lucide-react';

export function FullBleedHero({ photos, children, compact=false }:{photos:string[];children:ReactNode;compact?:boolean}) {
  const [index,setIndex]=useState(0);
  const step=(delta:number)=>setIndex(current=>(current+delta+photos.length)%photos.length);
  return <section className={`full-bleed${compact?' compacto':''}`} aria-label="Apresentação" onPointerMove={event=>{
    if(event.pointerType!=='mouse')return;
    const element=event.currentTarget;
    const bounds=element.getBoundingClientRect();
    element.style.setProperty('--pointer-x',`${event.clientX-bounds.left}px`);
    element.style.setProperty('--pointer-y',`${event.clientY-bounds.top}px`);
    element.style.setProperty('--pointer-opacity','1');
  }} onPointerLeave={event=>event.currentTarget.style.setProperty('--pointer-opacity','0')} onKeyDown={event=>{
    if(photos.length<2||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();step(event.key==='ArrowLeft'?-1:1);
  }}>
    {photos.length>0&&<OptimizedImage className="full-bleed-img" src={photos[index%photos.length]} alt="" fetchPriority="high" />}
    <div className="hero-luz" aria-hidden="true"/>
    <div className="largura full-bleed-layout"><div className="hero-texto vidro">{children}</div></div>
    {photos.length>1&&<div className="galeria-controles" aria-label="Galeria de apresentação"><button className="botao contorno-claro quadrado" aria-label="Foto anterior" onClick={()=>step(-1)}><ChevronLeft size={19}/></button><span aria-live="polite">{index%photos.length+1} / {photos.length}</span><button className="botao contorno-claro quadrado" aria-label="Próxima foto" onClick={()=>step(1)}><ChevronRight size={19}/></button></div>}
  </section>;
}
