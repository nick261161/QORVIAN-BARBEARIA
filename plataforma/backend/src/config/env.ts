import 'dotenv/config';
import { z } from 'zod';

const env = z.object({
  DATABASE_URL: z.url(), JWT_SECRET: z.string().min(32),
  DB_DRIVER:z.enum(['auto','pg','neon']).default('auto'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  APP_ORIGINS: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  MEDIA_DRIVER: z.enum(['local','s3']).default('local'), MEDIA_DIR:z.string().default('.media'),
  S3_BUCKET:z.string().optional(), S3_REGION:z.string().default('us-east-1'), S3_ENDPOINT:z.url().optional(),
  CRON_SECRET:z.preprocess(value=>value===''?undefined:value,z.string().min(16).optional()),
}).parse(process.env);

const origins = new Set(env.APP_ORIGINS.split(',').map(value => new URL(value.trim()).origin));
if (env.MEDIA_DRIVER==='s3'&&!env.S3_BUCKET) throw new Error('Defina S3_BUCKET para o armazenamento de imagens.');
if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
if (process.env.VERCEL_PROJECT_PRODUCTION_URL) origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
const secure=process.env.VERCEL==='1'||(env.NODE_ENV==='production'&&[...origins].some(origin=>origin.startsWith('https://')));
if(secure&&[...origins].some(origin=>!origin.startsWith('https://'))){
  throw new Error('APP_ORIGINS precisa usar HTTPS na implantação.');
}
if(process.env.VERCEL==='1'&&env.MEDIA_DRIVER!=='s3') throw new Error('Configure o armazenamento S3 para a implantação.');
export const config = { ...env, origins, secure };
