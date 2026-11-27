import {Suspense} from 'react';
import {PublicBooking} from '@/views/public/BookingPage';
export default function Page(){return <Suspense fallback={<main className="largura pagina">Carregando agenda…</main>}><PublicBooking/></Suspense>;}
