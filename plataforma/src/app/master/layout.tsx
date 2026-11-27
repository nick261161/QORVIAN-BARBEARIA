import type {ReactNode} from 'react';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {cookie,verifySession} from '@/lib/auth';
import {HttpError} from '../../../backend/src/middlewares/error.middleware.js';

export default async function MasterLayout({children}:{children:ReactNode}){
  const identity=await verifySession((await cookies()).get(cookie)?.value).catch(error=>{
    if(error instanceof HttpError)redirect('/login');
    throw error;
  });
  if(identity.role!=='SUPER_ADMIN')redirect('/login');
  return children;
}
