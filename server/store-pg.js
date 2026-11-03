// Postgres(Supabase) 저장소. store-memory.js와 함수 이름·모양이 같다
import pg from 'pg';

const toUser = r => r && {
  id: Number(r.id), status: r.status, username: r.username, passwordHash: r.password_hash,
  googleSub: r.google_sub, name: r.name, progress: r.progress ?? {}, createdAt: r.created_at,
};
const COLUMNS = { status: 'status', username: 'username', passwordHash: 'password_hash', googleSub: 'google_sub', name: 'name', progress: 'progress' };

export function createPgStore(connectionString) {
  // ponytail: 인증서 검증을 끈다. Supabase 루트 인증서를 넣으면 rejectUnauthorized: true로 올릴 수 있다
  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 5 });
  const one = async (sql, params) => toUser((await pool.query(sql, params)).rows[0]);

  // 바꿀 칸만 골라 SQL을 만든다. 칸 이름은 COLUMNS에 있는 것만 쓰고 값은 $1, $2로 넘긴다
  function columnsOf(fields) {
    const keys = Object.keys(fields).filter(k => COLUMNS[k]);
    // jsonb 칸(progress)은 문자열로 바꿔 넘긴다. 배열이 Postgres 배열로 바뀌지 않게
    return { names: keys.map(k => COLUMNS[k]), values: keys.map(k => (k === 'progress' ? JSON.stringify(fields[k]) : fields[k])) };
  }

  return {
    pool,
    async createUser(fields) {
      const { names, values } = columnsOf(fields);
      const marks = values.map((_, i) => `$${i + 1}`);
      return one(`insert into users (${names.join(', ')}) values (${marks.join(', ')}) returning *`, values);
    },
    findUserById: id => one('select * from users where id = $1', [id]),
    findUserByUsername: username => one('select * from users where username = $1', [username]),
    findUserByGoogle: sub => one('select * from users where google_sub = $1', [sub]),
    async updateUser(id, patch) {
      const { names, values } = columnsOf(patch);
      const sets = names.map((n, i) => `${n} = $${i + 2}`);
      return one(`update users set ${sets.join(', ')} where id = $1 returning *`, [id, ...values]);
    },
    async addRecord({ userId, time, kills, score, valid, hero, boss, bossKilled }) {
      await pool.query('insert into records (user_id, time, kills, score, valid, hero, boss, boss_killed) values ($1, $2, $3, $4, $5, $6, $7, $8)',
        [userId, time, JSON.stringify(kills), score, valid, hero, boss, bossKilled]);
    },
    async bestScore(userId) {
      const { rows } = await pool.query('select coalesce(max(score), 0) as best from records where user_id = $1 and valid', [userId]);
      return Number(rows[0].best);
    },
  };
}
