'use client';
import {useState} from 'react';
import {useSession} from '@/contexts/AuthContext';
import {useNavigate} from '@/lib/navigation';
import {api,useResource} from '@/services/api';
import {Notice,Result,useAction} from '@/components/ui';
import {PasswordInput} from '@/components/ui/PasswordInput';

type Account={id:string;name:string;phone:string;email:string|null;role:'OWNER'|'STAFF'|'CLIENT';company:string;active:boolean;platform_blocked:boolean;tenant_status:string};
const roles={OWNER:'Empresário',STAFF:'Funcionário',CLIENT:'Cliente'};
export function MasterAccounts(){
  const [q,setQ]=useState('');
  const [role,setRole]=useState('');
  const [page,setPage]=useState(1);
  const [search,setSearch]=useState('');
  const [changing,setChanging]=useState<Account>();
  const [blocking,setBlocking]=useState<Account>();
  const accounts=useResource<{items:Account[];has_more:boolean}>(`/master/accounts?${new URLSearchParams({q:search,page:String(page),...(role?{role}:{})})}`);
  const action=useAction(accounts.refresh);
  const {reload}=useSession();
  const navigate=useNavigate();
  return <section className="painel formulario">
    <h2>Contas da plataforma</h2>
    <form className="formulario" onSubmit={event=>{event.preventDefault();setSearch(q);setPage(1);}}>
      <div className="form-colunas">
        <label>Buscar por nome, e-mail, telefone ou empresa<input value={q} maxLength={100} onChange={event=>setQ(event.target.value)}/></label>
        <label>Cargo<select value={role} onChange={event=>{setRole(event.target.value);setPage(1);}}>
          <option value="">Todos</option>{Object.entries(roles).map(([code,label])=><option key={code} value={code}>{label}</option>)}
        </select></label>
      </div>
      <button className="botao secundario">Buscar</button>
    </form>
    <Notice loading={accounts.loading} error={accounts.error} empty={!accounts.loading&&!accounts.data?.items.length?'Nenhuma conta encontrada.':undefined}/>
    <Result error={action.error} success={action.success}/>
    {!!accounts.data?.items.length&&<div className="tabela"><table><thead><tr>
      <th>Conta</th><th>Cargo</th><th>Empresa</th><th>Situação</th><th>Ações</th>
    </tr></thead><tbody>{accounts.data.items.map(account=><tr key={account.id}>
      <th scope="row"><span>{account.name}<small>{account.phone}{account.email&&` · ${account.email}`}</small></span></th>
      <td>{roles[account.role]}</td><td>{account.company}</td><td>{account.platform_blocked?'Bloqueada':account.active?'Ativa':'Inativa'}</td>
      <td><div className="acoes">
        <button type="button" className="botao secundario" disabled={action.pending||!account.active||account.platform_blocked||account.tenant_status!=='ATIVO'}
          onClick={()=>void action.perform(async()=>{
            const result=await api<{redirect_to:string}>('/master/impersonate',{method:'POST',body:{user_id:account.id}});
            await reload();navigate(result.redirect_to);
          })}>Acessar conta</button>
        <button type="button" className="botao secundario" onClick={()=>{setChanging(account);setBlocking(undefined);}}>Redefinir senha</button>
        <button type="button" className="botao secundario" onClick={()=>{setBlocking(account);setChanging(undefined);}}>{account.platform_blocked?'Desbloquear':'Bloquear'}</button>
      </div></td>
    </tr>)}</tbody></table></div>}
    {blocking&&<div className="acoes">
      <strong>{blocking.platform_blocked?'Desbloquear':'Bloquear'} {blocking.name}?</strong>
      <button type="button" className="botao primario" disabled={action.pending} onClick={()=>void action.perform(async()=>{
        await api(`/master/accounts/${blocking.id}`,{method:'PATCH',body:{blocked:!blocking.platform_blocked}});setBlocking(undefined);
      },'Situação atualizada.')}>Confirmar</button>
      <button type="button" className="botao secundario" onClick={()=>setBlocking(undefined)}>Voltar</button>
    </div>}
    {changing&&<form key={changing.id} className="formulario" onSubmit={event=>{
      event.preventDefault();
      const password=new FormData(event.currentTarget).get('password');
      void action.perform(async()=>{
        await api(`/master/accounts/${changing.id}`,{method:'PATCH',body:{password}});setChanging(undefined);
      },'Senha redefinida.');
    }}>
      <label>Nova senha de {changing.name}<PasswordInput name="password" required minLength={8} maxLength={72} autoComplete="new-password"/></label>
      <div className="acoes"><button className="botao primario" disabled={action.pending}>Salvar nova senha</button>
        <button type="button" className="botao secundario" onClick={()=>setChanging(undefined)}>Voltar</button></div>
    </form>}
    {(page>1||accounts.data?.has_more)&&<div className="acoes">
      <button type="button" className="botao secundario" disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button>
      <button type="button" className="botao secundario" disabled={!accounts.data?.has_more} onClick={()=>setPage(page+1)}>Próxima</button>
    </div>}
  </section>;
}
