'use client';
import {useRef,useState} from 'react';
import {api,type Tenant} from '@/services/api';
import {FormPanel,Result,useAction} from '@/components/ui';
import {confirmationFields,renderConfirmation} from '@/utils/whatsappLink';

export function ConfirmationTemplate({base,tenant,template,refresh}:{base:string;tenant:Tenant;template:string;refresh:()=>void}){
  const [draft,setDraft]=useState(template);
  const input=useRef<HTMLTextAreaElement>(null);
  const action=useAction(refresh);
  const example=renderConfirmation(draft,{cliente:'Mariana Costa',servico:'Corte clássico',profissional:'Rafael',data:'10/12/2026',
    horario:'14:30',valor:'R$ 55,00',empresa:tenant.name,endereco:tenant.site.address||'Rua das Flores, 120'});
  function insert(field:string){
    const area=input.current;
    if(!area)return;
    const variable=`{${field}}`;
    const from=area.selectionStart;
    const next=draft.slice(0,from)+variable+draft.slice(area.selectionEnd);
    if(next.length>2000)return;
    setDraft(next);
    requestAnimationFrame(()=>{area.focus();area.setSelectionRange(from+variable.length,from+variable.length);});
  }
  return <FormPanel title="Mensagem de confirmação" pending={action.pending} label="Salvar mensagem" submit={event=>{
    event.preventDefault();void action.perform(async()=>{const result=await api<{confirmation_message_template:string}>(base+'/confirmation',{
      method:'PATCH',body:{confirmation_message_template:draft}});setDraft(result.confirmation_message_template);
    },'Mensagem atualizada.');
  }}>
    <label>Modelo para WhatsApp<textarea required maxLength={2000} rows={7} ref={input} value={draft} onChange={event=>setDraft(event.target.value)}/></label>
    <div className="acoes" aria-label="Variáveis da mensagem">{confirmationFields.map(field=>
      <button type="button" className="botao secundario" key={field} onClick={()=>insert(field)}>{`{${field}}`}</button>)}</div>
    <div className="mensagem-preview"><h3>Prévia com dados fictícios</h3><p>{example}</p></div>
    <Result error={action.error} success={action.success}/>
  </FormPanel>;
}
