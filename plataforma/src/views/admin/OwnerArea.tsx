'use client';
import { lazy } from 'react';
import { CalendarDays, ChartNoAxesCombined, CircleDollarSign, Clock3, Gift, Globe2, LayoutDashboard, LogOut, Package, Scissors, ShoppingBag, UserRound, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from '@/lib/navigation';
import { type Feature } from '../../../shared/features.js';
import { api,useResource,type Business } from '../../services/api.js';
import { AdminServicesPage } from './AdminServicesPage.js';
import { AdminProductsPage } from './AdminProductsPage.js';
import { AdminTeamPage } from './AdminTeamPage.js';
import { AdminClientsPage } from './AdminClientsPage.js';
import { AdminLoyaltyPage } from './AdminLoyaltyPage.js';
import { AdminDashboardPage } from './AdminDashboardPage.js';
import { AdminSchedulePage } from './AdminSchedulePage.js';
import { AdminCommissionsPage } from './AdminCommissionsPage.js';
import { AdminSidebar } from '../../components/layout/AdminSidebar.js';
import { Hours } from './AdminSettingsPage.js';
import { SiteEditor } from './AdminCustomizePage.js';
import { AccessForm, useSession } from '../../contexts/AuthContext.js';
import { Brand, Notice, useAction, useFeatureFlags, usePageTitle } from '../../components/ui/index.js';
import { ManageOrders } from './AdminCommerce.js';
const FinancialReports=lazy(()=>import('./AdminReportsPage.js').then(module=>({default:module.FinancialReports})));

const tabs = [
  { path: '', label: 'Visão geral', icon: LayoutDashboard }, { path: 'agenda', label: 'Agenda', icon: CalendarDays },
  { path: 'servicos', label: 'Serviços', icon: Scissors }, { path: 'produtos', label: 'Produtos', icon: Package, flag: 'enable_products_store' },
  { path: 'profissionais', label: 'Profissionais', icon: Users }, { path: 'horarios', label: 'Horários e bloqueios', icon: Clock3 },
  { path: 'vitrine', label: 'Editor da vitrine', icon: Globe2, flag: 'enable_site_customizer' },
  { path: 'relatorios', label: 'Relatórios', icon: ChartNoAxesCombined, flag: 'enable_reports' },
  { path: 'clientes', label: 'Clientes', icon: UserRound }, { path: 'pedidos', label: 'Pedidos', icon: ShoppingBag },
  { path: 'fidelidade', label: 'Fidelidade', icon: Gift, flag:'enable_loyalty_club' },
  { path: 'comissoes', label: 'Comissões', icon: CircleDollarSign, flag:'enable_commissions' },
] as const satisfies readonly { path: string; label: string; icon: typeof Clock3; flag?: Feature }[];

const canonical:Record<string,string>={profissionais:'equipe',horarios:'configuracoes',vitrine:'personalizar'};
export function OwnerArea({store,currentSection}:{store?:string;currentSection?:string}={}) {
  const params=useParams();
  const slug=store??String(params.slug??'');
  const section=currentSection??(Array.isArray(params.section)?params.section[0]??'':params.section??'');
  const { session, loading, error, reload, logout } = useSession();
  const navigate = useNavigate();
  const allowed = session?.role === 'OWNER' && session.slug === slug;
  const base = `/owner/${slug}`;
  const business = useResource<Business>(allowed ? base : null);
  const action = useAction();
  const enabled = useFeatureFlags(business.data?.flags);
  usePageTitle(business.data ? `Gestão | ${business.data.tenant.name}` : 'Gestão do estabelecimento');
  if (loading || error) return <main className="largura pagina"><Notice loading={loading} error={error} /></main>;
  if (!allowed) return <main className="largura pagina acesso-wrap"><Brand url={`/loja/${slug}`} /><section className="painel acesso"><h1>Gestão do estabelecimento</h1><p>Entre com a conta de empresário.</p>
    <AccessForm slug={slug} onSuccess={account => { if (account.role === 'OWNER') navigate(`/gestao/${slug}`); }} />
    {session?.role === 'CLIENT' && session.slug === slug && <p className="erro" role="alert">Esta conta tem acesso apenas à área do cliente.</p>}</section></main>;
  const data = business.data;
  if (!data) return <main className="largura pagina"><Notice loading={business.loading} error={business.error} />{session.impersonating && <button className="botao secundario" onClick={() => void action.perform(async () => { await api('/auth/exit-support', { method: 'POST' }); await reload(); navigate('/master'); })}>Encerrar suporte</button>}</main>;
  const path = store?'/admin':`/gestao/${slug}`;
  const shown = tabs.filter(tab => !('flag' in tab) || enabled(tab.flag));
  const active = shown.find(tab => tab.path === section);
  return <div className="painel-app"><header className="topo-gestao"><div className="linha-topo largura-painel"><Brand title={data.tenant.name} url={path} logo={data.tenant.site.logo} />
    <div className="acoes"><Link className="botao secundario" to={`/loja/${slug}`}><Globe2 size={17} /> Vitrine</Link><button className="botao secundario quadrado" aria-label="Sair" onClick={() => { void action.perform(logout); }}><LogOut size={18} /></button></div></div></header>
    {session.impersonating && <div className="aviso-suporte"><div className="largura-painel linha-topo"><span>Modo suporte · {session.name}</span><button className="botao secundario" disabled={action.pending} onClick={() => void action.perform(async () => { await api('/auth/exit-support', { method: 'POST' }); await reload(); navigate('/master'); })}>Encerrar suporte</button></div></div>}
    <div className="layout-painel largura-painel"><AdminSidebar path={path} tabs={store?shown.map(tab=>({...tab,path:canonical[tab.path]??tab.path})):shown}/>
      <main className="conteudo-painel" key={section}><div className="cabecalho-pagina"><p className="suave">Gestão do estabelecimento</p><h1>{active?.label ?? 'Seção indisponível'}</h1></div>
        <Notice error={action.error || business.error} />
        {!active ? <Notice empty="Esta seção está desativada ou não existe." /> :
          section === 'servicos' ? <AdminServicesPage base={base} business={data}/> : section === 'produtos' ? <AdminProductsPage base={base} business={data}/> :
          section === 'profissionais' ? <AdminTeamPage base={base} business={data}/> : section === 'horarios' ? <Hours base={base} tenant={data.tenant} flags={data.flags} template={data.confirmation_message_template} refresh={business.refresh} /> :
          section === 'vitrine' ? <SiteEditor base={base} tenant={data.tenant} refresh={business.refresh} /> : section === 'relatorios' ? <FinancialReports base={base} business={data} /> :
          section==='clientes'?<AdminClientsPage base={base} business={data}/>:
          section==='pedidos'?<ManageOrders base={base} tenant={data.tenant} commission={data.flags.enable_commissions}/>:
          section==='fidelidade'?<AdminLoyaltyPage base={base} business={data}/>:
          section==='comissoes'?<AdminCommissionsPage base={base} tenant={data.tenant}/>:
          section==='agenda'?<AdminSchedulePage base={base} business={data}/>:<AdminDashboardPage base={base} business={data}/>}
      </main></div></div>;
}
