'use client';
import {PasswordInput} from '@/components/ui/PasswordInput';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Scissors, Trash2, UserRound } from 'lucide-react';
import { api, currency, useResource, type Business, type CatalogCategory,type Product, type Professional, type Service } from '../../services/api.js';
import { FormPanel, Notice, Result, useAction } from '../../components/ui/index.js';
import { MediaField } from '../../components/ui/MediaField.js';
import { CategorySelectField } from '@/components/ui/CategorySelectField';

type Item = Product | Service;
type Path = { base: string; path: 'services' | 'products'; commissions:boolean };
const itemType = (path: Path['path']) => path === 'services' ? 'serviço' : 'produto';

export function Catalog({ base, path,commissions }: Path) {
  const url = `${base}/${path}`;
  const items = useResource<Item[]>(url);
  const categoryType=path==='services'?'SERVICE':'PRODUCT';
  const categoryList=useResource<CatalogCategory[]>(`/categories?type=${categoryType}`);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [removing, setRemoving] = useState('');
  const type = itemType(path);
  const action = useAction(items.refresh);
  return <><section className="painel"><div className="titulo-painel"><h2>{path === 'services' ? 'Serviços' : 'Produtos'}</h2><button className="botao primario" onClick={() => setEditing('new')}><Plus size={17} /> Novo {type}</button></div>
    <Notice loading={items.loading && !items.data} error={items.error} empty={!items.data?.length ? 'Nenhum item cadastrado.' : undefined} />
    <Result error={action.error} success={action.success} />
    <ul className="linhas">{items.data?.map(item => <li className="linha-dados" key={item.id}>
      {item.photo ? <OptimizedImage className="avatar" src={item.photo} alt="" /> : <span className="icone-suave"><Scissors size={17} /></span>}
      <div className="corpo-linha"><strong>{item.name}</strong><p>{currency(item.price_cents)}{'duration_minutes' in item ? ` · ${item.duration_minutes} min` : ` · ${item.stock_quantity??0} em estoque${item.sku?` · ${item.sku}`:''}`} · {item.active ? 'Ativo' : 'Inativo'}</p></div>
      <div className="acoes"><button className="botao secundario quadrado" aria-label={`Editar ${item.name}`} onClick={() => setEditing(item)}><Pencil size={17} /></button>
        {removing === item.id ? <><button className="botao perigo" disabled={action.pending} onClick={() => { void action.perform(() => api(`${url}/${item.id}`, { method: 'DELETE' }), 'Item removido.').then(ok => { if (ok) { setRemoving(''); if (editing !== 'new' && editing?.id === item.id) setEditing(null); } }); }}>Confirmar</button><button className="botao secundario" onClick={() => setRemoving('')}>Voltar</button></> : <button className="botao secundario quadrado" aria-label={`Remover ${item.name}`} onClick={() => setRemoving(item.id)}><Trash2 size={17} /></button>}</div>
    </li>)}</ul>
  </section>{editing && <EditItem key={editing === 'new' ? 'new' : editing.id} url={url} path={path} media={`${base}/media/catalog`} commissions={commissions} item={editing === 'new' ? undefined : editing}
    categories={categoryList.data??[]} refreshCategories={categoryList.refresh} done={() => { setEditing(null); items.refresh(); }} close={() => setEditing(null)} />}
  <Categories type={categoryType} rows={categoryList} onUpdated={items.refresh}/></>;
}

