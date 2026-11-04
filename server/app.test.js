// 실행: npm test. 메모리 저장소와 가짜 구글 확인으로 실제 HTTP 요청을 보낸다
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { createMemoryStore } from './store-memory.js';
import { tierOf, HEROES, seasonRange } from '../web/js/rules.js';

let server, base;
// 가짜 구글: 'google:<번호>'를 그 번호의 구글 계정으로 본다
const verifyGoogle = async credential => {
  if (!credential.startsWith('google:')) throw new Error('bad');
  return { sub: credential.slice(7), name: '구글유저' };
};

before(async () => {
  const app = createApp({ store: createMemoryStore(), jwtSecret: 'test-secret', verifyGoogle, corsOrigins: [], adminUsernames: ['admin_tester'], requestsPerMinute: 10000, loginsPerMinute: 10000 });
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
  // 처치 점수가 10,000을 넘으면 10분 전에도 보스가 나온다
  const earlyByScore = await call('/records', { token, body: { time: 540, kills: { slime: 300, bat: 400, knight: 700, golem: 100 }, boss: { key: 'prism', killed: false } } });
  assert.equal(earlyByScore.valid, true);
  const noCondition = await call('/records', { token, body: bossRecord({ key: 'frost', killed: true }, { pierce: 1 }) });
  assert.deepEqual([noCondition.valid, noCondition.reason], [false, '보스 조건을 채우지 않음: 서리 슬라임']);
  const missing = await call('/records', { token, body: bossRecord(null) });
  assert.equal(missing.valid, false);
  const frost = await call('/records', { token, body: bossRecord({ key: 'frost', killed: false }, { pierce: 3 }) });
  assert.deepEqual([frost.valid, frost.unlocked], [true, null]); // 지면 영웅을 얻지 못한다
});

test('성장 단계는 3단계까지다', () => {
  assert.deepEqual([0, 11999, 12000, 49999, 50000, 999999].map(tierOf), [1, 1, 2, 2, 3, 3]);
});

test('관리자는 모든 영웅이 열려 있고 2단계부터다. 일반 회원은 아니다', async () => {
  const admin = await call('/signup', { body: { username: 'admin_tester', password: 'secret12' } });
  assert.deepEqual(admin.user.progress.heroes, ['frost', 'magma', 'shade']);
  const played = await call('/records', { token: admin.token, body: { ...goodRecord, hero: 'shade' } });
  assert.deepEqual([played.valid, played.progress.heroes.length], [true, 3]);
  assert.deepEqual(HEROES.map(h => tierOf(played.progress.scores[h])), [2, 2, 2, 2]);
  assert.equal((await call('/me', { token: admin.token })).user.progress.heroes.length, 3);

  const normal = await call('/signup', { body: { username: 'not_admin', password: 'secret12' } });
  assert.equal(normal.user.progress.heroes, undefined);
  assert.equal(tierOf(normal.user.progress.scores?.sprout ?? 0), 1);
  const refused = await call('/records', { token: normal.token, body: { ...goodRecord, hero: 'shade' } });
  assert.equal(refused.valid, false);
});

test('랭킹: 유저당 한 줄, 점수순. 게스트·버그 기록·관리자는 빠지고 내 줄을 돌려준다', async () => {
  const a = await call('/signup', { body: { username: 'rank_a', password: 'secret12' } });
  const b = await call('/signup', { body: { username: 'rank_b', password: 'secret12' } });
  const guest = await call('/guest', { body: {} });
  const admin = await call('/login', { body: { username: 'admin_tester', password: 'secret12' } });
  const bug = { time: 1, kills: { golem: 1 } };
  await call('/records', { token: a.token, body: { time: 590, kills: { slime: 500, bat: 50 } } }); // 650점
  await call('/records', { token: a.token, body: goodRecord }); // 26점: 최고 점수에 안 들어간다
  await call('/records', { token: b.token, body: { time: 590, kills: { slime: 300 } } }); // 300점
  await call('/records', { token: b.token, body: bug });
  await call('/records', { token: guest.token, body: { time: 590, kills: { slime: 900 } } });
  await call('/records', { token: admin.token, body: { time: 590, kills: { slime: 900 } } });

  const daily = await call('/rankings?period=daily', { token: b.token });
  const names = daily.top.map(r => r.name);
  assert.equal(names.includes('admin_tester'), false);
  assert.equal(names.filter(n => n === 'rank_a').length, 1);
  const rowA = daily.top.find(r => r.name === 'rank_a'), rowB = daily.top.find(r => r.name === 'rank_b');
  assert.deepEqual([rowA.score, rowA.kills, rowA.plays], [650, 572, 2]);
  assert.equal(rowB.score, 300);
  assert.ok(rowA.rank < rowB.rank);
  assert.equal(daily.me.name, 'rank_b');

  assert.equal((await call('/rankings?period=season', { token: guest.token })).me, null); // 게스트는 집계하지 않는다
  assert.equal((await call('/rankings')).me, null); // 로그인 없이도 볼 수 있다
  assert.equal((await call('/rankings?period=year')).status, 400);
});

