'use client';
import type { Business } from '../../services/api.js';
import { Agenda } from '../../components/booking/AdminAgenda.js';

export function AdminDashboardPage({base,business}:{base:string;business:Business}){
  return <Agenda base={base} business={business} dashboard/>;
}
