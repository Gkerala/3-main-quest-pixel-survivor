// 메모리 저장소. 서버를 껐다 켜면 사라진다. 테스트와 3단계용이고, 4단계에서 같은 함수로 DB 저장소를 만든다.
import { todayKST } from '../web/js/rules.js';

export function createMemoryStore() {
  const users = new Map();
  const records = [];
  let nextId = 1;
  const copy = u => (u ? { ...u } : null);

  return {
    async createUser(fields) {
      const user = { id: nextId++, username: null, passwordHash: null, googleSub: null, progress: {}, createdAt: new Date().toISOString(), ...fields };
      users.set(user.id, user);
      return copy(user);
    },
    async findUserById(id) { return copy(users.get(id)); },
    async findUserByUsername(username) { return copy([...users.values()].find(u => u.username === username)); },
    async findUserByNickname(nickname) { return copy([...users.values()].find(u => u.progress?.nickname === nickname)); },
    async findUserByGoogle(sub) { return copy([...users.values()].find(u => u.googleSub === sub)); },
    async updateUser(id, patch) {
      const user = { ...users.get(id), ...patch };
      users.set(id, user);
      return copy(user);
    },
    async addRecord(record) {
      records.push({ patternDate: todayKST(), ...record, createdAt: new Date().toISOString() });
    },
    // from~to 기간의 유저별 최고 점수. 순위 limit 안의 줄과 userId의 줄을 돌려준다
    async ranking({ from, to, limit, userId, excludeUsernames }) {
      const byUser = new Map();
      for (const r of records) {
        const u = users.get(r.userId);
        if (!r.valid || r.patternDate < from || r.patternDate > to || u.status === 'guest' || excludeUsernames.includes(u.username)) continue;
        const kills = Object.values(r.kills).reduce((a, b) => a + b, 0), row = byUser.get(r.userId);
        if (!row) byUser.set(r.userId, { userId: r.userId, username: u.username, nickname: u.progress?.nickname ?? null, score: r.score, kills, plays: 1, hero: r.hero });
        else byUser.set(r.userId, { ...row, score: Math.max(row.score, r.score), hero: r.score > row.score ? r.hero : row.hero, kills: row.kills + kills, plays: row.plays + 1 });
      }
      const sorted = [...byUser.values()].sort((a, b) => b.score - a.score || b.kills - a.kills || a.userId - b.userId);
      return sorted.map((r, i) => ({ ...r, rank: i + 1 })).filter(r => r.rank <= limit || r.userId === userId);
    },
    async bestScore(userId) {
      return records.filter(r => r.userId === userId && r.valid).reduce((best, r) => Math.max(best, r.score), 0);
    },
  };
}
