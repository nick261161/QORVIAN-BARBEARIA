'use client';
import type { Business } from '../../services/api.js';
import { Agenda } from '../../components/booking/AdminAgenda.js';

export function AdminSchedulePage({base,business}:{base:string;business:Business}){
  return <Agenda base={base} business={business} dashboard={false}/>;
}
