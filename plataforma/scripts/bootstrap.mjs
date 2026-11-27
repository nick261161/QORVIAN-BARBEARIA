import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const name = process.env.ADMIN_NAME?.trim();
const phone = process.env.ADMIN_PHONE;
const password = process.env.ADMIN_PASSWORD;
if (!process.env.DATABASE_URL || !name || name.length < 2 || name.length > 100 || /[<>]/.test(name)
  || !/^\+55[1-9]\d{9,10}$/.test(phone ?? '') || !password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
  throw new Error('Defina DATABASE_URL, ADMIN_NAME, ADMIN_PHONE (+55 com DDD) e ADMIN_PASSWORD (mínimo 12 caracteres).');
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('LOCK TABLE agenda.users IN SHARE ROW EXCLUSIVE MODE');
  const result = await client.query("SELECT 1 FROM agenda.users WHERE role='SUPER_ADMIN' LIMIT 1");
  if (result.rowCount) throw new Error('A plataforma já tem um administrador.');
  await client.query("INSERT INTO agenda.users (role,name,phone,password_hash) VALUES ('SUPER_ADMIN',$1,$2,$3)", [name, phone, await bcrypt.hash(password, 12)]);
  await client.query('COMMIT');
  console.log('Administrador inicial criado.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { await client.end(); }
