import {after,type NextRequest} from 'next/server';
import {handle} from './http';
import {drainMediaCleanup} from './storage';
import {syncGoogleCalendar} from '../services/google-calendar.service';
export async function serve(request:NextRequest){
  const response=await handle(request);
  if(['POST','PATCH','PUT','DELETE'].includes(request.method)){
    if(/\/(media|profile|professionals|services|products|settings|site)(\/|$)/.test(request.nextUrl.pathname))
      after(async()=>{await drainMediaCleanup().catch(()=>console.error('Falha na limpeza de mídia.'));});
    if(response.ok&&/\/(agenda|appointments)(\/|$)/.test(request.nextUrl.pathname))
      after(async()=>{await syncGoogleCalendar().catch(()=>console.error('Falha na fila Google Agenda.'));});
  }
  return response;
}
