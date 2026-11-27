'use client';
import {useSession} from '@/contexts/AuthContext';
import {api} from '@/services/api';
import {useNavigate} from '@/lib/navigation';
import {Notice,useAction} from '@/components/ui';

export function SupportNotice(){
  const {session,reload}=useSession();
  const navigate=useNavigate();
  const action=useAction();
  if(!session?.read_only_support)return null;
  return <div className="aviso-suporte"><div className="largura-painel linha-topo">
    <span>Suporte · {session.name} · Somente consulta</span>
    <button type="button" className="botao secundario" disabled={action.pending} onClick={()=>void action.perform(async()=>{
      await api('/auth/exit-support',{method:'POST'});await reload();navigate('/master');
    })}>Encerrar suporte</button>
    <Notice error={action.error}/>
  </div></div>;
}
