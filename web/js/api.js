// 2단계 임시: 서버 없이 브라우저 localStorage로 흉내 낸다. 3단계에서 실제 API 호출로 바꾼다.
import { validateRecord } from './rules.js';

const read = () => { try { return JSON.parse(localStorage.getItem('ps-mock') || '{}'); } catch { return {}; } };
const write = db => { try { localStorage.setItem('ps-mock', JSON.stringify(db)); } catch { /* 저장 못 해도 플레이는 된다 */ } };

export const api = {
  async guest() {
    return { user: { id: `g-${Date.now()}`, name: `게스트${String(Date.now()).slice(-4)}`, status: 'guest' } };
  },
  async signup(username, password) {
    const db = read();
    db.users ??= {};
    if (db.users[username]) throw new Error('이미 있는 아이디입니다');
    db.users[username] = password; // 임시 흉내라 그대로 둔다. 3단계 서버에서 해시로 저장
    write(db);
    return { user: { id: username, name: username, status: 'web' } };
  },
  async login(username, password) {
    if (read().users?.[username] !== password) throw new Error('아이디 또는 비밀번호가 틀립니다');
    return { user: { id: username, name: username, status: 'web' } };
  },
  async submit(user, record) {
    const check = validateRecord(record);
    if (!check.ok) throw new Error(check.reason);
    const db = read();
    db.best ??= {};
    db.best[user.id] = Math.max(db.best[user.id] || 0, check.score);
    write(db);
    return { score: check.score, best: db.best[user.id] };
  },
};
