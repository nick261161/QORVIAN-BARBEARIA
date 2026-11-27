'use client';
import { createContext,useContext,type ReactNode } from 'react';
import { useResource,type Store } from '../services/api.js';
import { Notice,theme } from '../components/ui/index.js';
import { PublicNavbar } from '../components/layout/PublicNavbar.js';
import { PublicFooter } from '../components/layout/PublicFooter.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { CartProvider } from './CartContext.js';

const StoreContext=createContext<(Store & {refresh:()=>void})|null>(null);
export function StoreLayout({slug,children}:{slug:string;children:ReactNode}){
  const store=useResource<Store>(`/public/${slug}`);const data=store.data;
  useDocumentTitle(data?`${data.tenant.name} | Agendamento`:'Agenda | Estabelecimento',data?.tenant.site.favicon||data?.tenant.site.logo);
  if(!data)return <main className="largura pagina"><Notice loading={store.loading} error={store.error}/></main>;
  return <CartProvider key={slug} slug={slug} products={data.products}><div className="publico" style={theme(data.tenant)}>
    <PublicNavbar tenant={data.tenant} flags={data.flags} loyalty={Boolean(data.loyalty)}/>
    <StoreContext.Provider value={{...data,refresh:store.refresh}}>{children}<PublicFooter/></StoreContext.Provider>
  </div></CartProvider>;
}
export function useStore(){return useContext(StoreContext)!;}
