'use client';
import type { Business } from '../../services/api.js';
import { ManageClients } from './AdminCommerce.js';

export function AdminClientsPage({base,business}:{base:string;business:Business}){
  return <ManageClients base={base} tenant={business.tenant} loyalty={business.flags.enable_loyalty_club}/>;
}
