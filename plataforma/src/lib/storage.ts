import { randomUUID } from 'node:crypto';
import { mkdir,readFile,unlink,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DeleteObjectCommand,GetObjectCommand,PutObjectCommand,S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { config } from '../../backend/src/config/env.js';
import { scopedTenant } from '../../backend/src/services/tenant.service.js';
import { HttpError,sqlCode } from '../../backend/src/middlewares/error.middleware.js';
import { one,pool,transaction,type Db } from './db.js';

export const imageLimit=4*1024*1024;
export type Profile='catalog'|'avatar'|'banner';
type Asset={id:string;tenant_id:string;image_key:string;driver:'local'|'s3';uploaded_by:string|null;profile:Profile};
const directory=resolve(config.MEDIA_DIR);
const immutable='public, max-age=31536000, immutable';
const localPattern=/^(?:\/media\/)([a-f0-9-]{36})\/([a-f0-9-]{36})\.webp$/i;
const mime=new Set(['image/jpeg','image/png','image/webp','image/avif']);
const formats=new Set(['jpeg','png','webp','heif']);
const urlFor=(key:string)=>`/media/${key}`;
let client:S3Client|undefined;
function s3(){
  if(!config.S3_BUCKET)throw new HttpError(503,'Armazenamento de mídia indisponível.');
  return client??=new S3Client({region:config.S3_REGION,endpoint:config.S3_ENDPOINT,forcePathStyle:Boolean(config.S3_ENDPOINT),maxAttempts:2});
}

export async function uploadWebPBuffer(input:{tenant:string;actor:string;file:Buffer;mime:string;profile:Profile}){
  if(input.file.length>imageLimit)throw new HttpError(413,'Envie uma imagem de até 4 MB.');
  if(!mime.has(input.mime))throw new HttpError(415,'Envie JPEG, PNG, WebP ou AVIF.');
  const max=input.profile==='banner'?1920:800;
  const target=input.profile==='banner'?350*1024:150*1024;
  let bytes:Buffer;
  try{
    const pipeline=sharp(input.file,{limitInputPixels:24000000,failOn:'error'});
    const metadata=await pipeline.metadata();
    if(!metadata.format||!formats.has(metadata.format)||(metadata.pages??1)>1)throw new Error('Formato inválido');
    const image=pipeline.rotate().resize({width:max,height:max,fit:'inside',withoutEnlargement:true});
    bytes=await image.clone().webp({quality:80}).toBuffer();
    for(const quality of [72,64,56]){
      if(bytes.length<=target)break;
      bytes=await image.clone().webp({quality}).toBuffer();
    }
    if(bytes.length>target)throw new Error('Arquivo acima da meta');
  }catch{throw new HttpError(415,'A imagem está inválida ou não pôde ser otimizada.');}
  const id=randomUUID();const key=`${input.tenant}/${id}.webp`;
  const row:Asset={id,tenant_id:input.tenant,image_key:key,driver:config.MEDIA_DRIVER,uploaded_by:input.actor,profile:input.profile};
  if(row.driver==='s3')await s3().send(new PutObjectCommand({Bucket:config.S3_BUCKET,Key:key,Body:bytes,ContentType:'image/webp',CacheControl:immutable}));
  else{await mkdir(resolve(directory,input.tenant),{recursive:true});await writeFile(resolve(directory,key),bytes,{flag:'wx'});}
  try{await pool.query('INSERT INTO media_assets(id,tenant_id,image_key,driver,uploaded_by,profile) VALUES($1,$2,$3,$4,$5,$6)',[id,input.tenant,key,row.driver,input.actor,input.profile]);}
  catch(error){try{await deleteStorageObject(row);}catch{console.error('Falha ao reverter gravação de mídia');}throw error;}
  return {url:urlFor(key),storage_key:key,bytes:bytes.length};
}

export async function deleteStorageObject(row:Pick<Asset,'driver'|'image_key'>){
  if(row.driver==='s3')await s3().send(new DeleteObjectCommand({Bucket:config.S3_BUCKET,Key:row.image_key}));
  else await unlink(resolve(directory,row.image_key)).catch(error=>{if(sqlCode(error)!=='ENOENT')throw error;});
}

export async function readMedia(tenant:string,file:string){
  const url=`/media/${tenant}/${file}`;const match=localPattern.exec(url);
  if(!match)throw new HttpError(404,'Imagem não encontrada.');
  const row=await one<Asset>(pool,'SELECT * FROM media_assets WHERE tenant_id=$1 AND id=$2 AND retired_at IS NULL',[tenant,match[2]]);
  if(!row)throw new HttpError(404,'Imagem não encontrada.');
  const content=row.driver==='s3'?(await s3().send(new GetObjectCommand({Bucket:config.S3_BUCKET,Key:row.image_key}))).Body:await readFile(resolve(directory,row.image_key));
  if(!content)throw new HttpError(404,'Imagem não encontrada.');
  return {bytes:Buffer.isBuffer(content)?content:Buffer.from(await content.transformToByteArray()),cache:immutable};
}

export async function assertMediaUrl(db:Db,tenant:string,url:string,staffActor?:string){
  if(!url.startsWith('/media/')&&!staffActor)return;
  const match=localPattern.exec(url);
  const found=match?.[1]===tenant&&await one(db,`SELECT id FROM media_assets WHERE tenant_id=$1 AND id=$2 AND retired_at IS NULL
    AND ($3::uuid IS NULL OR (uploaded_by=$3 AND profile='avatar'))`,[tenant,match[2],staffActor??null]);
  if(!found)throw new HttpError(400,'Selecione uma imagem deste estabelecimento.');
}

export async function queueRetiredMedia(db:Db,tenant:string,urls:string[]){
  const ids=[...new Set(urls.flatMap(url=>{const matches=localPattern.exec(url);return matches?.[1]===tenant?[matches[2]]:[];}))];
  if(!ids.length)return;
  await db.query(`WITH retired AS (UPDATE media_assets m SET retired_at=now() WHERE m.tenant_id=$1 AND m.id=ANY($2::uuid[]) AND m.retired_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM products p WHERE p.tenant_id=$1 AND p.deleted_at IS NULL AND p.photo='/media/'||m.image_key)
    AND NOT EXISTS (SELECT 1 FROM services s WHERE s.tenant_id=$1 AND s.deleted_at IS NULL AND s.photo='/media/'||m.image_key)
    AND NOT EXISTS (SELECT 1 FROM professionals p WHERE p.tenant_id=$1 AND p.deleted_at IS NULL AND p.photo='/media/'||m.image_key)
    AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id=$1 AND ('/media/'||m.image_key IN (t.site_settings->>'logo',t.site_settings->>'banner',t.site_settings->>'favicon')
      OR EXISTS (SELECT 1 FROM jsonb_each_text(coalesce(t.site_settings->'backgrounds','{}')) AS b WHERE b.value='/media/'||m.image_key))) RETURNING id)
    INSERT INTO media_cleanup(asset_id) SELECT id FROM retired ON CONFLICT DO NOTHING`,[tenant,ids]);
}

export async function sweepPendingMedia(){
  const rows=(await pool.query<Asset>(`SELECT m.* FROM media_assets m WHERE m.retired_at IS NULL AND m.created_at<now()-interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM products p WHERE p.tenant_id=m.tenant_id AND p.deleted_at IS NULL AND p.photo='/media/'||m.image_key)
    AND NOT EXISTS (SELECT 1 FROM services s WHERE s.tenant_id=m.tenant_id AND s.deleted_at IS NULL AND s.photo='/media/'||m.image_key)
    AND NOT EXISTS (SELECT 1 FROM professionals p WHERE p.tenant_id=m.tenant_id AND p.deleted_at IS NULL AND p.photo='/media/'||m.image_key)
    AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id=m.tenant_id AND ('/media/'||m.image_key IN (t.site_settings->>'logo',t.site_settings->>'banner',t.site_settings->>'favicon')
      OR EXISTS (SELECT 1 FROM jsonb_each_text(coalesce(t.site_settings->'backgrounds','{}')) AS b WHERE b.value='/media/'||m.image_key))) ORDER BY m.created_at LIMIT 24`)).rows;
  for(const row of rows)await transaction(async db=>{await scopedTenant(db,row.tenant_id,true,true);await queueRetiredMedia(db,row.tenant_id,[urlFor(row.image_key)]);});
}

export async function drainMediaCleanup(limit=10){
  const rows=await transaction(async db=>(await db.query<Asset>(`WITH due AS (SELECT asset_id FROM media_cleanup WHERE due_at<=now()
      AND (locked_until IS NULL OR locked_until<now()) ORDER BY due_at LIMIT $1 FOR UPDATE SKIP LOCKED), claimed AS
      (UPDATE media_cleanup m SET locked_until=now()+interval '2 minutes',attempts=attempts+1 FROM due WHERE m.asset_id=due.asset_id RETURNING m.asset_id)
    SELECT a.* FROM claimed JOIN media_assets a ON a.id=claimed.asset_id`,[limit])).rows);
  await Promise.all(rows.map(async row=>{
    try{await deleteStorageObject(row);await pool.query('DELETE FROM media_assets WHERE id=$1 AND retired_at IS NOT NULL',[row.id]);}
    catch{await pool.query("UPDATE media_cleanup SET locked_until=NULL,due_at=now()+interval '10 minutes',last_error='STORAGE_DELETE_FAILED' WHERE asset_id=$1",[row.id]);}
  }));
  return rows.length;
}
