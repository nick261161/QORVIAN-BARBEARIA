import type { ReactNode } from 'react';
import { StoreLayout } from '@/contexts/ThemeConfigContext';
export default function PublicLayout({children}:{children:ReactNode}){
  return <StoreLayout slug={process.env.DEFAULT_TENANT_SLUG??'navalha-e-cia'}>{children}</StoreLayout>;
}
