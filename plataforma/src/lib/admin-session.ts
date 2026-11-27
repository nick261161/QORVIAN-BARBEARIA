import {cache} from 'react';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {cookie,verifySession} from './auth';
import {HttpError} from '../../backend/src/middlewares/error.middleware.js';

export const adminIdentity=cache(async()=>{
  const token=(await cookies()).get(cookie)?.value;
  const identity=await verifySession(token).catch(error=>{
    if(error instanceof HttpError)redirect('/login');
    throw error;
  });
  if(!identity.tenant||!['OWNER','STAFF'].includes(identity.role))redirect('/login');
  return {...identity,tenant:identity.tenant};
});
