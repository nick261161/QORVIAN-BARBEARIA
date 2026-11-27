import { createHash } from 'node:crypto';
import type { Request,RequestHandler,Response,Router } from 'express';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { config } from '../../backend/src/config/env.js';
import { requireAuth,requireRole,requireTenant,verifySession,cookie } from '../../backend/src/middlewares/auth.middleware.js';
import { requireFeature } from '../../backend/src/middlewares/feature.middleware.js';
import { errors,HttpError } from '../../backend/src/middlewares/error.middleware.js';
import { authRoutes } from '../../backend/src/routes/auth.routes.js';
import { settingsRoutes } from '../../backend/src/routes/settings.routes.js';
import { servicesRoutes } from '../../backend/src/routes/services.routes.js';
import { productsRoutes } from '../../backend/src/routes/products.routes.js';
import { orderRoutes } from '../../backend/src/routes/cart-orders.routes.js';
import { professionalRoutes } from '../../backend/src/routes/professionals.routes.js';
import { appointmentRoutes } from '../../backend/src/routes/appointments.routes.js';
import { loyaltyRoutes } from '../../backend/src/routes/loyalty.routes.js';
import { clientRoutes } from '../../backend/src/routes/clients.routes.js';
import { reportRoutes } from '../../backend/src/routes/reports.routes.js';
import { one,pool,transaction } from './db.js';
import { imageLimit,queueRetiredMedia,uploadWebPBuffer,type Profile } from './storage.js';
import { scopedTenant } from '../../backend/src/services/tenant.service.js';

type Context=Request & {nextRequest:NextRequest};
type Route={method:string;segments:string[];handlers:RequestHandler[]};
const routes:Route[]=[];
const split=(path:string)=>path.split('/').filter(Boolean);
function group(base:string,guards:RequestHandler[]=[]){
  const middleware:{path:string;handlers:RequestHandler[]}[]=[];
  function add(method:string){
    return (path:string,...handlers:RequestHandler[])=>routes.push({method,segments:split(base+path),
      handlers:[...guards,...middleware.filter(layer=>path===layer.path||path.startsWith(layer.path+'/')).flatMap(layer=>layer.handlers),...handlers]});
  }
  return {get:add('GET'),post:add('POST'),put:add('PUT'),patch:add('PATCH'),delete:add('DELETE'),
    use:(path:string,...handlers:RequestHandler[])=>middleware.push({path,handlers})} as unknown as Router;
}
const api=group('');
const root=(role:'CLIENT'|'OWNER'|'STAFF',prefix:string)=>group('/'+prefix+'/:slug',[requireAuth,requireRole(role),requireTenant]);
const client=root('CLIENT','client');
const owner=root('OWNER','owner');
const staff=root('STAFF','staff');
const master=group('/master',[requireAuth,requireRole('SUPER_ADMIN')]);
const limitAuth:RequestHandler=async(request,_response,next)=>{
  const native=(request as Context).nextRequest;
  const ip=process.env.VERCEL==='1'?native.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim():'local';
  const key=createHash('sha256').update(ip??'unknown').digest('hex');
  const attempt=await one<{count:number}>(pool,`INSERT INTO auth_rate_limits(key,count,reset_at) VALUES($1,1,now()+interval '15 minutes')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_rate_limits.reset_at<=now() THEN 1 ELSE auth_rate_limits.count+1 END,
      reset_at=CASE WHEN auth_rate_limits.reset_at<=now() THEN EXCLUDED.reset_at ELSE auth_rate_limits.reset_at END RETURNING count`,[key]);
  if(attempt!.count>20)throw new HttpError(429,'Muitas tentativas. Aguarde antes de tentar novamente.');
  next();
};
api.get('/health',async(_request,response)=>{await pool.query('SELECT 1 FROM platform_settings WHERE id=true');response.json({status:'ok'});});
authRoutes(api,client,limitAuth);
settingsRoutes(owner,master,staff);
servicesRoutes(owner);
productsRoutes(owner);
orderRoutes(client,owner);
professionalRoutes(owner,staff);
appointmentRoutes(api,client,owner,staff);
loyaltyRoutes(client,owner);
clientRoutes(owner);
reportRoutes(owner,staff);

