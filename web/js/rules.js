// 게임 규칙과 기록 검증. 화면(브라우저)과 서버(Node)가 같은 파일을 쓴다.
// DOM을 쓰지 않는다.

export const MAX_TIME = 1200; // 초. 설계상 이보다 오래 버틸 수 없다

// from: 등장 시각(초). 늦게 나오는 몹일수록 강하고 점수가 높다
export const MOBS = {
  slime:  { name: '슬라임', hp: 20,  speed: 45, dmg: 8,  score: 1,  xp: 1,  from: 0 },
  bat:    { name: '박쥐',   hp: 35,  speed: 85, dmg: 10, score: 3,  xp: 2,  from: 90 },
  knight: { name: '기사',   hp: 160, speed: 55, dmg: 18, score: 10, xp: 6,  from: 240 },
  golem:  { name: '골렘',   hp: 700, speed: 65, dmg: 35, score: 30, xp: 20, from: 420 },
};

export const spawnInterval = t => Math.max(0.12, 1.1 - t / 360);
export const hpScale = t => 1 + t / 150;
export const dmgScale = t => 1 + t / 200;
export const FIRST_SPAWN = 0.5;

export const unlocked = t => Object.keys(MOBS).filter(k => MOBS[k].from <= t);

// 게임과 똑같은 계산으로 0~T초 사이의 출현 시각을 만든다
export function spawnTimes(T) {
  const out = [];
  for (let t = FIRST_SPAWN; t <= T; t += spawnInterval(t)) out.push(t);
  return out;
}

export const scoreOf = kills =>
  Object.keys(MOBS).reduce((sum, k) => sum + (kills[k] || 0) * MOBS[k].score, 0);

// 오늘의 패턴: 한국 날짜가 같으면 모두 같은 출현 순서
export const todayKST = (now = Date.now()) =>
  new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);

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
export function validateRecord({ time, kills }) {
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
  const times = spawnTimes(time);
  const total = Object.values(kills).reduce((a, b) => a + b, 0);
  if (total > times.length) return { ok: false, reason: '나온 몹보다 많이 처치함' };
  for (const k of Object.keys(kills)) {
    const possible = times.filter(t => t >= MOBS[k].from).length;
    if (kills[k] > possible) return { ok: false, reason: `${MOBS[k].name}가 나오기 전에 처치함` };
  }
  return { ok: true, score: scoreOf(kills) };
}
