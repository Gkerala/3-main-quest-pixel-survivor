// 실행: npm test. 메모리 저장소와 가짜 구글 확인으로 실제 HTTP 요청을 보낸다
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { createMemoryStore } from './store-memory.js';

let server, base;
// 가짜 구글: 'google:<번호>'를 그 번호의 구글 계정으로 본다
const verifyGoogle = async credential => {
  if (!credential.startsWith('google:')) throw new Error('bad');
  return { sub: credential.slice(7), name: '구글유저' };
};

before(async () => {
  const app = createApp({ store: createMemoryStore(), jwtSecret: 'test-secret', verifyGoogle, corsOrigins: [] });
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

async function call(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json()) };
}

const goodRecord = { time: 100, kills: { slime: 20, bat: 2 } }; // 20×1 + 2×3 = 26점

test('게스트는 기록을 남기고 최고 점수를 본다', async () => {
  const { token, user } = await call('/guest', { body: {} });
  assert.equal(user.status, 'guest');
  const r = await call('/records', { token, body: goodRecord });
  assert.equal(r.status, 201);
  assert.deepEqual([r.valid, r.score, r.best], [true, 26, 26]);
  assert.equal((await call('/me', { token })).best, 26);
});

test('점수는 서버가 다시 계산하고, 불가능한 기록은 버그로 저장되며 최고 점수에 안 들어간다', async () => {
  const { token } = await call('/guest', { body: {} });
  const forged = await call('/records', { token, body: { ...goodRecord, score: 999999 } });
  assert.equal(forged.score, 26);
  const early = await call('/records', { token, body: { time: 30, kills: { golem: 1 } } }); // 골렘은 420초부터
  assert.deepEqual([early.status, early.valid, early.best], [201, false, 26]);
  const tooMany = await call('/records', { token, body: { time: 10, kills: { slime: 500 } } });
  assert.equal(tooMany.valid, false);
  const tooLong = await call('/records', { token, body: { time: 99999, kills: {} } });
  assert.equal(tooLong.valid, false);
});

test('형식이 틀린 기록과 토큰 없는 기록은 거부한다', async () => {
  const { token } = await call('/guest', { body: {} });
  assert.equal((await call('/records', { token, body: { time: '100', kills: {} } })).status, 400);
  assert.equal((await call('/records', { token, body: { time: 100, kills: { slime: -1 } } })).status, 400);
  assert.equal((await call('/records', { body: goodRecord })).status, 401);
  assert.equal((await call('/records', { token: 'forged', body: goodRecord })).status, 401);
});

test('게스트가 회원가입하면 같은 계정이 회원이 되고 기록이 따라온다', async () => {
  const guest = await call('/guest', { body: {} });
  await call('/records', { token: guest.token, body: goodRecord });
  const web = await call('/signup', { token: guest.token, body: { username: 'upgrade_me', password: 'secret12' } });
  assert.deepEqual([web.user.id, web.user.status], [guest.user.id, 'web']);
  const login = await call('/login', { body: { username: 'upgrade_me', password: 'secret12' } });
  assert.equal((await call('/me', { token: login.token })).best, 26);
});

test('회원가입·로그인 입력 검사', async () => {
  await call('/signup', { body: { username: 'dup_user', password: 'secret12' } });
  assert.equal((await call('/signup', { body: { username: 'dup_user', password: 'secret12' } })).status, 409);
  assert.equal((await call('/signup', { body: { username: 'a', password: 'secret12' } })).status, 400);
  assert.equal((await call('/signup', { body: { username: 'short_pw', password: '123' } })).status, 400);
  assert.equal((await call('/login', { body: { username: 'dup_user', password: 'wrong123' } })).status, 401);
  assert.equal((await call('/login', { body: { username: 'nobody', password: 'secret12' } })).status, 401);
});

test('웹 계정에 구글을 연동하면 어느 쪽으로 로그인해도 같은 유저다', async () => {
  const web = await call('/signup', { body: { username: 'linker', password: 'secret12' } });
  const linked = await call('/google', { token: web.token, body: { credential: 'google:111' } });
  assert.deepEqual([linked.user.id, linked.user.status], [web.user.id, 'both']);
  const viaGoogle = await call('/google', { body: { credential: 'google:111' } });
  const viaPassword = await call('/login', { body: { username: 'linker', password: 'secret12' } });
  assert.equal(viaGoogle.user.id, web.user.id);
  assert.equal(viaPassword.user.id, web.user.id);
});

