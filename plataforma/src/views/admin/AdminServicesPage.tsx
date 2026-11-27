'use client';
import type { Business } from '../../services/api.js';
import { Catalog } from './AdminCatalog.js';

export function AdminServicesPage({base,business}:{base:string;business:Business}){
  return <Catalog base={base} path="services" commissions={business.flags.enable_commissions}/>;
}
