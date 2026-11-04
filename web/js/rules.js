// 게임 규칙과 기록 검증. 화면(브라우저)과 서버(Node)가 같은 파일을 쓴다.
// DOM을 쓰지 않는다.

export const MAX_TIME = 1200; // 초. 설계상 이보다 오래 버틸 수 없다

// from: 등장 위협도. 늦게 나오는 몹일수록 강하고 점수가 높다
export const MOBS = {
  slime:  { name: '포자버섯', hp: 20,  speed: 45, dmg: 8,  score: 1,  xp: 1,  from: 0 },
  bat:    { name: '동굴박쥐', hp: 35,  speed: 85, dmg: 10, score: 3,  xp: 2,  from: 90 },
  knight: { name: '슬라임 사냥꾼', hp: 160, speed: 55, dmg: 18, score: 10, xp: 6,  from: 240 },
  golem:  { name: '바위 골렘', hp: 700, speed: 65, dmg: 35, score: 30, xp: 20, from: 420 },
};

// 영웅: 새싹은 처음부터, 나머지는 10분 보스를 이겨야 고를 수 있다 (SETTING.md)
export const HEROES = ['sprout', 'frost', 'magma', 'shade'];
export const BOSS_TIME = 600; // 초. 늦어도 이때는 보스가 나온다
export const BOSS_SCORE = 10000; // 처치 점수가 이만큼이면 10분 전이라도 바로 보스가 나온다
// 보스: 조건을 채운 영웅 슬라임, 아무 조건도 못 채우면 프리즘 킹(이겨도 도감에만)
export const BOSSES = {
  frost: { name: '서리 슬라임', score: 500, hero: true },
  magma: { name: '용암 슬라임', score: 500, hero: true },
  shade: { name: '번개 슬라임', score: 500, hero: true },
  prism: { name: '프리즘 킹', score: 300, hero: false },
};
// 보스 조건. s = { pierce: 관통 강화 횟수, kills: 처치 수, lowHp: 체력 20% 아래로 떨어진 적이 있나 }
export const BOSS_RULES = {
  frost: s => s.pierce >= 3,
  magma: s => s.kills >= 1500,
  shade: s => s.lowHp,
};
// 성장: 그 영웅으로 얻은 처치 점수를 더한 값이 이만큼이면 다음 단계
export const GROWTH = [0, 12000, 50000];
export const tierOf = total => GROWTH.filter(n => total >= n).length; // 1~3

// 위협도: 시간이 지나도, 몹을 처치해도 오른다. 빨리 처치할수록 빨리 어려워진다
export const KILL_THREAT = 0.25; // 처치 1마리 = 위협도 0.25 (1초 = 1)
export const threatOf = (time, kills) => time + kills * KILL_THREAT;

// 아래 셋은 모두 위협도를 받는다. spawnInterval의 기울기가 -1보다 완만해야 서버 상한 계산이 맞다
export const spawnInterval = threat => Math.max(0.12, 1.1 - threat / 360);
// 위협도 1200부터는 제곱으로 급격히 강해져 끝없이 버틸 수 없다 (600이던 것을 10분 보스와 싸울 시간이 있게 늦춤, SETTING.md)
const OVERTIME = 1200;
const overtime = threat => Math.max(0, threat - OVERTIME) ** 2 / 3000;
export const hpScale = threat => 1 + threat / 200 + overtime(threat);
export const dmgScale = threat => 1 + threat / 250 + overtime(threat);
export const FIRST_SPAWN = 0.5;

export const unlocked = threat => Object.keys(MOBS).filter(k => MOBS[k].from <= threat);

// 서버 검증용 상한: 나온 몹을 나오자마자 모두 처치했다고 치면 위협도가 가장 빨리 올라
// 어떤 플레이보다 출현이 많거나 같다. 0~T초의 출현 시각을 돌려준다
export function spawnBound(T) {
  const times = [];
  for (let t = FIRST_SPAWN; t <= T;) {
    const threat = threatOf(t, times.length);
    times.push(t);
    t += spawnInterval(threat);
  }
  return times;
}

// 위협도가 처음 F에 닿을 수 있는 가장 이른 시각 (위 상한 기준)
function earliestThreat(F, times) {
  for (let j = 0; j <= times.length; j++) {
    const start = j ? times[j - 1] : 0, end = j < times.length ? times[j] : Infinity;
    const t = Math.max(start, F - KILL_THREAT * j);
    if (t <= end) return t;
  }
  return Infinity;
}

