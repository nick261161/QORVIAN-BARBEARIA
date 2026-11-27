import type {Auth} from 'googleapis';
import {oauthKey} from './crypto.js';
import {HttpError} from '../../backend/src/middlewares/error.middleware.js';

export const calendarScope='https://www.googleapis.com/auth/calendar.events.owned';

export function googleSettings(){
  const {GOOGLE_CLIENT_ID:id,GOOGLE_CLIENT_SECRET:secret,GOOGLE_REDIRECT_URI:redirect}=process.env;
  if(!id||!secret||!redirect)return null;
  try{
    oauthKey();
    const uri=new URL(redirect);
    const local=uri.protocol==='http:'&&['localhost','127.0.0.1'].includes(uri.hostname);
    if((uri.protocol!=='https:'&&!local)||uri.pathname!=='/api/google-calendar/callback'||uri.search||uri.hash||uri.username||uri.password)return null;
    return {id,secret,uri};
  }catch{return null;}
}

export async function googleClient(){
  const settings=googleSettings();
  if(!settings)throw new HttpError(503,'A integração Google Agenda ainda não foi configurada.');
  // Load only the generated Calendar client so other Google APIs stay out of serverless bundles.
  const {calendar,auth}=await import('googleapis/build/src/apis/calendar/index.js');
  return {calendar,oauth:new auth.OAuth2(settings.id,settings.secret,settings.uri.href),settings,challengeMethod:'S256' as Auth.CodeChallengeMethod.S256};
}
