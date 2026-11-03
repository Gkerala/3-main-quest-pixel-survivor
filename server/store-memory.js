// 메모리 저장소. 서버를 껐다 켜면 사라진다. 테스트와 3단계용이고, 4단계에서 같은 함수로 DB 저장소를 만든다.
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
    async findUserByGoogle(sub) { return copy([...users.values()].find(u => u.googleSub === sub)); },
    async updateUser(id, patch) {
      const user = { ...users.get(id), ...patch };
      users.set(id, user);
      return copy(user);
    },
    async addRecord(record) {
      records.push({ ...record, createdAt: new Date().toISOString() });
    },
    async bestScore(userId) {
      return records.filter(r => r.userId === userId && r.valid).reduce((best, r) => Math.max(best, r.score), 0);
    },
  };
}
