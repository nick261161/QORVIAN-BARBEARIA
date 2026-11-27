'use client';
import type { Business } from '../../services/api.js';
import { ManageLoyalty } from './AdminCommerce.js';

export function AdminLoyaltyPage({base,business}:{base:string;business:Business}){
  return <ManageLoyalty base={base} productsEnabled={business.flags.enable_products_store}/>;
}