function upload(defaultProfile:Profile):RequestHandler {
  return async (request,response)=>{
    const native=(request as Context).nextRequest;
    if(!native.headers.get('content-type')?.startsWith('multipart/form-data;'))throw new HttpError(415,'Envie uma imagem em multipart/form-data.');
    if(Number(native.headers.get('content-length'))>imageLimit+8192)throw new HttpError(413,'Envie uma imagem de até 4 MB.');
    const raw=await readBody(native,imageLimit+8192);
    const form=await new RequestShim(native,raw).form();
    const file=form.get('image');
    if(!(file instanceof File)||form.getAll('image').length!==1)throw new HttpError(400,'Selecione uma imagem.');
    const profile=z.enum(['catalog','avatar','banner']).parse(form.get('profile')??defaultProfile);
    const actor=request.identity!;
    if(actor.role==='STAFF'&&profile!=='avatar')throw new HttpError(403,'A equipe pode enviar somente a própria foto.');
    if(profile==='banner'&&!request.scope!.flags.enable_site_customizer)throw new HttpError(403,'Editor da vitrine indisponível.');
    response.status(201).json(await uploadWebPBuffer({tenant:request.scope!.tenant.id,actor:actor.actor.id,file:Buffer.from(await file.arrayBuffer()),mime:file.type,profile}));
  };
}
class RequestShim {
  constructor(private native:NextRequest,private bytes:Uint8Array<ArrayBuffer>){}
  async form(){
    try{return await new globalThis.Request(this.native.url,{method:'POST',headers:this.native.headers,body:this.bytes}).formData();}
    catch{throw new HttpError(400,'Imagem ou formulário inválido.');}
  }
}
owner.post('/media',requireFeature('enable_site_customizer'),upload('banner'));
owner.post('/media/catalog',upload('catalog'));
staff.post('/media',upload('avatar'));

const scopedEndpoints=new Set(['categories','services','products','professionals','loyalty','orders','settings','clients','reports','upload']);
async function routeParts(native:NextRequest,parts:string[]){
  const [resource,action]=parts;
  const requestedSlug=native.nextUrl.searchParams.get('slug');
  if(resource==='auth'&&action==='me')return ['auth','session'];
  if(resource==='auth'&&action==='login'&&requestedSlug&&parts.length===2)return ['auth',requestedSlug,'login'];
  if(resource==='auth'&&action==='register'&&parts.length===2)return ['auth',requestedSlug??process.env.DEFAULT_TENANT_SLUG??'navalha-e-cia','register'];
  if(resource==='appointments'){
    if(action==='slots')return ['public',requestedSlug??process.env.DEFAULT_TENANT_SLUG??'navalha-e-cia','available-slots'];
    if(native.method==='POST'&&!action)return parts;
  }else if(!scopedEndpoints.has(resource))return parts;
  const identity=await verifySession(native.cookies.get(cookie)?.value);
  if(!identity.tenant)throw new HttpError(403,'Selecione um estabelecimento.');
  const prefix=({OWNER:'owner',STAFF:'staff',CLIENT:'client',SUPER_ADMIN:'master'} as const)[identity.role];
  const slug=requestedSlug??identity.tenant.slug;
  if(resource==='categories'&&prefix!=='owner')throw new HttpError(403,'Apenas o empresário gerencia categorias.');
  if(resource==='upload'){
    if(prefix==='client')throw new HttpError(403,'Você não pode enviar imagens.');
    return [prefix,slug,'media',...(prefix==='owner'?['catalog']:[])];
  }
  if(resource==='settings'){
    if(prefix!=='owner')throw new HttpError(403,'Você não pode editar a configuração.');
    if(action){
      if(!['site','confirmation','policy','hours','blocks'].includes(action))throw new HttpError(404,'Configuração não encontrada.');
      return [prefix,slug,...parts.slice(1)];
    }
    return [prefix,slug,...(native.method==='GET'?[]:['site'])];
  }
  if(prefix==='staff'&&!['appointments','reports','professionals'].includes(resource))throw new HttpError(403,'Você não tem acesso a esta área.');
  if(prefix==='staff'&&resource==='professionals'){
    if(action!=='me')throw new HttpError(403,'Você tem acesso somente ao próprio perfil.');
    return [prefix,slug,'profile'];
  }
  if(resource==='appointments')return [prefix,slug,prefix==='client'?'appointments':'agenda',...parts.slice(1)];
  return [prefix,slug,...parts];
}

function checkOrigin(native:NextRequest){
  if(['GET','HEAD','OPTIONS'].includes(native.method))return;
  const site=native.headers.get('sec-fetch-site');
  const origin=native.headers.get('origin');
  const host=native.headers.get('host')??'';
  const local=!config.secure&&/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)&&origin===`http://${host}`;
  if(site==='cross-site'||(origin&&!local&&!config.origins.has(origin))||(!origin&&native.cookies.has(cookie)&&site!=='same-origin'))
    throw new HttpError(403,'Origem da requisição inválida.');
}

