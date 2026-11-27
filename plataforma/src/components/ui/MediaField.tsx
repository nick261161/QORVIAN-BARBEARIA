'use client';
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { api,message } from '../../services/api.js';
import { clientImageCompress } from '@/utils/clientImageCompress';

export function MediaField({endpoint,label,value,onChange,name,profile='catalog',uploadOnly=false}:{endpoint?:string;label:string;value:string;onChange:(value:string)=>void;name?:string;profile?:'catalog'|'avatar'|'banner';uploadOnly?:boolean}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function upload(file:File){
    setBusy(true);setError('');
    try{
      const body=new FormData();
      body.append('image',await clientImageCompress(file,profile));
      body.append('profile',profile);
      const {url}=await api<{url:string}>(endpoint!,{method:'POST',body});
      onChange(url);
    }
    catch(failure){setError(message(failure));}finally{setBusy(false);}
  }
  return <div className="formulario midia-campo">{!uploadOnly&&<label>{label}<input name={name} value={value} placeholder="https://… ou /imagem.webp" onChange={event=>onChange(event.target.value)}/></label>}
    {endpoint&&<label className="midia-botao"><Upload size={15}/>{busy?'Enviando…':'Enviar imagem'}<input type="file" aria-label={`Enviar ${label.toLowerCase()}`} accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void upload(file);}}/></label>}
    {error&&<p className="erro" role="alert">{error}</p>}
  </div>;
}
