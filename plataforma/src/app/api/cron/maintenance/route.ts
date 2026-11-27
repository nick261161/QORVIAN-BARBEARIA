import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { config } from '../../../../../backend/src/config/env.js';
import { syncGoogleCalendar } from '@/services/google-calendar.service';
import { drainMediaCleanup,sweepPendingMedia } from '@/lib/storage';
import { pool } from '@/lib/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:NextRequest){
  const expected=Buffer.from('Bearer '+(config.CRON_SECRET??''));
  const actual=Buffer.from(request.headers.get('authorization')??'');
  if(!config.CRON_SECRET||actual.length!==expected.length||!timingSafeEqual(actual,expected)){
    return Response.json({error:'Não autorizado.'},{status:401,headers:{'Cache-Control':'no-store'}});
  }
  const calendar=await syncGoogleCalendar();
  await sweepPendingMedia();
  const media=await drainMediaCleanup();
  await pool.query('DELETE FROM auth_rate_limits WHERE reset_at<now()');
  await pool.query('DELETE FROM google_oauth_states WHERE expires_at<now()');
  return Response.json({calendar,media},{headers:{'Cache-Control':'no-store'}});
}