test('시즌은 그달 첫날부터 마지막 날까지다', () => {
  assert.deepEqual(seasonRange('2028-02-15'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(seasonRange('2026-12-31'), { from: '2026-12-01', to: '2026-12-31' });
});

test('닉네임: 회원만, 형식 검사, 겹치면 거부. 랭킹과 기록 뒤에도 남는다', async () => {
  const a = await call('/signup', { body: { username: 'nick_a', password: 'secret12' } });
  const b = await call('/signup', { body: { username: 'nick_b', password: 'secret12' } });
  const guest = await call('/guest', { body: {} });
  assert.equal((await call('/profile', { token: guest.token, body: { nickname: '게스트이름' } })).status, 403);
  assert.equal((await call('/profile', { token: a.token, body: { nickname: 'a' } })).status, 400);
  assert.equal((await call('/profile', { token: a.token, body: { nickname: '<b>x</b>' } })).status, 400);
  assert.equal((await call('/profile', { token: a.token, body: { nickname: '말랑슬라임' } })).user.name, '말랑슬라임');
  assert.equal((await call('/profile', { token: b.token, body: { nickname: '말랑슬라임' } })).status, 409);
  assert.equal((await call('/profile', { token: b.token, body: { nickname: 'nick_a' } })).status, 409);
  assert.equal((await call('/profile', { token: a.token, body: { nickname: '말랑슬라임' } })).user.name, '말랑슬라임'); // 자기 이름은 그대로 저장
  await call('/records', { token: a.token, body: { time: 590, kills: { slime: 400 } } });
  assert.equal((await call('/me', { token: a.token })).user.name, '말랑슬라임');
  assert.ok((await call('/rankings')).top.some(r => r.name === '말랑슬라임'));
});

test('구글 회원의 실명은 랭킹에 나오지 않는다', async () => {
  const g = await call('/google', { body: { credential: 'google:rank' } });
  await call('/records', { token: g.token, body: { time: 590, kills: { slime: 350 } } });
  const row = (await call('/rankings', { token: g.token })).me;
  assert.equal(row.name, `플레이어${g.user.id}`);
});

test('비밀번호 바꾸기: 지금 비밀번호가 맞아야 하고, 바꾼 뒤 새 비밀번호로만 로그인된다', async () => {
  const a = await call('/signup', { body: { username: 'pw_a', password: 'secret12' } });
  assert.equal((await call('/password', { token: a.token, body: { current: 'wrong12', next: 'newsecret1' } })).status, 401);
  assert.equal((await call('/password', { token: a.token, body: { current: 'secret12', next: '123' } })).status, 400);
  const changed = await call('/password', { token: a.token, body: { current: 'secret12', next: 'newsecret1' } });
  assert.equal(changed.ok, true);
  assert.equal((await call('/me', { token: a.token })).status, 401); // 바꾸기 전 토큰은 끊긴다
  assert.equal((await call('/me', { token: changed.token })).status, 200);
  assert.equal((await call('/login', { body: { username: 'pw_a', password: 'secret12' } })).status, 401);
  assert.ok((await call('/login', { body: { username: 'pw_a', password: 'newsecret1' } })).token);
  const guest = await call('/guest', { body: {} });
  assert.equal((await call('/password', { token: guest.token, body: { current: 'x', next: 'newsecret1' } })).status, 400);
});

test('영웅별 점수는 따로 쌓인다', async () => {
  const { token } = await call('/guest', { body: {} });
  await call('/records', { token, body: goodRecord });
  const r = await call('/records', { token, body: goodRecord });
  assert.deepEqual(r.progress.scores, { sprout: 52 });
});

test('비밀번호를 받는 주소는 분당 횟수를 따로 제한한다', async () => {
  const app = createApp({ store: createMemoryStore(), jwtSecret: 'test-secret', corsOrigins: [], loginsPerMinute: 2 });
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const login = () => fetch(`http://localhost:${srv.address().port}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'nobody', password: 'secret12' }),
  }).then(r => r.status);
  assert.deepEqual([await login(), await login(), await login()], [401, 401, 429]);
  srv.close();
});
