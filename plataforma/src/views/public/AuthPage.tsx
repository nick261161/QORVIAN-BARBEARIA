'use client';
import { Link,useNavigate,useParams } from '@/lib/navigation';
import { AccessForm,useSession } from '../../contexts/AuthContext.js';
import { useStore } from '../../contexts/ThemeConfigContext.js';

export function AuthPage(){
  const {tenant}=useStore();const navigate=useNavigate();const {session}=useSession();
  const params=useParams();
  const base=`/loja/${tenant.slug}`;
  return <main className="largura pagina"><Link className="voltar" to={base}>Voltar à vitrine</Link><section className="painel acesso"><h1>Acessar conta</h1>
    {session?<Link className="botao secundario" to={session.redirect_to??`${base}/conta`}>{session.role==='CLIENT'?'Minha conta':'Abrir painel'}</Link>:
    <AccessForm slug={tenant.slug} unified={!params.slug} allowRegistration onSuccess={account=>navigate(account.redirect_to??`${base}/conta`)}/>}
  </section></main>;
}
