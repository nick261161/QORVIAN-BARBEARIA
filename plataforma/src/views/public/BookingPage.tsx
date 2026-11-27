'use client';
import { Link,useSearchParams } from '@/lib/navigation';
import { useStore } from '../../contexts/ThemeConfigContext.js';
import { BookingFlow } from '../../components/booking/BookingFlow.js';
import { Notice } from '../../components/ui/index.js';
import { useFeatureFlags } from '../../hooks/useFeatureFlags.js';

export function PublicBooking() {
  const store = useStore();
  const [params] = useSearchParams();
  const enabled = useFeatureFlags(store.flags);
  return <main className="largura pagina"><Link className="voltar" to={`/loja/${store.tenant.slug}`}>Voltar à vitrine</Link><h1>Agende seu horário</h1>
    {enabled('enable_online_booking') ? <BookingFlow tenant={store.tenant} services={store.services} professionals={store.professionals} initial={params.get('serviceId')??params.get('servico')} suggested={params.get('professionalId')} /> : <Notice empty="O agendamento online está indisponível para este estabelecimento." />}
  </main>;
}
