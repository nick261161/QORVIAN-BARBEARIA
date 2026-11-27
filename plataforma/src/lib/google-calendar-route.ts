import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {after,type NextRequest} from 'next/server';
import {cookie,verifySession} from './auth.js';
import {one,pool,transaction} from './db.js';
import {encryptToken} from './crypto.js';
import {calendarScope,googleClient,googleSettings} from './google-oauth.js';
import {syncGoogleCalendar} from '../services/google-calendar.service.js';
import {assertFeature,scopedTenant} from '../../backend/src/services/tenant.service.js';
import {HttpError} from '../../backend/src/middlewares/error.middleware.js';
import {config} from '../../backend/src/config/env.js';

const digest=(value:string)=>createHash('sha256').update(value).digest('base64url');
async function staff(request:NextRequest){
  const {actor,role,tenant}=await verifySession(request.cookies.get(cookie)?.value);
  if(role!=='STAFF'||!tenant||!actor.professional_id)throw new HttpError(403,'Apenas o funcionário pode conectar a própria agenda.');
  return {actor,tenant,person:actor.professional_id};
}
function verifyOrigin(request:NextRequest){
  const origin=request.headers.get('origin');
  const host=request.headers.get('host')??'';
  const local=!config.secure&&/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)&&origin===`http://${host}`;
  if(!origin||request.headers.get('sec-fetch-site')==='cross-site'||(!local&&!config.origins.has(origin)))
    throw new HttpError(403,'Origem da requisição inválida.');
}
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
function failure(error:unknown){return error instanceof HttpError?json({error:error.message},error.status):json({error:'Não foi possível acessar a integração.'},500);}

export async function status(request:NextRequest){
  try{
    const {tenant,person}=await staff(request);
    const scope=await scopedTenant(pool,tenant.id);
    const row=await one<{google_email:string|null}>(pool,'SELECT google_email FROM professionals WHERE tenant_id=$1 AND id=$2',[tenant.id,person]);
    return json({email:row?.google_email??null,enabled:scope.flags.enable_google_calendar,configured:Boolean(googleSettings())});
  }catch(error){return failure(error);}
}
export async function connect(request:NextRequest){
  try{
    verifyOrigin(request);
    const {tenant,person,actor}=await staff(request);
    assertFeature((await scopedTenant(pool,tenant.id)).flags,'enable_google_calendar');
    const {oauth,settings,challengeMethod}=await googleClient();
    if(settings.uri.origin!==request.headers.get('origin'))throw new HttpError(400,'Abra o painel pela origem configurada para o Google Agenda.');
    const state=randomBytes(32).toString('base64url');
    const verifier=randomBytes(48).toString('base64url');
    await pool.query(`INSERT INTO google_oauth_states(state_hash,tenant_id,professional_id,user_id,verifier,expires_at)
      VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')`,[digest(state),tenant.id,person,actor.id,verifier]);
    return json({url:oauth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['openid','email',calendarScope],
      state,code_challenge:digest(verifier),code_challenge_method:challengeMethod})});
  }catch(error){return failure(error);}
}
export async function callback(request:NextRequest){
  const settings=googleSettings();
  if(!settings)return failure(new HttpError(503,'O Google Agenda ainda não foi configurado.'));
  const profile=new URL('/admin/meu-perfil',settings.uri.origin);
  function done(result:string){
    profile.searchParams.set('google',result);
    return new Response(null,{status:303,headers:{Location:profile.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  try{
    const {tenant,person,actor}=await staff(request);
    const state=request.nextUrl.searchParams.get('state')??'';
    const code=request.nextUrl.searchParams.get('code')??'';
    if(!/^[a-zA-Z0-9_-]{43}$/.test(state))return done('erro');
    const row=await one<{verifier:string}>(pool,`DELETE FROM google_oauth_states
      WHERE state_hash=$1 AND tenant_id=$2 AND professional_id=$3 AND user_id=$4 AND expires_at>now() RETURNING verifier`,
    [digest(state),tenant.id,person,actor.id]);
    if(!row)return done('erro');
    if(request.nextUrl.searchParams.get('error'))return done('cancelado');
    if(!code||code.length>4096)return done('erro');
    const {oauth}=await googleClient();
    const {tokens}=await oauth.getToken({code,codeVerifier:row.verifier});
    if(!tokens.refresh_token||!tokens.id_token||!tokens.scope?.split(' ').includes(calendarScope))return done('erro');
    const identity=(await oauth.verifyIdToken({idToken:tokens.id_token,audience:settings.id})).getPayload();
    if(!identity?.email||!identity.email_verified||!identity.sub)return done('erro');
    const encrypted=encryptToken(tokens.refresh_token,`${tenant.id}:${person}`);
    await transaction(async db=>{
      assertFeature((await scopedTenant(db,tenant.id,true)).flags,'enable_google_calendar');
      const saved=await one(db,`UPDATE professionals p SET google_refresh_token=$3,google_email=$4,google_subject=$5,google_connection_id=$6
        WHERE p.tenant_id=$1 AND p.id=$2 AND p.active AND p.deleted_at IS NULL AND EXISTS(
          SELECT 1 FROM users u WHERE u.id=$7 AND u.tenant_id=p.tenant_id AND u.professional_id=p.id AND u.role='STAFF' AND u.active AND u.token_version=$8)
        RETURNING p.id`,[tenant.id,person,encrypted,identity.email,identity.sub,randomUUID(),actor.id,actor.token_version]);
      if(!saved)throw new HttpError(403,'A conta de funcionário não está ativa.');
      await db.query(`INSERT INTO google_calendar_jobs(appointment_id,tenant_id) SELECT id,tenant_id FROM appointments
        WHERE tenant_id=$1 AND professional_id=$2 AND starts_at>now() AND status IN ('PENDENTE','CONFIRMADO')
        ON CONFLICT(appointment_id) DO UPDATE SET revision=google_calendar_jobs.revision+1,attempts=0,due_at=now()`,[tenant.id,person]);
    });
    after(async()=>{await syncGoogleCalendar().catch(()=>console.error('Falha na fila Google Agenda.'));});
    return done('conectado');
  }catch{return done('erro');}
}
export async function disconnect(request:NextRequest){
  try{
    verifyOrigin(request);
    const {tenant,person,actor}=await staff(request);
    await transaction(async db=>{
      await scopedTenant(db,tenant.id,true);
      const updated=await one(db,`UPDATE professionals p SET google_refresh_token=NULL,google_email=NULL,google_subject=NULL,google_connection_id=NULL
        WHERE p.tenant_id=$1 AND p.id=$2 AND EXISTS(SELECT 1 FROM users u WHERE u.id=$3 AND u.professional_id=p.id AND u.tenant_id=p.tenant_id AND u.active AND u.token_version=$4)
        RETURNING p.id`,[tenant.id,person,actor.id,actor.token_version]);
      if(!updated)throw new HttpError(403,'Conta de funcionário indisponível.');
      await db.query(`DELETE FROM google_calendar_jobs j USING appointments a
        WHERE j.appointment_id=a.id AND a.tenant_id=$1 AND a.professional_id=$2`,[tenant.id,person]);
      await db.query('DELETE FROM google_oauth_states WHERE user_id=$1',[actor.id]);
    });
    return json({disconnected:true});
  }catch(error){return failure(error);}
}
