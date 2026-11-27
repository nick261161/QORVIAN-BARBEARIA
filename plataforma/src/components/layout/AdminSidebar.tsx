'use client';
import {AdminNavLinks,AdminNavTabs,type AdminNavProps} from './AdminNavTabs';

export function AdminSidebar(props:AdminNavProps){
  return <><aside className="barra-lateral"><nav aria-label={props.label??'Painel do empresário'}><AdminNavLinks {...props}/></nav></aside>
    <AdminNavTabs {...props}/></>;
}
