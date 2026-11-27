'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {api,useResource} from '@/services/api';
import {FormPanel,Notice,Result,useAction} from '@/components/ui';
import {MediaField} from '@/components/ui/MediaField';
import {OptimizedImage} from '@/components/ui/OptimizedImage';
import {Link} from '@/lib/navigation';

type Profile={name:string;photo:string};
export function StaffProfile({base,template}:{base:string;template:string}){
  const data=useResource<Profile>(base+'/profile');
  const clipboard=useAction();
  if(!data.data)return <Notice loading={data.loading} error={data.error}/>;
  return <>
    <ProfileForm endpoint={base+'/profile'} profile={data.data}/>
    <GoogleCalendarConnection/>
    <section className="painel formulario">
      <h2>Mensagem pré-pronta atual</h2>
      <div className="mensagem-preview"><p>{template}</p></div>
      <div className="acoes">
        <button type="button" className="botao secundario" onClick={()=>void clipboard.perform(()=>navigator.clipboard.writeText(template),'Modelo copiado.')}>Copiar modelo</button>
        <Link className="botao primario" to="/admin/agenda">Abrir agenda de hoje</Link>
      </div>
      <Result error={clipboard.error} success={clipboard.success}/>
    </section>
  </>;
}

function GoogleCalendarConnection(){
  const connection=useResource<{enabled:boolean;configured:boolean;email:string|null}>('/google-calendar/status');
  const action=useAction(connection.refresh);
  const [feedback,setFeedback]=useState('');
  const [disconnecting,setDisconnecting]=useState(false);
  useEffect(()=>{
    const result=new URLSearchParams(window.location.search).get('google');
    if(result==='conectado')setFeedback('Google Agenda conectado.');
    if(result==='cancelado')setFeedback('Conexão cancelada.');
    if(result==='erro')setFeedback('A conexão falhou. Tente novamente.');
  },[]);
  const info=connection.data;
  return <section className="painel formulario"><h2>Google Agenda</h2>
    <p className="suave">Envia horário, serviços, nome, telefone e valor da reserva ao seu calendário principal. Os eventos incluem lembretes de 60 e 15 minutos.</p>
    {feedback&&<p role="status">{feedback}</p>}
    <Notice loading={connection.loading&&!info} error={connection.error}/>
    {info?.email&&<p>Conta conectada <strong>{info.email}</strong></p>}
    {info&&!info.enabled&&<p className="suave">A integração está desativada para este estabelecimento.</p>}
    {info?.enabled&&!info.configured&&<p className="suave">A integração está aguardando configuração.</p>}
    <div className="acoes">
      {info?.enabled&&info.configured&&<button className="botao primario" disabled={action.pending} type="button" onClick={()=>void action.perform(async()=>{
        const {url}=await api<{url:string}>('/google-calendar/connect',{method:'POST'});
        if(new URL(url).origin!=='https://accounts.google.com')throw new Error('Endereço de autorização inválido.');
        window.location.assign(url);
      })}>{info.email?'Reconectar Google Agenda':'Conectar Google Agenda'}</button>}
      {info?.email&&<button className="botao secundario" disabled={action.pending} type="button" onClick={()=>{
        if(!disconnecting){setDisconnecting(true);return;}
        void action.perform(async()=>{
          await api('/google-calendar/disconnect',{method:'POST'});setDisconnecting(false);setFeedback('');
        },'Google Agenda desconectado. Os eventos existentes permanecem no calendário.');
      }}>{disconnecting?'Confirmar desconexão':'Desconectar'}</button>}
      {disconnecting&&<button type="button" className="botao secundario" onClick={()=>setDisconnecting(false)}>Manter conexão</button>}
    </div>
    <Result error={action.error} success={action.success}/>
  </section>;
}

function ProfileForm({endpoint,profile}:{endpoint:string;profile:Profile}){
  const [saved,setSaved]=useState(profile);
  const [photo,setPhoto]=useState(profile.photo);
  const action=useAction();
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=event.currentTarget;
    const fields=new FormData(form);
    const current_password=String(fields.get('current_password')??'');
    const new_password=String(fields.get('new_password')??'');
    void action.perform(async()=>{
      const result=await api<Profile>(endpoint,{method:'PATCH',body:{
        ...(photo!==saved.photo?{photo}:{}),
        ...(current_password||new_password?{current_password,new_password}:{}),
      }});
      setSaved(result);form.reset();
    },'Perfil atualizado.');
  }
  return <FormPanel title={saved.name} submit={submit} pending={action.pending} label="Salvar perfil">
    {photo&&<OptimizedImage className="avatar" src={photo} alt="Sua foto de perfil"/>}
    <MediaField endpoint="/upload" label="Sua foto de perfil" profile="avatar" uploadOnly value={photo} onChange={setPhoto}/>
    {photo&&<div><button className="botao secundario" type="button" onClick={()=>setPhoto('')}>Remover foto</button></div>}
    <fieldset><legend>Alterar senha</legend><div className="form-colunas">
      <label>Senha atual<input type="password" name="current_password" autoComplete="current-password" maxLength={72}/></label>
      <label>Nova senha<input type="password" name="new_password" autoComplete="new-password" minLength={8} maxLength={72}/></label>
    </div></fieldset>
    <Result error={action.error} success={action.success}/>
  </FormPanel>;
}
