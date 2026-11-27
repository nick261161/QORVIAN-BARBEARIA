'use client';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { CalendarDays,UserRound } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { useStore } from '../../contexts/ThemeConfigContext.js';
import { Notice } from '../../components/ui/index.js';

export function TeamPage(){
  const {tenant,services,professionals,flags}=useStore();
  return <><main className="largura pagina"><h1>Equipe</h1>{!professionals.length&&<Notice empty="A equipe será divulgada em breve."/>}
    <div className="vitrine-grade">{professionals.map(item=><article className="painel formulario" key={item.id}>
      {item.photo?<OptimizedImage className="avatar" src={item.photo} alt=""/>:<span className="icone-suave"><UserRound size={22}/></span>}<h2>{item.name}</h2>
      <p>{services.filter(service=>item.service_ids.includes(service.id)).map(service=>service.name).join(' · ')||'Consulte as especialidades.'}</p>
      {flags.enable_online_booking&&<Link className="botao primario" to={`/loja/${tenant.slug}/agendar?professionalId=${item.id}`}><CalendarDays size={17}/> Agendar com {item.name}</Link>}
    </article>)}</div></main></>;
}
