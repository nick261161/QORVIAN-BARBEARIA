import { useEffect } from 'react';
export function useDocumentTitle(title:string,favicon?:string){
  useEffect(()=>{document.title=title;},[title]);
  useEffect(()=>{
    if(!favicon)return;
    const icon=document.createElement('link');
    icon.rel='icon';icon.href=favicon;document.head.append(icon);
    return()=>icon.remove();
  },[favicon]);
}