export const scoreOf = kills =>
  Object.keys(MOBS).reduce((sum, k) => sum + (kills[k] || 0) * MOBS[k].score, 0);

// 오늘의 패턴: 한국 날짜가 같으면 모두 같은 출현 순서
export const todayKST = (now = Date.now()) =>
  new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 시즌은 한국 시간 달력으로 한 달이다. 그달 첫날과 마지막 날을 돌려준다
export function seasonRange(date) {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const month = `${y}-${String(m).padStart(2, '0')}`;
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function seededRandom(text) {
  let a = 0;
  for (const ch of text) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 1) | 0;
  return () => { // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 서버가 받은 기록을 검사한다. 점수는 받지 않고 처치 수로 다시 계산한다.
// ponytail: 설계상 가능한 범위만 본다. 실제 플레이에서 나온 기록인지는 알 수 없다
export function validateRecord({ time, kills, hero = 'sprout', boss = null, pierce = 0, lowHp = false }) {
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > MAX_TIME) {
    return { ok: false, reason: '생존 시간이 범위를 벗어남' };
  }
  if (!kills || typeof kills !== 'object' || Array.isArray(kills)) {
    return { ok: false, reason: '처치 기록 형식이 틀림' };
  }
  for (const [k, n] of Object.entries(kills)) {
    if (!MOBS[k]) return { ok: false, reason: `모르는 몹: ${k}` };
    if (!Number.isInteger(n) || n < 0) return { ok: false, reason: `처치 수가 틀림: ${k}` };
  }
  const times = spawnBound(time);
  const total = Object.values(kills).reduce((a, b) => a + b, 0);
  if (total > times.length) return { ok: false, reason: '나올 수 있는 몹보다 많이 처치함' };
  for (const k of Object.keys(kills)) {
    if (kills[k] > 0 && earliestThreat(MOBS[k].from, times) > time) return { ok: false, reason: `나오기 전에 처치함: ${MOBS[k].name}` };
  }
  if (!HEROES.includes(hero)) return { ok: false, reason: `모르는 영웅: ${hero}` };
  if (!Number.isInteger(pierce) || pierce < 0 || typeof lowHp !== 'boolean') return { ok: false, reason: '보스 조건 값이 틀림' };
  if (boss !== null) {
    if (typeof boss !== 'object' || !BOSSES[boss.key] || typeof boss.killed !== 'boolean') return { ok: false, reason: '보스 기록 형식이 틀림' };
    if (time < BOSS_TIME && scoreOf(kills) < BOSS_SCORE) return { ok: false, reason: '보스가 나오기 전에 끝난 기록에 보스가 있음' };
    // 조건 보스는 그 조건이 기록과 맞아야 한다. 프리즘 킹은 조건이 없다
    if (BOSS_RULES[boss.key] && !BOSS_RULES[boss.key]({ pierce, kills: total, lowHp })) return { ok: false, reason: `보스 조건을 채우지 않음: ${BOSSES[boss.key].name}` };
  } else if (time >= BOSS_TIME + 1) {
    return { ok: false, reason: '10분을 넘겼는데 보스 기록이 없음' };
  }
  return { ok: true, score: scoreOf(kills) + (boss?.killed ? BOSSES[boss.key].score : 0) };
}

// 검증을 통과한 기록을 진행도에 더한다. 원래 값은 바꾸지 않고 새 값을 돌려준다
// progress = { heroes: [얻은 영웅], scores: { 영웅: 누적 점수 }, dex: { kills: { 몹: 수 }, bosses: { 보스: 이긴 횟수 } } }
export function addToProgress(progress = {}, { hero = 'sprout', kills, boss }, score) {
  const heroes = progress.heroes ?? [];
  const scores = { ...progress.scores, [hero]: (progress.scores?.[hero] ?? 0) + score };
  const dexKills = { ...progress.dex?.kills };
  for (const [k, n] of Object.entries(kills)) if (n) dexKills[k] = (dexKills[k] ?? 0) + n;
  const bosses = { ...progress.dex?.bosses };
  let unlocked = null;
  if (boss?.killed) {
    bosses[boss.key] = (bosses[boss.key] ?? 0) + 1;
    if (BOSSES[boss.key].hero && !heroes.includes(boss.key)) unlocked = boss.key;
  }
  return { progress: { ...progress, heroes: unlocked ? [...heroes, unlocked] : heroes, scores, dex: { kills: dexKills, bosses } }, unlocked };
}
