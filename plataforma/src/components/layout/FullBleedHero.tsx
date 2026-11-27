'use client';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useEffect,useRef,useState, type ReactNode } from 'react';
import { ChevronLeft,ChevronRight } from 'lucide-react';

export function FullBleedHero({ photos, children, compact=false,automatic=false }:{photos:string[];children:ReactNode;compact?:boolean;automatic?:boolean}) {
  const [index,setIndex]=useState(0);
  const [hovered,setHovered]=useState(false);
  const [focused,setFocused]=useState(false);
  const [touched,setTouched]=useState(false);
  const [paused,setPaused]=useState(false);
  const [reduce,setReduce]=useState(false);
  const [hidden,setHidden]=useState(false);
  const touchTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const totalSlides=photos.length;
  const intervalMs=2000;
  const active=totalSlides?index%totalSlides:0;
  const isPaused=!automatic||hovered||focused||touched||paused||reduce||hidden;
  const playing=totalSlides>1&&!isPaused;
  useEffect(()=>{
    if(!automatic)return;
    const query=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{setReduce(query.matches);setHidden(document.hidden);};
    update();query.addEventListener('change',update);document.addEventListener('visibilitychange',update);
    return ()=>{query.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
  },[automatic]);
  useEffect(()=>{
    if(totalSlides<2||isPaused)return;
    const timer=window.setInterval(()=>setIndex(value=>(value+1)%totalSlides),intervalMs);
    return ()=>window.clearInterval(timer);
  },[totalSlides,isPaused,intervalMs]);
  useEffect(()=>()=>{if(touchTimer.current!==null)clearTimeout(touchTimer.current);},[]);
  useEffect(()=>{
    if(!automatic||photos.length<2)return;
    const next=new window.Image();
    next.src=photos[(active+1)%photos.length];
  },[active,automatic,photos]);
  function pauseTouch(){
    if(touchTimer.current!==null)clearTimeout(touchTimer.current);
    setTouched(true);
  }
  function resumeTouch(){
    if(touchTimer.current!==null)clearTimeout(touchTimer.current);
    touchTimer.current=setTimeout(()=>{touchTimer.current=null;setTouched(false);},3000);
  }
  const step=(delta:number)=>{if(totalSlides>1)setIndex(current=>(current+delta+totalSlides)%totalSlides);};
  return <section className={`full-bleed${compact?' compacto':''}`} aria-label="Apresentação"
    onPointerEnter={event=>{if(event.pointerType==='mouse')setHovered(true);}}
    onTouchStart={pauseTouch} onTouchEnd={event=>{if(!event.touches.length)resumeTouch();}} onTouchCancel={resumeTouch}
    onFocusCapture={event=>setFocused(event.target.matches(':focus-visible'))} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}} onPointerMove={event=>{
    if(event.pointerType!=='mouse')return;
    const element=event.currentTarget;
    const bounds=element.getBoundingClientRect();
    element.style.setProperty('--pointer-x',`${event.clientX-bounds.left}px`);
    element.style.setProperty('--pointer-y',`${event.clientY-bounds.top}px`);
    element.style.setProperty('--pointer-opacity','1');
  }} onPointerLeave={event=>{setHovered(false);event.currentTarget.style.setProperty('--pointer-opacity','0');}} onKeyDown={event=>{
    if(photos.length<2||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();step(event.key==='ArrowLeft'?-1:1);
  }}>
    <div className="hero-slides" aria-hidden="true">{photos.map((photo,i)=><OptimizedImage key={photo}
      className={`full-bleed-img hero-slide ${i===active?'ativo opacity-100 z-10':'opacity-0 z-0 pointer-events-none'}`} src={photo} alt="" fetchPriority={i===active?'high':'low'}/>)}</div>
    <div className="hero-luz" aria-hidden="true"/>
    <div className="largura full-bleed-layout"><div className="hero-texto vidro">{children}</div></div>
    {photos.length>1&&<div className="galeria-controles" aria-label="Galeria de apresentação">
      <button type="button" className="botao contorno-claro quadrado" aria-label="Foto anterior" onClick={()=>step(-1)}><ChevronLeft size={19}/></button>
      <div className="hero-indicadores">{photos.map((photo,i)=><button key={photo} type="button" aria-label={`Foto ${i+1} de ${photos.length}`} aria-pressed={i===active} onClick={()=>setIndex(i)}>
        <span key={`${active}-${playing}`} className={i===active&&playing?'avancando':''}/>
      </button>)}</div>
      <button type="button" className="botao contorno-claro quadrado" aria-label="Próxima foto" onClick={()=>step(1)}><ChevronRight size={19}/></button>
      {automatic&&!reduce&&<button type="button" className="botao contorno-claro" onClick={()=>setPaused(value=>!value)}>{paused?'Reproduzir':'Pausar'}</button>}
    </div>}
  </section>;
}
