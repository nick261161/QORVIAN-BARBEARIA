import {readMedia} from '@/lib/storage';
import {HttpError} from '../../../../../backend/src/middlewares/error.middleware.js';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{tenant:string;file:string}>}){
  const {tenant,file}=await params;
  try{
    const {bytes,cache}=await readMedia(tenant,file);
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/webp','Cache-Control':cache,'X-Content-Type-Options':'nosniff'}});
  }catch(error){
    if(error instanceof HttpError||(error instanceof Error&&'code' in error&&error.code==='ENOENT'))return new Response(null,{status:404});
    return new Response(null,{status:502});
  }
}
