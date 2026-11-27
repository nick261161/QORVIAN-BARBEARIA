'use client';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from '@/lib/navigation';

export function AdminSidebar({path,tabs,label='Painel do empresário'}:{path:string;label?:string;tabs:readonly {path:string;label:string;icon:LucideIcon}[]}){
  return <aside className="barra-lateral"><nav aria-label={label}>{tabs.map(({path:part,label,icon:Icon})=><NavLink end={!part} to={part?`${path}/${part}`:path} key={part}><Icon size={19}/> {label}</NavLink>)}</nav></aside>;
}
