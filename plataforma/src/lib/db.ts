import pg, { type Pool as PgPool, type PoolClient,type QueryResultRow } from 'pg';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { config } from '../../backend/src/config/env.js';

const neon=config.DB_DRIVER==='neon'||(config.DB_DRIVER!=='pg'&&new URL(config.DATABASE_URL).hostname.endsWith('.neon.tech'));
const options={connectionString:config.DATABASE_URL,max:5,connectionTimeoutMillis:6000,idleTimeoutMillis:30000,allowExitOnIdle:true};
// Both drivers expose the PostgreSQL pool contract. SET LOCAL survives Neon transaction pooling.
const raw=neon?new NeonPool(options) as unknown as PgPool:new pg.Pool({...options,options:'-c search_path=agenda,extensions,pg_catalog'});
raw.on('error',error=>console.error('Conexão PostgreSQL interrompida',error.name));
export type Db=Pick<PoolClient,'query'>;

export async function transaction<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{
  const db=await raw.connect();let discard:Error|undefined;
  try{
    await db.query('BEGIN');
    if(neon)await db.query('SET LOCAL search_path TO agenda, extensions, pg_catalog');
    const result=await run(db);await db.query('COMMIT');return result;
  }catch(error){try{await db.query('ROLLBACK');}catch(failure){discard=failure instanceof Error?failure:new Error('Falha no rollback');}throw error;}
  finally{db.release(discard);}
}

export const pool={
  query: (neon?((sql:string,values?:unknown[])=>transaction(db=>db.query(sql,values))):raw.query.bind(raw)) as PgPool['query'],
  end:()=>raw.end(),
};
export async function one<T extends QueryResultRow>(db:Db,sql:string,values:unknown[]=[]){
  return (await db.query<T>(sql,values)).rows[0] as T|undefined;
}
