'use client';
import { useState } from 'react';
import { LogOut,ShoppingBag } from 'lucide-react';
import { Link } from '@/lib/navigation';
import type { Flags } from '../../../shared/features.js';
import { message,type Tenant } from '../../services/api.js';
import { useSession } from '../../contexts/AuthContext.js';
import { useCart } from '../../contexts/CartContext.js';
import { Brand } from '../ui/index.js';

export function PublicNavbar({ tenant,flags,loyalty }: { tenant: Tenant;flags:Flags;loyalty:boolean }) {
  const { session, logout } = useSession();
  const [error, setError] = useState('');
  const root = `/loja/${tenant.slug}`;
  const same = session?.slug === tenant.slug;
  const cart=useCart();
  return <header className="topo-publico"><div className="largura linha-topo">
    <Brand title={tenant.name} url={root} logo={tenant.site.logo} />
    <nav className="menu-publico" aria-label="Menu da loja"><Link to={`${root}/servicos`}>Serviços</Link>
      {flags.enable_products_store && <Link to={`${root}/produtos`}>Produtos</Link>}<Link to={`${root}/equipe`}>Equipe</Link>
      {flags.enable_loyalty_club && loyalty && <Link to={`${root}/fidelidade`}>Fidelidade</Link>}</nav>
    <div className="acoes">
      {flags.enable_products_store&&flags.enable_shopping_cart && <Link to={`${root}/carrinho`} className="botao contorno-claro" aria-label={`Carrinho, ${cart?.units??0} itens`}><ShoppingBag size={17}/><span aria-live="polite">{cart?.units??0}</span></Link>}
      <Link className="botao contorno-claro" to={same && session.role === 'OWNER' ? `/gestao/${tenant.slug}` : same && session.role==='STAFF' ? `/equipe/${tenant.slug}` : `${root}/${same?'conta':'entrar'}`}>{same ? session.role === 'OWNER' ? 'Gestão' : session.role==='STAFF'?'Minha agenda':'Minha conta' : 'Entrar'}</Link>
      {same && <button className="botao contorno-claro quadrado" aria-label="Sair" type="button" onClick={() => { void logout().catch(failure => setError(message(failure))); }}><LogOut size={17} /></button>}
    </div>
  </div>{error && <p className="largura erro" role="alert">{error}</p>}</header>;
}
