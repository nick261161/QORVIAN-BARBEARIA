import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/contexts/AuthContext';
import '../styles.css';

export const metadata:Metadata={title:'Agenda | Barbearia',description:'Vitrine, agendamento e gestão da barbearia.'};
export default function Layout({children}:{children:ReactNode}){
  return <html lang="pt-BR"><body><SessionProvider>{children}</SessionProvider></body></html>;
}
