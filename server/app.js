// API 서버. 저장소(store)와 구글 확인 함수(verifyGoogle)는 밖에서 받아서 테스트 때 바꿔 끼운다.
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { validateRecord, addToProgress, HEROES, GROWTH } from '../web/js/rules.js';

const USERNAME = /^[a-zA-Z0-9_]{3,20}$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 72; // bcrypt가 72바이트까지만 본다
const TOKEN_LIFE = '30d';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// 화면에 보낼 유저 정보. 비밀번호 해시와 구글 고유번호는 보내지 않는다
const publicUser = u => ({
  id: u.id,
  name: u.username ?? (u.googleSub ? u.name : `게스트${u.id}`),
  status: u.status,
  progress: u.progress ?? {}, // 얻은 영웅, 영웅별 누적 점수, 도감
});

export function createApp({ store, jwtSecret, verifyGoogle, corsOrigins, adminUsernames = [] }) {
  if (!jwtSecret) throw new Error('JWT_SECRET이 필요합니다');
  const app = express();
  app.set('trust proxy', 1); // Render 프록시 한 겹 뒤의 실제 IP로 요청 횟수를 센다
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 60 }));

  const sign = user => jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: TOKEN_LIFE });
  // 관리자는 모든 영웅이 열려 있고 최소 2단계다. 저장하지 않고 보여 줄 때만 더해서, 목록에서 빼면 바로 원래대로 돌아간다
  const isAdmin = user => !!user.username && adminUsernames.includes(user.username);
  const withAdmin = (user, progress) => (isAdmin(user) ? {
    ...progress,
    heroes: HEROES.filter(h => h !== 'sprout'),
    scores: Object.fromEntries(HEROES.map(h => [h, Math.max(progress.scores?.[h] ?? 0, GROWTH[1])])),
  } : progress);
  const shownUser = user => publicUser({ ...user, progress: withAdmin(user, user.progress ?? {}) });
  const reply = async (res, user) => res.json({ token: sign(user), user: shownUser(user) });

  // Authorization: Bearer <토큰>이 있으면 그 유저, 없으면 null. 토큰이 틀리면 401
  async function currentUser(req) {
    const header = req.get('authorization');
    if (!header) return null;
    try {
      const { sub } = jwt.verify(header.replace(/^Bearer /, ''), jwtSecret);
      const user = await store.findUserById(sub);
      if (user) return user;
    } catch { /* 아래에서 401 */ }
    throw new HttpError(401, '다시 로그인해 주세요');
  }
  async function requireUser(req) {
    const user = await currentUser(req);
    if (!user) throw new HttpError(401, '로그인이 필요합니다');
    return user;
  }

  function readCredentials(body) {
    const { username, password } = body ?? {};
    if (typeof username !== 'string' || !USERNAME.test(username)) throw new HttpError(400, '아이디는 영문·숫자·_ 3~20자입니다');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      throw new HttpError(400, `비밀번호는 ${MIN_PASSWORD}~${MAX_PASSWORD}자입니다`);
    }
    return { username, password };
  }

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // 게스트 시작
  app.post('/api/guest', async (req, res) => {
    reply(res, await store.createUser({ status: 'guest' }));
  });

  // 회원가입. 게스트 토큰을 같이 보내면 그 게스트 계정을 회원으로 바꾼다(기록이 그대로 따라온다)
  app.post('/api/signup', async (req, res) => {
    const { username, password } = readCredentials(req.body);
    if (await store.findUserByUsername(username)) throw new HttpError(409, '이미 있는 아이디입니다');
    const passwordHash = await bcrypt.hash(password, 10);
    const me = await currentUser(req);
    if (me && me.status !== 'guest') throw new HttpError(409, '이미 회원입니다. 로그아웃 후 가입해 주세요');
    const user = me
      ? await store.updateUser(me.id, { status: 'web', username, passwordHash })
      : await store.createUser({ status: 'web', username, passwordHash });
    reply(res, user);
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = readCredentials(req.body);
    const user = await store.findUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, '아이디 또는 비밀번호가 틀립니다');
    reply(res, user);
  });

  // 구글 로그인과 구글 연동. 로그인한 상태(게스트·웹 회원)면 지금 계정에 구글을 연결한다.
  // 연결한 뒤에는 아이디 로그인이든 구글 로그인이든 같은 유저가 된다
  app.post('/api/google', async (req, res) => {
    if (!verifyGoogle) throw new HttpError(503, '구글 로그인을 아직 설정하지 않았습니다');
    const credential = req.body?.credential;
    if (typeof credential !== 'string') throw new HttpError(400, '구글 인증 정보가 없습니다');
    let google;
    try { google = await verifyGoogle(credential); } catch { throw new HttpError(401, '구글 인증을 확인하지 못했습니다'); }

    const linked = await store.findUserByGoogle(google.sub);
    const me = await currentUser(req);
    if (!me) return reply(res, linked ?? await store.createUser({ status: 'google', googleSub: google.sub, name: google.name }));
    if (linked && linked.id !== me.id) throw new HttpError(409, '이 구글 계정은 다른 유저에 연결되어 있습니다');
    if (me.googleSub && me.googleSub !== google.sub) throw new HttpError(409, '이미 다른 구글 계정이 연결되어 있습니다');
    const status = me.status === 'web' || me.status === 'both' ? 'both' : 'google';
    reply(res, await store.updateUser(me.id, { status, googleSub: google.sub, name: google.name }));
  });

  // 기록 보내기. 점수는 받지 않고 서버가 처치 수로 다시 계산한다. 불가능한 기록은 버그로 표시해 저장한다
  app.post('/api/records', async (req, res) => {
    const user = await requireUser(req);
    const { time, kills, hero = 'sprout', boss = null, pierce = 0, lowHp = false } = req.body ?? {};
    const isCount = n => Number.isInteger(n) && n >= 0;
    if (!Number.isFinite(time) || !kills || typeof kills !== 'object' || Array.isArray(kills) || !Object.values(kills).every(isCount)) {
      throw new HttpError(400, '기록 형식이 틀립니다');
    }
    const record = { time, kills, hero, boss, pierce, lowHp };
    let check = validateRecord(record);
    // 보스를 이겨서 얻지 않은 영웅으로 낸 기록은 버그로 본다
    if (check.ok && hero !== 'sprout' && !isAdmin(user) && !user.progress?.heroes?.includes(hero)) check = { ok: false, reason: `아직 얻지 않은 영웅: ${hero}` };
    const score = check.ok ? check.score : 0;
    await store.addRecord({ userId: user.id, time, kills, score, valid: check.ok, hero: String(hero), boss: boss?.key ?? null, bossKilled: !!boss?.killed });
    let progress = user.progress ?? {}, unlocked = null;
    if (check.ok) {
      ({ progress, unlocked } = addToProgress(progress, record, score));
      await store.updateUser(user.id, { progress });
    }
    res.status(201).json({ valid: check.ok, reason: check.reason, score, best: await store.bestScore(user.id), progress: withAdmin(user, progress), unlocked });
  });

  // 내 기록 보기
  app.get('/api/me', async (req, res) => {
    const user = await requireUser(req);
    res.json({ user: shownUser(user), best: await store.bestScore(user.id) });
  });

  app.use((req, res) => res.status(404).json({ error: '없는 주소입니다' }));
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: '요청 형식이 틀립니다' });
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  });
  return app;
}
