'use client';
import type { Business } from '../../services/api.js';
import { Professionals } from './AdminCatalog.js';

export function AdminTeamPage({base,business}:{base:string;business:Business}){
  return <Professionals base={base} business={business}/>;
}
