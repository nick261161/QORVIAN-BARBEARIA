'use client';
import {PasswordInput} from '@/components/ui/PasswordInput';
import { useState, type FormEvent } from 'react';
import { Building2, Headset, LogOut, Plus, Search, Settings2, Shield } from 'lucide-react';
import { Link, useNavigate } from '@/lib/navigation';
import { featureLabels, featureNames, type Flags } from '../../../shared/features.js';
import { api, useResource } from '../../services/api.js';
import { AccessForm, useSession } from '../../contexts/AuthContext.js';
import { Brand, FormPanel, Notice, Result, useAction, usePageTitle } from '../../components/ui/index.js';
import {MasterAccounts} from './MasterAccounts';

type Controls = { feature_flags: Partial<Flags>; flags: Flags; override_limit: number | null; max_professionals: number };
type StoreRow = Controls & { id: string; slug: string; name: string; kind: 'BARBEARIA' | 'SALAO' | 'ESTETICA'; status: 'ATIVO' | 'SUSPENSO' };
type Overview = { global: Controls; tenants: StoreRow[]; stats: { active_tenants: number; clients: number; appointments: number } };
const types = { BARBEARIA: 'Barbearia', SALAO: 'Salão', ESTETICA: 'Clínica de estética' };

export function Master() {
  const { session, loading, error, logout, reload } = useSession();
  const navigate = useNavigate();
  const allowed = session?.role === 'SUPER_ADMIN';
  const dashboard = useResource<Overview>(allowed ? '/master' : null);
  const action = useAction(dashboard.refresh);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [switchStatus, setSwitchStatus] = useState(false);
  usePageTitle('Painel master | Agenda');
  if (loading || error) return <main className="largura pagina"><Notice loading={loading} error={error} /></main>;
  if (!allowed) return <main className="largura pagina acesso-wrap"><Brand /><section className="painel acesso"><span className="icone-suave"><Shield size={22} /></span><h1>Painel master</h1><p>Entre com a conta da plataforma.</p><AccessForm onSuccess={() => {}} />
    {session?.impersonating && session.slug && <Link className="botao secundario" to={`/gestao/${session.slug}`}>Voltar à sessão de suporte</Link>}</section></main>;
  const data = dashboard.data;
  const tenant = data?.tenants.find(item => item.id === selected);
  const needle = search.trim().toLocaleLowerCase('pt-BR');
  const rows = data?.tenants.filter(item => (item.name.toLocaleLowerCase('pt-BR').includes(needle) || item.slug.includes(needle)) && (!statusFilter || item.status === statusFilter));

  async function startSupport(id: string) {
    const { slug } = await api<{ slug: string }>(`/master/tenants/${id}/support`, { method: 'POST' });
    await reload(); navigate(`/gestao/${slug}`);
  }
  return <div className="painel-app"><header className="topo-gestao"><div className="largura-painel linha-topo"><Brand title="Agenda · Master" url="/master" />
    <button className="botao secundario" onClick={() => void action.perform(logout)}><LogOut size={17} /> Sair</button></div></header>
    <main className="largura-painel pagina"><div className="cabecalho-pagina"><p className="suave">Painel master</p><h1>Estabelecimentos</h1></div>
      <Notice error={dashboard.error ?? action.error} loading={dashboard.loading && !data} />
      {data && <><div className="metricas">{[{ label: 'Estabelecimentos ativos', value: data.stats.active_tenants }, { label: 'Clientes', value: data.stats.clients }, { label: 'Agendamentos', value: data.stats.appointments }].map(item => <article className="painel metrica" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</div>
        <section className="painel formulario"><div className="titulo-painel"><h2>Lista de estabelecimentos</h2><button className="botao primario" onClick={() => setCreating(value => !value)}><Plus size={17} /> {creating ? 'Fechar cadastro' : 'Novo estabelecimento'}</button></div>
          <div className="form-colunas"><label><span className="acoes"><Search size={16} /> Buscar</span><input value={search} placeholder="Nome ou endereço da vitrine" onChange={event => setSearch(event.target.value)} /></label>
            <label>Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todos</option><option value="ATIVO">Ativo</option><option value="SUSPENSO">Suspenso</option></select></label></div>
          <div className="tabela"><table><thead><tr><th scope="col">Estabelecimento</th><th scope="col">Tipo</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead><tbody>{rows?.map(item => <tr key={item.id}>
            <th scope="row"><Building2 size={17} /><span>{item.name}<small>{item.slug}</small></span></th><td>{types[item.kind]}</td><td><span className="estado" data-status={item.status}>{item.status === 'ATIVO' ? 'Ativo' : 'Suspenso'}</span></td>
            <td><div className="acoes"><button className="botao secundario" aria-label={`Configurar ${item.name}`} onClick={() => { setSelected(item.id); setSwitchStatus(false); }}><Settings2 size={16} /> Configurar</button>
              <button className="botao secundario" disabled={action.pending} onClick={() => void action.perform(() => startSupport(item.id))}><Headset size={16} /> Acessar painel</button></div></td>
          </tr>)}</tbody></table></div>{!rows?.length && <Notice empty="Nenhum estabelecimento encontrado." />}
        </section>
        {creating && <NewStore onDone={() => { setCreating(false); dashboard.refresh(); }} />}
        <MasterAccounts/>
        <div className="controles-master">
          <FeaturePanel key="global" endpoint="/master/controls" title="Controles globais" control={data.global} refresh={dashboard.refresh} />
          {tenant && <FeaturePanel key={tenant.id} endpoint={`/master/tenants/${tenant.id}`} title={tenant.name} control={tenant} refresh={dashboard.refresh} local>
            <div className="acoes"><span>Status atual: <strong>{tenant.status === 'ATIVO' ? 'Ativo' : 'Suspenso'}</strong></span>
              {switchStatus ? <><button className="botao perigo" disabled={action.pending} onClick={() => {
                void action.perform(() => api(`/master/tenants/${tenant.id}`, { method: 'PATCH', body: { feature_flags: {}, status: tenant.status === 'ATIVO' ? 'SUSPENSO' : 'ATIVO' } })).then(ok => { if (ok) setSwitchStatus(false); });
              }}>Confirmar mudança</button><button className="botao secundario" onClick={() => setSwitchStatus(false)}>Voltar</button></> : <button className="botao secundario" onClick={() => setSwitchStatus(true)}>{tenant.status === 'ATIVO' ? 'Suspender' : 'Reativar'}</button>}
            </div><Result error={action.error} success={action.success} />
          </FeaturePanel>}
        </div>
      </>}
    </main></div>;
}

function FeaturePanel({ title, endpoint, control, refresh, local, children }: { title: string; endpoint: string; control: Controls; refresh: () => void; local?: boolean; children?: React.ReactNode }) {
  const [limit, setLimit] = useState<string | null>(null);
  const action = useAction(refresh);
  type Patch = { feature_flags: Partial<Record<keyof Flags, boolean | null>>; max_professionals?: number | null };
  function update(patch: Patch) { return action.perform(() => api(endpoint, { method: 'PATCH', body: patch })); }
  return <section className="painel formulario"><h2>{title}</h2><p className="suave">{local ? 'Cada ajuste substitui o padrão global deste estabelecimento.' : 'Usados pelos estabelecimentos que herdam o padrão da plataforma.'}</p>
    {children}
    <div className="matriz">{featureNames.map(flag => <label key={flag} className="flag"><span>{featureLabels[flag]}<small>Em vigor: {control.flags[flag] ? 'ligado' : 'desligado'}</small></span>
      <select value={control.feature_flags[flag] === undefined ? 'inherit' : String(control.feature_flags[flag])} disabled={action.pending}
        onChange={event => { const value = event.target.value; void update({ feature_flags: { [flag]: value === 'inherit' ? null : value === 'true' } }); }}>
        <option value="inherit">{local ? 'Herdar' : 'Padrão'}</option><option value="true">Ligado</option><option value="false">Desligado</option></select></label>)}</div>
    <form className="formulario" onSubmit={event => { event.preventDefault(); const value = limit ?? String(control.override_limit ?? ''); void update({ feature_flags: {}, max_professionals: value ? Number(value) : null }).then(ok => { if (ok) setLimit(null); }); }}>
      <label>Limite de profissionais<input type="number" min="1" max="500" value={limit ?? String(control.override_limit ?? '')} placeholder={`Em vigor: ${control.max_professionals}`} onChange={event => setLimit(event.target.value)} /></label>
      <div className="acoes"><button className="botao primario" disabled={action.pending}>Salvar limite</button></div></form>
    <Result error={action.error} success={action.success} />
  </section>;
}

function NewStore({ onDone }: { onDone: () => void }) {
  const action = useAction();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const body = { name: data.get('name'), slug: data.get('slug'), kind: data.get('kind'), timezone: data.get('timezone'), owner: { name: data.get('owner_name'), email:data.get('owner_email'),phone: data.get('owner_phone'), password: data.get('password') } };
    void action.perform(() => api('/master/owners', { method: 'POST', body })).then(ok => { if (ok) onDone(); });
  }
  return <FormPanel title="Cadastrar estabelecimento" submit={submit} pending={action.pending} label="Cadastrar">
    <div className="form-colunas"><label>Nome do estabelecimento<input name="name" required /></label><label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required placeholder="exemplo-bela" /></label>
      <label>Tipo<select name="kind">{Object.entries(types).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Fuso IANA<input name="timezone" defaultValue="America/Fortaleza" required /></label>
      <label>Nome do proprietário<input name="owner_name" required /></label><label>E-mail do proprietário<input name="owner_email" type="email" required /></label><label>Telefone do proprietário<input name="owner_phone" type="tel" required /></label></div>
    <label>Senha inicial<PasswordInput name="password" minLength={8} maxLength={72} required autoComplete="new-password" /></label><Result error={action.error} success={action.success} />
  </FormPanel>;
}
