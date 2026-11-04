// 브라우저 없이 game.js를 돌린다. 봇은 가까운 몹을 피해 움직이며 가장 가까운 몹을 조준하고 정해진 순서로 카드를 고른다.
// 날짜(오늘의 패턴)마다 몇 분에 쓰러지는지, 그 기록을 서버 검증이 통과시키는지 본다.
// 실행: node tests/balance-sim.mjs [날짜 수, 기본 5] [프레임 간격(초), 기본 1/60] [영웅, 기본 sprout] [성장 단계, 기본 1]
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true) });
globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
globalThis.addEventListener = globalThis.removeEventListener = () => {};
let now = 0, queue = [];
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = cb => queue.push(cb);

const { startGame } = await import('../web/js/game.js');
const { validateRecord, seededRandom } = await import('../web/js/rules.js');

const days = Number(process.argv[2]) || 5;
const dt = Number(process.argv[3]) || 1 / 60;
const hero = process.argv[4] || 'sprout', tier = Number(process.argv[5]) || 1;
const el = () => ({ style: {}, textContent: '' });
let failed = 0;

for (let d = 0; d < days; d++) {
  const date = `2026-11-${String(3 + d).padStart(2, '0')}`;
  let done;
  queue = [];
  const hud = { time: el(), score: el(), level: el(), hp: el(), threat: el(), xp: el() };
  startGame({ getContext: () => ctx, getBoundingClientRect: () => ({}) }, hud, date,
    { bot: true, random: seededRandom(`cards-${date}`), hero, tier }).then(r => { done = r; });
  const lv = [], sc = []; // 분마다 레벨, 점수
  while (!done && queue.length) {
    const cb = queue.shift(); now += dt * 1000; cb(now); await null;
    const min = parseInt(hud.time.textContent);
    if (min > lv.length - 1 && min > 0) { lv[min] = hud.level.textContent; sc[min] = hud.score.textContent; }
  }
  const check = validateRecord(done);
  if (!check.ok) failed++;
  const m = Math.floor(done.time / 60), s = Math.round(done.time % 60);
  console.log(`${date}  생존 ${m}분 ${String(s).padStart(2, '0')}초  점수 ${String(check.score ?? '-').padStart(5)}  Lv ${hud.level.textContent} (분마다 ${lv.slice(1).join('/')})  점수(분마다 ${sc.slice(1).join('/')})  처치 ${JSON.stringify(done.kills)}  보스 ${done.boss ? `${done.boss.key}${done.boss.killed ? ' 처치' : ' 못 잡음'}` : '-'}  서버 검증 ${check.ok ? '통과' : `거부(${check.reason})`}`);
}
if (failed) { console.error(`서버가 실제 플레이 기록 ${failed}개를 거부했다. rules.js의 상한 계산을 고쳐야 한다`); process.exit(1); }
