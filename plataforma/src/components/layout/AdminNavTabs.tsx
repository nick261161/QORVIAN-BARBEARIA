'use client';
import type {LucideIcon} from 'lucide-react';
import {NavLink} from '@/lib/navigation';

export type AdminNavProps={path:string;label?:string;tabs:readonly {path:string;label:string;icon:LucideIcon}[]};
export function AdminNavLinks({path,tabs}:AdminNavProps){
  return tabs.map(({path:part,label,icon:Icon})=><NavLink end={!part} to={part?`${path}/${part}`:path} key={part}>
    <Icon size={18} aria-hidden="true"/> {label}
  </NavLink>);
}
export function AdminNavTabs(props:AdminNavProps){
  return <nav className="admin-nav-tabs" aria-label={props.label??'Painel do empresário'}><AdminNavLinks {...props}/></nav>;
}
