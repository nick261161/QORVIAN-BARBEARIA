'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Product } from '../services/api.js';

type Quantities=Record<string,number>;
type Cart={lines:{product:Product;quantity:number}[];units:number;total:number;set:(id:string,quantity:number)=>void;clear:()=>void};
const Context=createContext<Cart|null>(null);

export function CartProvider({slug,products,children}:{slug:string;products:Product[];children:ReactNode}) {
  const key=`agenda.cart.${slug}`;
  const [quantities,setQuantities]=useState<Quantities>(()=>{
    try { const saved:unknown=JSON.parse(localStorage.getItem(key)??'{}');
      return saved&&typeof saved==='object'&&!Array.isArray(saved)?Object.fromEntries(Object.entries(saved).filter(([id,qty])=>/^[a-f0-9-]{36}$/i.test(id)&&Number.isInteger(qty)&&qty>0&&qty<=100)):{};
    } catch { return {}; }
  });
  useEffect(()=>{ try{localStorage.setItem(key,JSON.stringify(quantities));}catch{/* private mode */} },[key,quantities]);
  const lines=products.filter(item=>quantities[item.id]>0).map(product=>({product,quantity:quantities[product.id]}));
  const units=lines.reduce((sum,item)=>sum+item.quantity,0);
  const total=lines.reduce((sum,item)=>sum+item.quantity*item.product.price_cents,0);
  function set(id:string,quantity:number){
    const product=products.find(item=>item.id===id);
    const next=Math.max(0,Math.min(100,product?.stock_quantity??0,Math.trunc(quantity)||0));
    setQuantities(current=>{if(next) return {...current,[id]:next};const copy={...current};delete copy[id];return copy;});
  }
  return <Context.Provider value={{lines,units,total,set,clear:()=>setQuantities({})}}>{children}</Context.Provider>;
}
export function useCart(){return useContext(Context);}
