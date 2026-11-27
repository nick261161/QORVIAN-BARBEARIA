'use client';
import { Link,useNavigate } from '@/lib/navigation';
import { AccessForm,useSession } from '../../contexts/AuthContext.js';
import { useStore } from '../../contexts/ThemeConfigContext.js';

export function AuthPage(){
  const {tenant}=useStore();const navigate=useNavigate();const {session}=useSession();
  const base=`/loja/${tenant.slug}`;
  return <main className="largura pagina"><Link className="voltar" to={base}>Voltar à vitrine</Link><section className="painel acesso"><h1>Acessar conta</h1>
    {session?.slug===tenant.slug?<Link className="botao secundario" to={session.role==='OWNER'||session.role==='STAFF'?'/admin':`${base}/conta`}>{session.role==='CLIENT'?'Minha conta':'Abrir painel'}</Link>:
    <AccessForm slug={tenant.slug} allowRegistration onSuccess={account=>navigate(account.role==='OWNER'||account.role==='STAFF'?'/admin':`${base}/conta`)}/>}
  </section></main>;
}
