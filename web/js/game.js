// 한 판. startGame이 끝나면 { time, kills }로 resolve 된다.
import { MOBS, MAX_TIME, FIRST_SPAWN, spawnInterval, hpScale, dmgScale, unlocked, scoreOf, seededRandom } from './rules.js';
import { SPRITES } from './sprites.js';

const W = 320, H = 180, SIZE = 16, TILE = 32;
const SPAWN_RADIUS = 220;
const PLAYER = { hp: 100, speed: 110, damage: 20, cooldown: 0.5, range: 120 };
const BOLT = { speed: 280, life: 1.2 };
const LEVEL_XP = 6; // 다음 레벨까지 필요한 경험치 = 레벨 × 6
const MAX_DT = 0.05; // 탭을 바꿨다 돌아와도 한 번에 크게 건너뛰지 않게

const KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export function startGame(canvas, hud, seedText) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rand = seededRandom(seedText); // 출현에만 쓴다. 그래야 그날은 모두 같은 패턴
  const held = new Set();
  const onKey = e => {
    if (!KEYS[e.code]) return;
    e.preventDefault();
    e.type === 'keydown' ? held.add(e.code) : held.delete(e.code);
  };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);

  const p = { x: 0, y: 0, hp: PLAYER.hp, level: 1, xp: 0, damage: PLAYER.damage,
    cooldown: PLAYER.cooldown, shots: 1, reload: 0, facing: 1, moving: false };
  const mobs = [], bolts = [];
  const kills = Object.fromEntries(Object.keys(MOBS).map(k => [k, 0]));
  let time = 0, nextSpawn = FIRST_SPAWN, last = performance.now();

  return new Promise(resolve => {
    function frame(now) {
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      time += dt;
      spawn();
      move(dt);
      shoot(dt);
      fly(dt);
      hurt(dt);
      draw(now);
      drawHud();
      if (p.hp <= 0 || time >= MAX_TIME) {
        removeEventListener('keydown', onKey);
        removeEventListener('keyup', onKey);
        resolve({ time: Math.round(time * 10) / 10, kills });
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  function spawn() {
    while (time >= nextSpawn) {
      const types = unlocked(nextSpawn);
      // 늦게 나온 몹일수록 자주: 가중치 1, 2, 3, 4
      const total = (types.length * (types.length + 1)) / 2;
      let pick = rand() * total, type = types[0];
      for (let i = 0; i < types.length; i++) { pick -= i + 1; if (pick < 0) { type = types[i]; break; } }
      const angle = rand() * Math.PI * 2;
      const m = MOBS[type];
      mobs.push({ type, x: p.x + Math.cos(angle) * SPAWN_RADIUS, y: p.y + Math.sin(angle) * SPAWN_RADIUS,
        hp: m.hp * hpScale(nextSpawn), dmg: m.dmg * dmgScale(nextSpawn), speed: m.speed });
      nextSpawn += spawnInterval(nextSpawn);
    }
  }

  function move(dt) {
    let dx = 0, dy = 0;
    for (const k of held) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
    const len = Math.hypot(dx, dy);
    p.moving = len > 0;
    if (p.moving) {
      p.x += (dx / len) * PLAYER.speed * dt;
      p.y += (dy / len) * PLAYER.speed * dt;
      if (dx) p.facing = Math.sign(dx);
    }
    for (const m of mobs) {
      const d = Math.hypot(p.x - m.x, p.y - m.y) || 1;
      m.x += ((p.x - m.x) / d) * m.speed * dt;
      m.y += ((p.y - m.y) / d) * m.speed * dt;
    }
  }

  // 가까운 몹부터 shots마리를 자동으로 쏜다
  function shoot(dt) {
    p.reload -= dt;
    if (p.reload > 0) return;
    const targets = mobs
      .map(m => ({ m, d: Math.hypot(m.x - p.x, m.y - p.y) }))
      .filter(t => t.d < PLAYER.range)
      .sort((a, b) => a.d - b.d)
      .slice(0, p.shots);
    if (!targets.length) return;
    p.reload = p.cooldown;
    for (const { m, d } of targets) {
      bolts.push({ x: p.x, y: p.y, vx: ((m.x - p.x) / d) * BOLT.speed, vy: ((m.y - p.y) / d) * BOLT.speed, life: BOLT.life });
    }
  }

  function fly(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      // 움직이기 전과 후를 모두 본다. 프레임이 느리면 탄이 바로 옆 몹을 건너뛰기 때문
      const near = m => Math.abs(m.x - b.x) < 10 && Math.abs(m.y - b.y) < 10;
      let hit = mobs.find(near);
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      hit ??= mobs.find(near);
      if (hit) { hit.hp -= p.damage; b.life = 0; }
      if (b.life <= 0) bolts.splice(i, 1);
    }
    for (let i = mobs.length - 1; i >= 0; i--) {
      if (mobs[i].hp > 0) continue;
      const m = MOBS[mobs[i].type];
      kills[mobs[i].type]++;
      gainXp(m.xp);
      mobs.splice(i, 1);
    }
  }

  function gainXp(xp) {
    p.xp += xp;
    // 강화는 더하기로만 늘린다. 곱하기로 늘리면 몹보다 빨리 강해져 끝나지 않는다
    while (p.xp >= p.level * LEVEL_XP) {
      p.xp -= p.level * LEVEL_XP;
      p.level++;
      p.damage = PLAYER.damage + 6 * (p.level - 1);
      p.cooldown = Math.max(0.2, PLAYER.cooldown - 0.02 * (p.level - 1));
      p.shots = Math.min(6, 1 + Math.floor(p.level / 5));
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
    hud.hp.style.width = `${Math.max(0, p.hp) / PLAYER.hp * 100}%`;
  }
}
