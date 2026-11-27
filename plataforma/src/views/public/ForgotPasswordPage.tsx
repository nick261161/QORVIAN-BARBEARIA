'use client';
import {useState,type FormEvent} from 'react';
import {Link,useParams} from '@/lib/navigation';
import {PasswordInput} from '@/components/ui/PasswordInput';
import {Result,useAction} from '@/components/ui';
import {api} from '@/services/api';

export function ForgotPasswordPage(){
  const params=useParams();
  const shop=typeof params.slug==='string'?params.slug:undefined;
  const [phone,setPhone]=useState('');
  const [challenge,setChallenge]=useState('');
  const [done,setDone]=useState(false);
  const action=useAction();
  const login=shop?`/loja/${shop}/entrar`:'/login';
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const identity={phone,...(shop?{slug:shop}:{})};
    void action.perform(async()=>{
      if(!challenge){
        const response=await api<{challenge:string}>('/auth/forgot-password-phone',{method:'POST',body:identity});
        setChallenge(response.challenge);return;
      }
      const password=String(fields.get('password'));
      if(password!==fields.get('repeat'))throw new Error('As senhas devem ser iguais.');
      await api('/auth/reset-password-phone',{method:'POST',body:{...identity,challenge,code:fields.get('code'),password}});
      setDone(true);
    });
  }
  return <main className="largura pagina"><section className="painel acesso">
    <h1>Redefinir senha</h1>
    {done?<p role="status">Senha atualizada. Entre com a nova senha.</p>:
      <form className="formulario" onSubmit={submit}>
        <label>Telefone com DDD<input type="tel" autoComplete="tel" required value={phone} maxLength={25} readOnly={Boolean(challenge)} onChange={event=>setPhone(event.target.value)}/></label>
        {challenge&&<>
          <p className="suave">Se a conta puder usar a recuperação, você receberá um SMS.</p>
          <label>Código de seis dígitos<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/></label>
          <label>Nova senha<PasswordInput name="password" autoComplete="new-password" required minLength={8} maxLength={72}/></label>
          <label>Repita a senha<PasswordInput name="repeat" autoComplete="new-password" required minLength={8} maxLength={72}/></label>
        </>}
        <Result error={action.error} success={action.success}/>
        <button className="botao primario" disabled={action.pending}>{challenge?'Salvar nova senha':'Receber código por SMS'}</button>
        {challenge&&<button type="button" className="botao secundario" disabled={action.pending} onClick={()=>setChallenge('')}>Solicitar outro código</button>}
      </form>}
    <Link className="voltar" to={login}>Voltar ao login</Link>
  </section></main>;
}