function EditItem({ url, path, item, media, commissions,categories,refreshCategories,done, close }: { url: string; path: Path['path']; item?: Item; media:string;commissions:boolean;categories:CatalogCategory[];refreshCategories:()=>void;done: () => void; close: () => void }) {
  const action = useAction();
  const [photo,setPhoto]=useState(item?.photo??'');
  const rate=item&&'duration_minutes' in item?item.custom_commission_rate:item?.commission_rate;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const override=commissions?(data.get('commission')===''?null:Math.round(Number(data.get('commission'))*100)):undefined;
    const stock=Number(data.get('stock'));
    const values = { name: data.get('name'), description: data.get('description'), category_id: data.get('category_id'), photo,
      price_cents: Math.round(Number(data.get('price')) * 100), active: data.get('active') === 'on', ...(path === 'services' ? { duration_minutes: Number(data.get('duration')),custom_commission_rate:override } : {
        sku:data.get('sku'),commission_rate:override,...(!item||stock!==item.stock_quantity?{stock_quantity:stock,stock_expected:item?.stock_quantity}:{}),
      }) };
    void action.perform(() => api(item ? `${url}/${item.id}` : url, { method: item ? 'PUT' : 'POST', body: values })).then(ok => { if (ok) done(); });
  }
  return <FormPanel title={`${item ? 'Editar' : 'Novo'} ${itemType(path)}`} submit={submit} pending={action.pending}>
    <label>Nome<input name="name" defaultValue={item?.name} required maxLength={100} /></label>
    <CategorySelectField type={path==='services'?'SERVICE':'PRODUCT'} categories={categories} initial={item?.category_id} refresh={refreshCategories}/>
    <label>Descrição<textarea name="description" defaultValue={item?.description} maxLength={1000} rows={3} /></label>
    <div className="form-colunas"><label>Preço (R$)<input name="price" type="number" defaultValue={(item?.price_cents ?? 0) / 100} min="0" max="100000" step="0.01" required /></label>
      {path === 'services' && <label>Duração (min)<input name="duration" type="number" defaultValue={item && 'duration_minutes' in item ? item.duration_minutes : 30} min="5" max="480" required /></label>}</div>
    {path==='products'&&<div className="form-colunas"><label>SKU<input name="sku" defaultValue={item?.sku??''} maxLength={80}/></label><label>Estoque<input name="stock" type="number" min="0" max="1000000" defaultValue={item?.stock_quantity??0} required/></label></div>}
    {commissions&&<label>Comissão específica (%)<input name="commission" type="number" min="0" max="100" step="0.01" defaultValue={rate==null?'':rate/100} placeholder="Usar taxa do profissional"/></label>}
    <MediaField endpoint={media} label="Foto" value={photo} onChange={setPhoto}/>
    <label className="checkbox"><input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> Ativo na vitrine</label>
    <Result error={action.error} success={action.success} /><button className="botao secundario voltar-edicao" type="button" onClick={close}>Fechar editor</button>
  </FormPanel>;
}

