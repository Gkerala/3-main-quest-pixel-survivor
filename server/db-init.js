// schema.sql을 DB에 실행한다. 실행: npm run db:init
import { readFileSync } from 'node:fs';
import { createPgStore } from './store-pg.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다');
  process.exit(1);
}
const { pool } = createPgStore(process.env.DATABASE_URL);
await pool.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const { rows } = await pool.query(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('users', 'records') order by 1`);
console.log('표 준비 완료:', rows.map(r => `${r.relname}(RLS ${r.relrowsecurity ? '켜짐' : '꺼짐'})`).join(', '));
await pool.end();
