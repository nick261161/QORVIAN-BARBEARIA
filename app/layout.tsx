import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Navalha & Cia. | Barbearia',
  description: 'Corte, barba e cuidados masculinos. Escolha seu serviço e agende um horário na Navalha & Cia.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
