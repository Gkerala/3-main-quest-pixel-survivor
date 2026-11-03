// 한 판. startGame이 끝나면 { time, kills }로 resolve 된다.
// options.choose(cards): 레벨업 카드 3장 중 하나를 Promise로 돌려준다 (화면이 띄운다)
// options.bot: 테스트용. 마우스 대신 가장 가까운 몹을 조준한다
import { MOBS, MAX_TIME, FIRST_SPAWN, spawnInterval, hpScale, dmgScale, unlocked, scoreOf, seededRandom, threatOf } from './rules.js';
import { SPRITES } from './sprites.js';

const W = 320, H = 180, SIZE = 16, TILE = 32;
const SPAWN_RADIUS = 220;
const PLAYER = { hp: 100, speed: 110, damage: 20, cooldown: 0.5 };
const BOLT = { speed: 300, life: 1, spread: 0.2 }; // spread: 탄 여러 발일 때 사이 각도(라디안)
const LEVEL_XP = 6; // 다음 레벨까지 필요한 경험치 = 레벨 × 6
const MAX_DT = 0.05; // 탭을 바꿨다 돌아와도 한 번에 크게 건너뛰지 않게

// 강화는 더하기 위주로. 곱하기로 끝없이 늘리면 몹보다 빨리 강해져 끝나지 않는다
export const UPGRADES = [
  { id: 'damage', name: '공격력', desc: '탄 피해 +8', apply: p => { p.damage += 8; } },
  { id: 'rate', name: '공격 속도', desc: '공격 간격 -12%', max: 8, apply: p => { p.cooldown *= 0.88; } },
  { id: 'shots', name: '탄 추가', desc: '한 번에 1발 더', max: 6, apply: p => { p.shots++; } },
  { id: 'pierce', name: '관통', desc: '탄이 1마리 더 뚫고 간다', max: 3, apply: p => { p.pierce++; } },
  { id: 'speed', name: '이동 속도', desc: '+12%', max: 4, apply: p => { p.speed *= 1.12; } },
  { id: 'vital', name: '최대 체력', desc: '+25, 그만큼 회복', apply: p => { p.maxHp += 25; p.hp += 25; } },
  { id: 'heal', name: '회복', desc: '체력 50% 회복', apply: p => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp / 2); } },
];

const KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export function startGame(canvas, hud, seedText, { choose, bot = false, random = Math.random } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rand = seededRandom(seedText); // 출현에만 쓴다. 그래야 그날은 모두 같은 패턴
  const held = new Set();
  let aim = 0; // 라디안. 마우스 방향
  const onKey = e => {
    if (!KEYS[e.code]) return;
    e.preventDefault();
    e.type === 'keydown' ? held.add(e.code) : held.delete(e.code);
  };
  const onMouse = e => {
    const r = canvas.getBoundingClientRect();
    aim = Math.atan2((e.clientY - r.top) / r.height * H - H / 2, (e.clientX - r.left) / r.width * W - W / 2);
  };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  addEventListener('mousemove', onMouse);

  const p = { x: 0, y: 0, hp: PLAYER.hp, maxHp: PLAYER.hp, speed: PLAYER.speed, damage: PLAYER.damage,
    cooldown: PLAYER.cooldown, shots: 1, pierce: 0, level: 1, xp: 0, reload: 0, facing: 1, moving: false, taken: {} };
  const mobs = [], bolts = [];
  const kills = Object.fromEntries(Object.keys(MOBS).map(k => [k, 0]));
  let time = 0, killCount = 0, nextSpawn = FIRST_SPAWN, last = performance.now();
  let pendingLevels = 0, choosing = false;

  return new Promise(resolve => {
    function frame(now) {
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      if (!choosing) {
        time += dt;
        spawn();
        move(dt);
        shoot(dt);
        fly(dt);
        hurt(dt);
      }
      draw(now);
      drawHud();
      if (p.hp <= 0 || time >= MAX_TIME) {
        removeEventListener('keydown', onKey);
        removeEventListener('keyup', onKey);
        removeEventListener('mousemove', onMouse);
        resolve({ time: Math.round(time * 10) / 10, kills });
        return;
      }
      if (pendingLevels && !choosing) levelUp();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  // 게임을 멈추고 카드 3장 중 하나를 고르게 한다
  async function levelUp() {
    choosing = true;
    held.clear(); // 고르는 동안 키를 떼도 keyup을 못 받을 수 있다
    const open = UPGRADES.filter(u => !u.max || (p.taken[u.id] || 0) < u.max);
    const cards = [];
    while (cards.length < 3 && open.length) cards.push(open.splice(Math.floor(random() * open.length), 1)[0]);
    const card = bot ? botPick(cards) : await choose(cards);
    card.apply(p);
    p.taken[card.id] = (p.taken[card.id] || 0) + 1;
    pendingLevels--;
    choosing = false;
    last = performance.now(); // 고르는 시간은 게임 시간에 넣지 않는다
  }

  function botPick(cards) {
    const order = ['shots', 'rate', 'damage', 'pierce', 'vital', 'heal', 'speed'];
    return cards.reduce((a, b) => (order.indexOf(a.id) <= order.indexOf(b.id) ? a : b));
  }

  function spawn() {
    while (time >= nextSpawn) {
      const threat = threatOf(nextSpawn, killCount);
      const types = unlocked(threat);
      // 늦게 나온 몹일수록 자주: 가중치 1, 2, 3, 4
      const total = (types.length * (types.length + 1)) / 2;
      let pick = rand() * total, type = types[0];
      for (let i = 0; i < types.length; i++) { pick -= i + 1; if (pick < 0) { type = types[i]; break; } }
      const angle = rand() * Math.PI * 2;
      const m = MOBS[type];
      mobs.push({ type, x: p.x + Math.cos(angle) * SPAWN_RADIUS, y: p.y + Math.sin(angle) * SPAWN_RADIUS,
        hp: m.hp * hpScale(threat), dmg: m.dmg * dmgScale(threat), speed: m.speed });
      nextSpawn += spawnInterval(threat);
    }
  }

  function move(dt) {
    let dx = 0, dy = 0;
    for (const k of held) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
    if (bot) [dx, dy] = botDodge();
    const len = Math.hypot(dx, dy);
    p.moving = len > 0;
    if (p.moving) {
      p.x += (dx / len) * p.speed * dt;
      p.y += (dy / len) * p.speed * dt;
    }
    for (const m of mobs) {
      const d = Math.hypot(p.x - m.x, p.y - m.y) || 1;
      m.x += ((p.x - m.x) / d) * m.speed * dt;
      m.y += ((p.y - m.y) / d) * m.speed * dt;
    }
  }

  // 마우스 방향으로 자동 발사. 탄이 여러 발이면 부채꼴로 퍼진다
  function shoot(dt) {
    p.reload -= dt;
    if (p.reload > 0) return;
    p.reload = p.cooldown;
    if (bot) aim = nearestAngle() ?? aim;
    p.facing = Math.cos(aim) < 0 ? -1 : 1;
    for (let i = 0; i < p.shots; i++) {
      const a = aim + (i - (p.shots - 1) / 2) * BOLT.spread;
      bolts.push({ x: p.x, y: p.y, vx: Math.cos(a) * BOLT.speed, vy: Math.sin(a) * BOLT.speed, life: BOLT.life, pierce: p.pierce, hit: new Set() });
    }
  }

  // 봇의 이동: 80px 안의 몹에게서 멀어지고, 가까운 몹이 없으면 천천히 원을 그린다 (보통 플레이어 흉내)
  function botDodge() {
    let dx = 0, dy = 0;
    for (const m of mobs) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < 80) { dx += (p.x - m.x) / (d * d + 1); dy += (p.y - m.y) / (d * d + 1); }
    }
    return dx || dy ? [dx, dy] : [Math.cos(time / 3), Math.sin(time / 3)];
  }

  function nearestAngle() {
    let best = null, bestD = Infinity;
    for (const m of mobs) {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best && Math.atan2(best.y - p.y, best.x - p.x);
  }

  function fly(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      // 움직이기 전과 후를 모두 본다. 프레임이 느리면 탄이 바로 옆 몹을 건너뛰기 때문
      const near = m => !b.hit.has(m) && Math.abs(m.x - b.x) < 10 && Math.abs(m.y - b.y) < 10;
      let hit = mobs.find(near);
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      hit ??= mobs.find(near);
      if (hit) {
        hit.hp -= p.damage;
        b.hit.add(hit);
        if (b.pierce-- <= 0) b.life = 0;
      }
      if (b.life <= 0) bolts.splice(i, 1);
    }
    for (let i = mobs.length - 1; i >= 0; i--) {
      if (mobs[i].hp > 0) continue;
      kills[mobs[i].type]++;
      killCount++;
      gainXp(MOBS[mobs[i].type].xp);
      mobs.splice(i, 1);
    }
  }

  function gainXp(xp) {
    p.xp += xp;
    while (p.xp >= p.level * LEVEL_XP) {
      p.xp -= p.level * LEVEL_XP;
      p.level++;
      pendingLevels++;
    }
  }

  function hurt(dt) {
    for (const m of mobs) {
      if (Math.abs(m.x - p.x) < 11 && Math.abs(m.y - p.y) < 11) p.hp -= m.dmg * dt;
    }
  }

  function draw(now) {
    const cx = Math.round(p.x - W / 2), cy = Math.round(p.y - H / 2);
    // 바닥: 타일 좌표로 색을 정해 카메라가 움직여도 같은 자리에 같은 무늬
    for (let ty = Math.floor(cy / TILE); ty * TILE < cy + H; ty++) {
      for (let tx = Math.floor(cx / TILE); tx * TILE < cx + W; tx++) {
        const h = Math.abs((tx * 73856093) ^ (ty * 19349663)) % 13;
        ctx.fillStyle = (tx + ty) & 1 ? '#23302a' : '#26352d';
        ctx.fillRect(tx * TILE - cx, ty * TILE - cy, TILE, TILE);
        if (h === 0) { ctx.fillStyle = '#35503d'; ctx.fillRect(tx * TILE - cx + 12, ty * TILE - cy + 14, 3, 2); }
      }
    }
    const step = Math.floor(now / 180) % 2;
    for (const m of mobs) blit(SPRITES[m.type][0], m.x - cx, m.y - cy, m.x > p.x ? -1 : 1);
    for (const b of bolts) blit(SPRITES.bolt[0], b.x - cx, b.y - cy, 1);
    blit(SPRITES.player[p.moving ? step : 0], W / 2, H / 2, p.facing);
    // 조준선: 마우스 방향을 짧게 보여 준다
    ctx.fillStyle = '#e8b04a';
    for (let r = 14; r <= 26; r += 4) ctx.fillRect(Math.round(W / 2 + Math.cos(aim) * r), Math.round(H / 2 + Math.sin(aim) * r), 1, 1);
  }

  function blit(img, x, y, flip) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(flip, 1);
    ctx.drawImage(img, -SIZE / 2, -SIZE / 2);
    ctx.restore();
  }

  function drawHud() {
    const s = Math.floor(time);
    hud.time.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    hud.score.textContent = scoreOf(kills);
    hud.level.textContent = p.level;
    hud.threat.textContent = Math.floor(threatOf(time, killCount));
    hud.hp.style.width = `${Math.max(0, p.hp) / p.maxHp * 100}%`;
  }
}
