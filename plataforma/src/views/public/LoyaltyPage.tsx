'use client';
import { Gift } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { currency,rewardLabel } from '../../services/api.js';
import { useStore } from '../../contexts/ThemeConfigContext.js';
import { FullBleedHero } from '../../components/layout/FullBleedHero.js';
import { Notice } from '../../components/ui/index.js';

export function LoyaltyPage(){
  const {tenant,loyalty,flags}=useStore();
  if(!loyalty||!flags.enable_loyalty_club)return <main className="largura pagina"><Notice empty="O clube de fidelidade está indisponível."/></main>;
  const photo=tenant.site.backgrounds.loyalty||tenant.site.banner;
  return <><main><FullBleedHero compact photos={photo?[photo]:[]}><h1>{loyalty.program_name}</h1><p>{loyalty.rules_description||'Acumule saldo a cada atendimento elegível.'}</p>
    <div className="acoes"><Link className="botao destaque" to={`/loja/${tenant.slug}/conta`}><Gift size={19}/> Ver meu cartão</Link></div></FullBleedHero>
    <section className="largura pagina"><h2>Como funciona</h2><div className="metricas"><article className="painel metrica"><span>Acúmulo</span><strong>{loyalty.accumulation_type==='STAMPS_PER_SERVICE'?'1 selo por visita':`${loyalty.points_per_real} ponto(s) por R$ 1`}</strong></article>
    <article className="painel metrica"><span>Meta</span><strong>{loyalty.target_value}</strong></article><article className="painel metrica"><span>Prêmio</span><strong>{loyalty.reward?rewardLabel(loyalty.reward):'Consulte a equipe'}</strong></article></div>
    <p>Valor mínimo por transação: {currency(loyalty.min_spend_amount)}. {loyalty.include_products?'Pedidos concluídos também contam.':''} {loyalty.points_expiration_days?`O saldo de cada crédito vale por ${loyalty.points_expiration_days} dias.`:'O saldo não expira.'}</p></section></main></>;
}
