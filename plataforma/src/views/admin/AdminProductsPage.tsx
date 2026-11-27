'use client';
import type { Business } from '../../services/api.js';
import { Catalog } from './AdminCatalog.js';

export function AdminProductsPage({base,business}:{base:string;business:Business}){
  return <Catalog base={base} path="products" commissions={business.flags.enable_commissions}/>;
}
