import type { ReactNode } from 'react';
import { adminIdentity } from '@/lib/admin-session';

export default async function AdminLayout({children}:{children:ReactNode}){
  await adminIdentity();
  return children;
}