async function readBody(native:NextRequest,limit:number){
  const reader=native.body?.getReader();
  const chunks:Uint8Array[]=[];
  let size=0;
  if(reader)try{
    for(;;){
      const item=await reader.read();
      if(item.done)break;
      size+=item.value.byteLength;
      if(size>limit){await reader.cancel();throw new HttpError(413,'Corpo da requisição acima do limite.');}
      chunks.push(item.value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);
  let position=0;
  for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
  return bytes;
}

export async function handle(native:NextRequest){
  let code=200;
  let result:unknown;
  let complete=false;
  const headers=new Headers({'Cache-Control':'no-store'});
  type CookieOptions={path:string;httpOnly:boolean;secure:boolean;sameSite:'lax';maxAge:number};
  function setCookie(key:string,value:string,options:CookieOptions){
    const holder=new NextResponse();
    holder.cookies.set(key,value,{...options,maxAge:options.maxAge/1000});
    headers.append('set-cookie',holder.headers.get('set-cookie')!);
  }
  const response={
    get headersSent(){return complete;},
    status(status:number){code=status;return this;},
    json(body:unknown){result=body;complete=true;return this;},
    end(){complete=true;return this;},
    cookie(key:string,value:string,options:CookieOptions){setCookie(key,value,options);return this;},
    clearCookie(key:string,options:CookieOptions){setCookie(key,'',{...options,maxAge:0});return this;},
  } as unknown as Response;
  const request={nextRequest:native,method:native.method,path:native.nextUrl.pathname,params:{},query:{},cookies:Object.fromEntries(native.cookies.getAll().map(({name,value})=>[name,value]))} as unknown as Context;
  try{
    checkOrigin(native);
    const parts=await routeParts(native,split(native.nextUrl.pathname).slice(1).map(part=>decodeURIComponent(part)));
    const route=routes.find(item=>item.method===native.method&&item.segments.length===parts.length&&item.segments.every((segment,i)=>segment.startsWith(':')||segment===parts[i]));
    if(!route){
      if(parts[0]==='staff')throw new HttpError(403,'Você não tem acesso a esta área.');
      throw new HttpError(404,'Rota não encontrada.');
    }
    request.params=Object.fromEntries(route.segments.flatMap((segment,i)=>segment.startsWith(':')?[[segment.slice(1),parts[i]]]:[]));
    request.query=Object.fromEntries(native.nextUrl.searchParams);
    if(scopedEndpoints.has(split(native.nextUrl.pathname)[1])||native.nextUrl.pathname==='/api/appointments/slots')delete request.query.slug;
    if(native.body&&native.headers.get('content-type')?.split(';')[0]==='application/json'){
      const data=new TextDecoder().decode(await readBody(native,80*1024));
      try{request.body=JSON.parse(data);}catch{throw new HttpError(400,'Corpo da requisição inválido.');}
    }
    for(const handler of route.handlers){
      let next=false;
      await handler(request,response,error=>{if(error)throw error;next=true;});
      if(!next||complete)break;
    }
  }catch(error){
    if(request.scope&&request.identity&&request.body&&['PUT','PATCH','POST'].includes(native.method)){
      await rollbackUploads(request).catch(()=>console.error('Falha ao registrar a limpeza de mídia.'));
    }
    errors(error,request,response,()=>{});
  }
  return result===undefined?new NextResponse(null,{status:code,headers}):NextResponse.json(result,{status:code,headers});
}

async function rollbackUploads(request:Context){
  const source=request.body as Record<string,unknown>;
  const backgrounds=typeof source.backgrounds==='object'&&source.backgrounds!==null?Object.values(source.backgrounds):[];
  const urls=[source.photo,source.logo,source.banner,source.favicon,...backgrounds,...(Array.isArray(source.slides)?source.slides:[])].filter((url):url is string=>typeof url==='string'&&url.startsWith('/media/'));
  if(!urls.length)return;
  const {tenant}=request.scope!;
  const {actor}=request.identity!;
  await transaction(async db=>{
    await scopedTenant(db,tenant.id,true,true);
    const own=(await db.query<{url:string}>(`SELECT '/media/'||image_key AS url FROM media_assets WHERE tenant_id=$1 AND uploaded_by=$2
      AND created_at>now()-interval '1 day' AND '/media/'||image_key=ANY($3::text[])`,[tenant.id,actor.id,urls])).rows;
    await queueRetiredMedia(db,tenant.id,own.map(item=>item.url));
  });
}
