import type { ReactNode } from 'react';
import { StoreLayout } from '@/contexts/ThemeConfigContext';
export default async function ShopLayout({children,params}:{children:ReactNode;params:Promise<{slug:string}>}){
  return <StoreLayout slug={(await params).slug}>{children}</StoreLayout>;
}