function Categories({type,rows,onUpdated}:{type:CatalogCategory['type'];rows:ReturnType<typeof useResource<CatalogCategory[]>>;onUpdated:()=>void}){
  const path='/categories';const [chosen,setChosen]=useState('');const [name,setName]=useState('');
  const action=useAction(()=>{rows.refresh();onUpdated();});
  return <FormPanel title={type==='SERVICE'?'Categorias de serviços':'Categorias de produtos'} label={chosen?'Salvar categoria':'Criar categoria'} pending={action.pending} submit={event=>{event.preventDefault();void action.perform(()=>api(chosen?`${path}/${chosen}`:path,{method:chosen?'PUT':'POST',body:{name,type}})).then(ok=>{if(ok){setChosen('');setName('');}});}}>
    <Notice loading={rows.loading} error={rows.error}/><label>Categoria existente<select value={chosen} onChange={event=>{setChosen(event.target.value);setName(rows.data?.find(item=>item.id===event.target.value)?.name??'');}}><option value="">Nova categoria</option>{rows.data?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Nome da categoria<input value={name} onChange={event=>setName(event.target.value)} required minLength={2} maxLength={100}/></label>
    {chosen&&<button type="button" className="botao perigo voltar-edicao" disabled={action.pending} onClick={()=>void action.perform(()=>api(`${path}/${chosen}?type=${type}`,{method:'DELETE'}),'Categoria removida.').then(ok=>{if(ok){setChosen('');setName('');}})}>Remover categoria</button>}
    <Result error={action.error} success={action.success}/>
  </FormPanel>;
}

export function Professionals({ base, business }: { base: string; business: Business }) {
  const url = `${base}/professionals`;
  const people = useResource<Professional[]>(url);
  const services = useResource<Service[]>(`${base}/services`);
  const [editing, setEditing] = useState<Professional | 'new' | null>(null);
  const [removing, setRemoving] = useState('');
  const action = useAction(people.refresh);
  const single = !business.flags.enable_multi_professionals;
  const limit = single ? 1 : business.flags.enable_professional_limit ? business.max_professionals : undefined;
  return <><section className="painel"><div className="titulo-painel"><div><h2>Profissionais</h2><p className="suave">{single ? 'Atendimento único' : limit ? `${people.data?.length ?? 0} de ${limit} profissionais cadastrados` : 'Equipe com vários profissionais'}</p></div>
    <button className="botao primario" disabled={limit !== undefined && (people.data?.length ?? 0) >= limit} onClick={() => setEditing('new')}><Plus size={17} /> Novo profissional</button></div>
    <Notice error={people.error} loading={people.loading && !people.data} empty={!people.data?.length ? 'Nenhum profissional cadastrado.' : undefined} />
    <Result error={action.error} success={action.success} />
    <ul className="linhas">{people.data?.map(person => <li key={person.id} className="linha-dados">
      {person.photo ? <OptimizedImage className="avatar" src={person.photo} alt="" /> : <span className="icone-suave"><UserRound size={18} /></span>}
      <div className="corpo-linha"><strong>{person.name}</strong><p>{services.data?.filter(service => person.service_ids.includes(service.id)).map(service => service.name).join(', ') || 'Sem especialidades'}</p></div>
      <div className="acoes"><button className="botao secundario" disabled={action.pending} onClick={() => { const {id,name,photo,service_ids}=person; void action.perform(() => api(`${url}/${id}`, { method: 'PUT', body: {name,photo,service_ids,active:!person.active} })); }}>{person.active ? 'Desativar' : 'Ativar'}</button>
        <button className="botao secundario quadrado" aria-label={`Editar ${person.name}`} onClick={() => setEditing(person)}><Pencil size={17} /></button>
        {removing === person.id ? <><button className="botao perigo" disabled={action.pending} onClick={() => { void action.perform(() => api(`${url}/${person.id}`, { method: 'DELETE' }), 'Profissional removido.').then(ok => { if (ok) { setRemoving(''); if (editing !== 'new' && editing?.id === person.id) setEditing(null); } }); }}>Confirmar</button><button className="botao secundario" onClick={() => setRemoving('')}>Voltar</button></> : <button className="botao secundario quadrado" aria-label={`Remover ${person.name}`} onClick={() => setRemoving(person.id)}><Trash2 size={17} /></button>}
      </div>
    </li>)}</ul>
  </section>{editing && <><Notice error={services.error} loading={services.loading && !services.data} />{services.data && <EditProfessional key={editing === 'new' ? 'new' : editing.id} url={url} media={`${base}/media/catalog`} commissions={business.flags.enable_commissions} person={editing === 'new' ? undefined : editing} services={services.data} done={() => { setEditing(null); people.refresh(); }} close={() => setEditing(null)} />}
    {editing!=='new'&&<StaffAccess key={editing.id} url={`${url}/${editing.id}/account`} person={editing} done={()=>{setEditing(null);people.refresh();}}/>}</>}</>;
}

function EditProfessional({ url, media,commissions,person, services, done, close }: { url: string; media:string;commissions:boolean; person?: Professional; services: Service[]; done: () => void; close: () => void }) {
  const action = useAction();
  const [photo,setPhoto]=useState(person?.photo??'');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const body = { name: data.get('name'), photo, active: data.get('active') === 'on', service_ids: data.getAll('service_ids'),...(commissions?{
      default_service_commission:Math.round(Number(data.get('service_commission'))*100),default_product_commission:Math.round(Number(data.get('product_commission'))*100),
    }:{}) };
    void action.perform(() => api(person ? `${url}/${person.id}` : url, { method: person ? 'PUT' : 'POST', body })).then(ok => { if (ok) done(); });
  }
  return <FormPanel title={person ? 'Editar profissional' : 'Novo profissional'} submit={submit} pending={action.pending}>
    <div className="form-colunas"><label>Nome<input name="name" defaultValue={person?.name} minLength={2} maxLength={100} required /></label><MediaField endpoint={media} profile="avatar" label="Foto" value={photo} onChange={setPhoto}/></div>
    {commissions&&<div className="form-colunas"><label>Comissão padrão de serviços (%)<input name="service_commission" type="number" min="0" max="100" step="0.01" defaultValue={(person?.default_service_commission??0)/100} required/></label><label>Comissão padrão de produtos (%)<input name="product_commission" type="number" min="0" max="100" step="0.01" defaultValue={(person?.default_product_commission??0)/100} required/></label></div>}
    <label className="checkbox"><input type="checkbox" name="active" defaultChecked={person?.active ?? true} /> Ativo</label>
    <fieldset><legend>Especialidades e serviços</legend>{services.map(service => <label className="checkbox" key={service.id}><input type="checkbox" name="service_ids" value={service.id} defaultChecked={person?.service_ids.includes(service.id)} /> {service.name}</label>)}</fieldset>
    <Result error={action.error} success={action.success} /><button className="botao secundario voltar-edicao" type="button" onClick={close}>Fechar editor</button>
  </FormPanel>;
}

function StaffAccess({url,person,done}:{url:string;person:Professional;done:()=>void}){
  const action=useAction();
  return <FormPanel title={`Acesso de ${person.name}`} pending={action.pending} label="Salvar acesso" submit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);void action.perform(()=>api(url,{method:'PUT',body:{phone:data.get('phone'),password:data.get('password')||undefined}})).then(ok=>{if(ok)done();});}}>
    <label>Telefone da equipe<input name="phone" type="tel" required defaultValue={person.staff_phone??''}/></label><label>{person.staff_phone?'Nova senha (opcional)':'Senha inicial'}<PasswordInput name="password" minLength={8} maxLength={72} required={!person.staff_phone} autoComplete="new-password"/></label>
    {person.staff_phone&&<button className="botao perigo voltar-edicao" type="button" onClick={()=>void action.perform(()=>api(url,{method:'DELETE'})).then(ok=>{if(ok)done();})}>Revogar acesso</button>}
    <Result error={action.error} success={action.success}/>
  </FormPanel>;
}
