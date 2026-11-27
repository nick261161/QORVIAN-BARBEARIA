import {notFound} from 'next/navigation';
import {adminIdentity} from '@/lib/admin-session';
import {OwnerArea} from './OwnerArea';
import {StaffArea} from './StaffArea';

export async function AdminPage({section=''}:{section?:string}){
  const {role,tenant}=await adminIdentity();
  if(role==='STAFF'){
    if(!['','agenda','relatorios','meu-perfil'].includes(section))notFound();
    return <StaffArea store={tenant.slug} section={section}/>;
  }
  if(section==='meu-perfil')notFound();
  return <OwnerArea store={tenant.slug} currentSection={section}/>;
}
