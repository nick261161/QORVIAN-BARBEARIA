'use client';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useState, type FormEvent } from 'react';
import { CalendarDays, MapPin, Scissors } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { backgrounds,sections, type Site } from '../../../shared/features.js';
import { api, type Tenant } from '../../services/api.js';
import { FormPanel, Result, theme, useAction } from '../../components/ui/index.js';
import { MediaField } from '../../components/ui/MediaField.js';

const sectionNames: Record<typeof sections[number], string> = { about: 'Sobre', services: 'Serviços', products: 'Produtos', team: 'Equipe', hours: 'Horários' };
const fields: ['headline'|'address'|'whatsapp'|'instagram', string][] = [
  ['headline', 'Título principal'], ['address', 'Endereço'], ['whatsapp', 'WhatsApp'], ['instagram', 'URL do Instagram'],
];
const labels={home:'Fundo da página inicial',services:'Fundo de serviços',products:'Fundo de produtos',loyalty:'Fundo de fidelidade'};

function imagePreview(value: string) {
  return /^(?:https:\/\/|\/(?!\/)[a-z0-9_-])/i.test(value) ? value : undefined;
}

export function SiteEditor({ base, tenant, refresh }: { base: string; tenant: Tenant; refresh: () => void }) {
  const [draft, setDraft] = useState(tenant);
  const [show,setShow]=useState<typeof backgrounds[number]>('home');
  const action = useAction(refresh);
  const update = (patch: Partial<Site>) => setDraft(current => ({ ...current, site: { ...current.site, ...patch } }));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.perform(async () => {
      const saved = await api<Tenant>(`${base}/site`, { method: 'PUT', body: { ...draft.site, name: draft.name } });
      setDraft(saved);
    });
  }
  return <div className="editor-grade"><FormPanel title="Identidade da vitrine" submit={submit} pending={action.pending}>
    <label>Nome do estabelecimento<input required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <div className="form-colunas">{fields.map(([key, label]) => <label key={key}>{label}<input value={draft.site[key]} onChange={event => update({ [key]: event.target.value })} /></label>)}</div>
    <fieldset><legend>Imagens da marca</legend><div className="form-colunas">{([['logo','Logotipo'],['favicon','Ícone da aba'],['banner','Capa padrão']] as const).map(([key,label])=><MediaField key={key} endpoint={`${base}/media`} profile={key==='banner'?'banner':'catalog'} label={label} value={draft.site[key]} onChange={value=>update({[key]:value})}/>)}</div></fieldset>
    <fieldset><legend>Fundos em tela inteira</legend><div className="form-colunas">{backgrounds.map(key=><MediaField key={key} endpoint={`${base}/media`} profile="banner" label={labels[key]} value={draft.site.backgrounds[key]}
      onChange={value=>update({backgrounds:{...draft.site.backgrounds,[key]:value}})}/>)}</div></fieldset>
    <fieldset><legend>Fotos do carrossel</legend><div className="formulario">
      {[...draft.site.slides,...(draft.site.slides.length<6?['']:[])].map((value,index)=><div key={index} className="formulario">
        <MediaField endpoint={`${base}/media`} profile="banner" label={`Foto ${index+1}`} value={value}
          onChange={photo=>{const slides=[...draft.site.slides];slides[index]=photo;update({slides});}}/>
        {index<draft.site.slides.length&&<button type="button" className="botao secundario" onClick={()=>update({slides:draft.site.slides.filter((_,i)=>i!==index)})}>Remover foto {index+1}</button>}
      </div>)}
    </div></fieldset>
    <fieldset><legend>Localização no Google Maps</legend><div className="formulario">
      <label>Endereço completo<input value={draft.site.address_full} maxLength={400} onChange={event=>update({address_full:event.target.value})}/></label>
      <div className="form-colunas">{(['latitude','longitude'] as const).map(key=><label key={key}>{key==='latitude'?'Latitude':'Longitude'}
        <input type="number" step="any" min={key==='latitude'?-90:-180} max={key==='latitude'?90:180} value={draft.site[key]??''}
          onChange={event=>update({[key]:event.target.value===''?null:event.target.valueAsNumber})}/></label>)}</div>
      <label>Direção da fachada (graus)<input type="number" min={0} max={360} step="any" value={draft.site.street_view_heading}
        onChange={event=>update({street_view_heading:event.target.value===''?0:event.target.valueAsNumber})}/></label>
    </div></fieldset>
    <label>Descrição<textarea rows={4} maxLength={1600} value={draft.site.bio} onChange={event => update({ bio: event.target.value })} /></label>
    <div className="form-colunas"><label>Cor principal<input type="color" value={draft.site.primary} onChange={event => update({ primary: event.target.value })} /></label><label>Cor de destaque<input type="color" value={draft.site.secondary} onChange={event => update({ secondary: event.target.value })} /></label></div>
    <fieldset><legend>Seções da vitrine</legend><div className="acoes">{sections.map(key => <label className="checkbox" key={key}><input type="checkbox" checked={draft.site.sections[key]} onChange={event => update({ sections: { ...draft.site.sections, [key]: event.target.checked } })} /> {sectionNames[key]}</label>)}</div></fieldset>
    <Result error={action.error} success={action.success} />
  </FormPanel><section className="painel preview-espera"><div className="titulo-painel"><h2>Prévia ao vivo</h2><Link className="botao secundario" to={`/loja/${tenant.slug}`}>Abrir vitrine</Link></div>
    <div className="acoes filtros" aria-label="Página da prévia">{backgrounds.map(key=><button type="button" className="botao secundario" key={key} aria-pressed={show===key} onClick={()=>setShow(key)}>{labels[key].replace('Fundo da ','').replace('Fundo de ','')}</button>)}</div>
    <div className="preview-site" style={theme(draft)}><div className="marca">{imagePreview(draft.site.logo) ? <OptimizedImage src={imagePreview(draft.site.logo)} alt="" /> : <span><Scissors size={18} /></span>}{draft.name}</div>
      {imagePreview(draft.site.backgrounds[show]||draft.site.banner) && <OptimizedImage className="preview-banner" src={imagePreview(draft.site.backgrounds[show]||draft.site.banner)} alt="" />}
      {draft.site.address && <p className="sobretitulo"><MapPin size={14} /> {draft.site.address}</p>}<h3>{show==='home'?(draft.site.headline||draft.name):labels[show].replace('Fundo de ','')}</h3>
      {draft.site.sections.about && <p>{draft.site.bio}</p>}<span className="botao destaque"><CalendarDays size={16} /> Agendar horário</span>
      <div className="preview-secoes">{sections.filter(key => draft.site.sections[key]).map(key => <span key={key}>{sectionNames[key]}</span>)}</div>
    </div>
  </section></div>;
}