test('구글만으로 로그인하면 구글 회원이 되고, 이미 연결된 구글은 다른 계정에 못 붙인다', async () => {
  const g = await call('/google', { body: { credential: 'google:222' } });
  assert.equal(g.user.status, 'google');
  assert.equal((await call('/google', { body: { credential: 'google:222' } })).user.id, g.user.id);
  const other = await call('/signup', { body: { username: 'other_one', password: 'secret12' } });
  assert.equal((await call('/google', { token: other.token, body: { credential: 'google:222' } })).status, 409);
  assert.equal((await call('/google', { body: { credential: 'fake' } })).status, 401);
});

test('게스트가 구글을 연동하면 구글 회원이 된다', async () => {
  const guest = await call('/guest', { body: {} });
  const g = await call('/google', { token: guest.token, body: { credential: 'google:333' } });
  assert.deepEqual([g.user.id, g.user.status], [guest.user.id, 'google']);
});

test('비밀번호 해시는 응답에 나오지 않는다', async () => {
  const r = await call('/signup', { body: { username: 'no_leak', password: 'secret12' } });
  assert.equal(JSON.stringify(r).includes('passwordHash'), false);
});

// 10분 넘게 버티고 1,500마리 넘게 잡은 기록 (용암 슬라임 보스 조건)
const bossRecord = (boss, extra = {}) => ({ time: 640, kills: { slime: 700, bat: 600, knight: 200 }, boss, ...extra });

test('조건 보스를 이기면 그 영웅을 얻고, 얻은 뒤에야 그 영웅으로 기록이 인정된다', async () => {
  const { token } = await call('/guest', { body: {} });
  const early = await call('/records', { token, body: { ...goodRecord, hero: 'magma' } });
  assert.deepEqual([early.valid, early.reason], [false, '아직 얻지 않은 영웅: magma']);
  const won = await call('/records', { token, body: bossRecord({ key: 'magma', killed: true }) });
  assert.deepEqual([won.valid, won.unlocked, won.progress.heroes], [true, 'magma', ['magma']]);
  assert.equal(won.score, 700 + 600 * 3 + 200 * 10 + 500); // 보스 점수 500
  const later = await call('/records', { token, body: { ...goodRecord, hero: 'magma' } });
  assert.deepEqual([later.valid, later.progress.scores.magma], [true, 26]);
  assert.deepEqual((await call('/me', { token })).user.progress.heroes, ['magma']);
});

test('일반 보스(프리즘 킹)는 이겨도 영웅이 안 되고 도감에만 남는다', async () => {
  const { token } = await call('/guest', { body: {} });
  const r = await call('/records', { token, body: bossRecord({ key: 'prism', killed: true }) });
  assert.deepEqual([r.valid, r.unlocked, r.progress.heroes, r.progress.dex.bosses.prism], [true, null, [], 1]);
  assert.equal(r.progress.dex.kills.knight, 200);
});

test('보스 기록 검사: 10분 전 보스, 조건을 안 채운 조건 보스, 10분을 넘겼는데 보스 없음은 버그', async () => {
  const { token } = await call('/guest', { body: {} });
  const tooEarly = await call('/records', { token, body: { ...goodRecord, boss: { key: 'prism', killed: true } } });
  assert.equal(tooEarly.valid, false);
  const noCondition = await call('/records', { token, body: bossRecord({ key: 'frost', killed: true }, { pierce: 1 }) });
  assert.deepEqual([noCondition.valid, noCondition.reason], [false, '보스 조건을 채우지 않음: 서리 슬라임']);
  const missing = await call('/records', { token, body: bossRecord(null) });
  assert.equal(missing.valid, false);
  const frost = await call('/records', { token, body: bossRecord({ key: 'frost', killed: false }, { pierce: 3 }) });
  assert.deepEqual([frost.valid, frost.unlocked], [true, null]); // 지면 영웅을 얻지 못한다
});

test('영웅별 점수는 따로 쌓인다', async () => {
  const { token } = await call('/guest', { body: {} });
  await call('/records', { token, body: goodRecord });
  const r = await call('/records', { token, body: goodRecord });
  assert.deepEqual(r.progress.scores, { sprout: 52 });
});
