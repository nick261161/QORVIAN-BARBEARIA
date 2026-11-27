import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

if (process.env.NODE_ENV === 'production') throw new Error('Use um PostgreSQL administrado em produção.');
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://agenda:agenda_local@127.0.0.1:55432/agenda');
if (url.hostname !== '127.0.0.1') throw new Error('O banco auxiliar precisa usar 127.0.0.1.');
const databaseDir = resolve('.postgres-local');
const local = new EmbeddedPostgres({ databaseDir, port: Number(url.port || 55432), user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password), persistent: true, autoRehydrateSymlinks: true, authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {} });
if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await local.initialise();
await local.start();
const database = decodeURIComponent(url.pathname.slice(1));
const client = local.getPgClient();
const stop = async () => { await local.stop(); process.exit(0); };
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
try {
  await client.connect();
  if (!(await client.query('select 1 from pg_database where datname=$1', [database])).rowCount) await local.createDatabase(database);
  console.log(`PostgreSQL local disponível na porta ${url.port || 55432}.`);
} catch (error) { await local.stop(); throw error; }
finally { await client.end(); }
