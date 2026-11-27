import {createHash} from 'node:crypto';
import {one,pool,transaction,type Db} from '../lib/db.js';
import {decryptToken} from '../lib/crypto.js';
import {googleClient,googleSettings} from '../lib/google-oauth.js';

export async function queueCalendarSync(db:Db,tenant:string,appointment:string){
  await db.query(`INSERT INTO google_calendar_jobs(appointment_id,tenant_id)
    SELECT a.id,a.tenant_id FROM appointments a JOIN professionals p ON p.tenant_id=a.tenant_id AND p.id=a.professional_id
    WHERE a.tenant_id=$1 AND a.id=$2 AND p.google_refresh_token IS NOT NULL
    ON CONFLICT(appointment_id) DO UPDATE SET revision=google_calendar_jobs.revision+1,due_at=now(),attempts=0`,[tenant,appointment]);
}
type EventData={id:string;summary:string;description:string;start:{dateTime:string;timeZone:string};end:{dateTime:string;timeZone:string};
  visibility:'private';reminders:{useDefault:false;overrides:{method:'popup';minutes:number}[]}};
type Job={appointment_id:string;tenant_id:string;professional_id:string;revision:string;claim_id:string;active:boolean;status:string;starts_at:Date;ends_at:Date;
  timezone:string;client_name:string;client_phone:string;total_cents:number;line_items:{name:string}[];google_refresh_token:string|null;
  google_subject:string|null;google_connection_id:string|null;google_event_id:string|null;google_event_subject:string|null};
type Delivery=(job:Job,event:EventData)=>Promise<string|null>;
export function googleEvent(job:Job):EventData{
  const services=job.line_items.map(line=>line.name).join(' + ');
  const total=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(job.total_cents/100);
  return {id:createHash('sha256').update(job.appointment_id).digest('hex'),summary:`[Agendamento] ${services} - ${job.client_name}`,
    description:`Cliente: ${job.client_name}\nWhatsApp: ${job.client_phone}\nServiços: ${services}\nValor: ${total}`,
    start:{dateTime:job.starts_at.toISOString(),timeZone:job.timezone},end:{dateTime:job.ends_at.toISOString(),timeZone:job.timezone},
    visibility:'private',reminders:{useDefault:false,overrides:[{method:'popup',minutes:60},{method:'popup',minutes:15}]}};
}
function httpCode(error:unknown){
  const response=(error as {response?:{status?:number}}|null)?.response;
  return response?.status;
}
const deliver:Delivery=async(job,event)=>{
  const {calendar:createCalendar,oauth}=await googleClient();
  oauth.setCredentials({refresh_token:decryptToken(job.google_refresh_token!,`${job.tenant_id}:${job.professional_id}`)});
  const calendar=createCalendar({version:'v3',auth:oauth});
  const saved=job.google_event_subject===job.google_subject?job.google_event_id:null;
  const target={calendarId:'primary',eventId:saved??event.id};
  const options={timeout:7000,retry:false};
  if(job.status==='CANCELADO'){
    try{await calendar.events.delete(target,options);}catch(error){if(![404,410].includes(httpCode(error)??0))throw error;}
    return null;
  }
  const {id,...body}=event;
  if(saved){
    try{return (await calendar.events.patch({...target,requestBody:body},options)).data.id??saved;}
    catch(error){if(httpCode(error)!==404)throw error;}
  }
  try{return (await calendar.events.insert({calendarId:'primary',requestBody:event},options)).data.id??id;}
  catch(error){
    if(httpCode(error)!==409)throw error;
    return (await calendar.events.patch({...target,eventId:id,requestBody:body},options)).data.id??id;
  }
};

export async function syncGoogleCalendar(delivery?:Delivery){
  if(!delivery&&!googleSettings())return {processed:0};
  const jobs=await transaction(async db=>(await db.query<Job>(`WITH due AS (
    SELECT appointment_id FROM google_calendar_jobs WHERE due_at<=now() AND attempts<8
      AND (locked_until IS NULL OR locked_until<=now()) ORDER BY due_at LIMIT 10 FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE google_calendar_jobs j SET locked_until=now()+interval '2 minutes',attempts=attempts+1,claim_id=gen_random_uuid() FROM due
    WHERE j.appointment_id=due.appointment_id RETURNING j.*
  )
  SELECT j.*,a.professional_id,a.status,a.starts_at,a.ends_at,a.client_name,a.client_phone,a.total_cents,a.line_items,a.google_event_id,a.google_event_subject,
    p.google_refresh_token,p.google_subject,p.google_connection_id,t.timezone,
    (t.status='ATIVO' AND p.active AND p.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM users u WHERE u.tenant_id=p.tenant_id AND u.professional_id=p.id AND u.role='STAFF' AND u.active)
      AND coalesce(t.feature_flags->>'enable_google_calendar',s.feature_flags->>'enable_google_calendar','false')='true') AS active
  FROM claimed j JOIN appointments a ON a.tenant_id=j.tenant_id AND a.id=j.appointment_id
  JOIN professionals p ON p.tenant_id=a.tenant_id AND p.id=a.professional_id
  JOIN tenants t ON t.id=a.tenant_id CROSS JOIN platform_settings s WHERE s.id=true`)).rows);
  await Promise.all(jobs.map(async job=>{
    try{
      const eligible=job.active&&job.google_refresh_token&&job.google_subject;
      const eventId=eligible?await (delivery??deliver)(job,googleEvent(job)):undefined;
      await transaction(async db=>{
        await db.query('SELECT id FROM appointments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[job.tenant_id,job.appointment_id]);
        if(!(await one(db,'SELECT appointment_id FROM google_calendar_jobs WHERE appointment_id=$1 AND claim_id=$2 FOR UPDATE',[job.appointment_id,job.claim_id])))return;
        if(eventId!==undefined)await db.query(`UPDATE appointments a SET google_event_id=$3,google_event_subject=CASE WHEN $3::text IS NULL THEN NULL ELSE $4 END
          WHERE a.tenant_id=$1 AND a.id=$2 AND EXISTS(SELECT 1 FROM professionals p WHERE p.tenant_id=a.tenant_id AND p.id=a.professional_id AND p.google_connection_id=$5)`,
          [job.tenant_id,job.appointment_id,eventId,job.google_subject,job.google_connection_id]);
        await db.query('DELETE FROM google_calendar_jobs WHERE appointment_id=$1 AND revision=$2',[job.appointment_id,job.revision]);
        await db.query('UPDATE google_calendar_jobs SET locked_until=NULL,claim_id=NULL WHERE appointment_id=$1 AND revision<>$2',[job.appointment_id,job.revision]);
      });
    }catch{
      await pool.query(`UPDATE google_calendar_jobs SET locked_until=NULL,claim_id=NULL,
        due_at=CASE WHEN revision=$2 THEN now()+interval '5 minutes' ELSE due_at END WHERE appointment_id=$1 AND claim_id=$3`,
        [job.appointment_id,job.revision,job.claim_id]);
    }
  }));
  return {processed:jobs.length};
}
