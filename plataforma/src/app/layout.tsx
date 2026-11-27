import type { Metadata,Viewport } from 'next';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/contexts/AuthContext';
import '../styles.css';

export const metadata:Metadata={title:'Agenda | Barbearia',description:'Vitrine, agendamento e gestão da barbearia.'};
export const viewport:Viewport={width:'device-width',initialScale:1,maximumScale:1};
export default function Layout({children}:{children:ReactNode}){
  return <html lang="pt-BR" className="w-full overflow-x-hidden"><body className="w-full overflow-x-hidden"><SessionProvider>{children}</SessionProvider></body></html>;
}
