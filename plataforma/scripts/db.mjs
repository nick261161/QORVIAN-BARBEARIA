import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const operation = process.argv[2];
const databaseUrl=operation==='migrate'?process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL:process.env.DATABASE_URL;
if (!databaseUrl || (operation !== 'migrate' && operation !== 'seed')) throw new Error('Defina DATABASE_URL e escolha migrate ou seed.');
if (operation === 'seed' && (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) {
  throw new Error('O seed com credenciais públicas é exclusivo de um banco local de desenvolvimento.');
}
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(await readFile(operation === 'migrate' ? 'database/schema.sql' : 'database/seed.sql', 'utf8'));
  console.log(operation === 'migrate' ? 'Estrutura aplicada.' : 'Dados locais de demonstração disponíveis.');
} finally { await client.end(); }
