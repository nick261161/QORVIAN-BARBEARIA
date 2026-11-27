import { app } from './app.js';
import { config } from './config/env.js';
import { pool } from './config/database.js';

if (config.secure) {
  const demo = await pool.query(`SELECT 1 FROM users WHERE active AND id IN ('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000012') LIMIT 1`);
  if (demo.rowCount) {
    await pool.end();
    throw new Error('As contas fixas do seed local estão ativas. Use um banco de produção independente.');
  }
}
const server = app.listen(config.PORT, config.HOST, () => console.log(`Agenda API em http://${config.HOST}:${config.PORT}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => void pool.end()));
