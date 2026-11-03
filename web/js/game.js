// 한 판. startGame이 끝나면 { time, kills, hero, boss, pierce, lowHp }로 resolve 된다.
// options.choose(cards): 레벨업 카드 3장 중 하나를 Promise로 돌려준다 (화면이 띄운다)
// options.hero / tier: 고른 영웅과 성장 단계(1~4). options.bot: 테스트용. 마우스 대신 가장 가까운 몹을 조준한다
import { MOBS, MAX_TIME, FIRST_SPAWN, spawnInterval, hpScale, dmgScale, unlocked, scoreOf, seededRandom, threatOf,
  BOSS_TIME, BOSSES, BOSS_RULES } from './rules.js';
import { HERO_DEFS, cardPool } from './heroes.js';
import { gameArt } from './slime-art.js';

const W = 320, H = 180, TILE = 32;
const SPAWN_RADIUS = 220;
const PLAYER = { hp: 100, speed: 110 };
const SPREAD = 0.2; // 탄 여러 발일 때 사이 각도(라디안)
const BURN = 1.2; // 잔불: 초당 공격력의 이만큼 (2초 동안)
const BITE_ARC = 0.8; // 물기 반달의 반쪽 각도(라디안)
// 보스 체력·공격력은 나올 때의 위협도로 키운다. 고정값이면 10분쯤 화력에 순식간에 녹는다.
// 막판 급강화(overtime)는 빼고 곧은 배율만 쓴다. 넣으면 한 번 닿기만 해도 쓰러진다
const BOSS = { hp: 3000, dmg: 30, speed: 40, size: 18, xp: 40 };
const MOB_SIZE = 10; // 몹 판정 상자의 반 폭
const LEVEL_XP = 6; // 다음 레벨까지 필요한 경험치 = 레벨 × 6
const MAX_DT = 0.05; // 탭을 바꿨다 돌아와도 한 번에 크게 건너뛰지 않게
const DEATH_ANIM = 1; // 쓰러지는 모습을 보여 주는 시간(초). 기록 시간에는 들어가지 않는다
const STEP = 1 / 60; // 게임 계산은 항상 이 간격으로 쪼갠다. 그래야 화면 프레임 속도와 상관없이 같은 판이 나온다

const KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

const FX_COLORS = { fire: ['#ff8a2a', '#fff07a'], goo: ['#5ac83a', '#c8ff8a'], bite: ['#8a4ad0', '#d8a8ff'] };
const angleGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function startGame(canvas, hud, seedText, { choose, bot = false, random = Math.random, hero = 'sprout', tier = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const DEF = HERO_DEFS[hero];
  const ART = gameArt(hero, tier);
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

  const p = { x: 0, y: 0, hp: PLAYER.hp, maxHp: PLAYER.hp, speed: PLAYER.speed, shots: 1, drain: 0, ...DEF.base,
    level: 1, xp: 0, reload: 0, facing: 1, moving: false, taken: {}, shotT: -9, hurtT: -9 };
  const mobs = [], bolts = [], corpses = []; // corpses: 쓰러지는 모습만 남은 몹 (판정 없음)
  const fx = []; // 고리·폭발·물기 그림 (판정은 생길 때 한 번에 끝낸다)
  const kills = Object.fromEntries(Object.keys(MOBS).map(k => [k, 0]));
  let time = 0, killCount = 0, nextSpawn = FIRST_SPAWN, last = performance.now();
  let pendingLevels = 0, choosing = false, acc = 0, deathT = 0;
  // 보스 조건: 각 조건을 처음 채운 시각. 10분에 가장 먼저 채운 슬라임이 나온다
  const condT = Object.fromEntries(Object.keys(BOSS_RULES).map(k => [k, Infinity]));
  let pierceCount = 0, lowHp = false, boss = null, bossInfo = null;

  return new Promise(resolve => {
    function frame(now) {
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      if (!choosing) {
        acc += dt;
        // 레벨업이 생기면 그 자리에서 멈춰야 프레임 속도가 달라도 같은 순간에 카드를 고른다
        while (acc >= STEP && !pendingLevels && p.hp > 0 && time < MAX_TIME) {
          acc -= STEP;
          time += STEP;
          spawn();
          move(STEP);
          shoot(STEP);
          skills();
          fly(STEP);
          hurt(STEP);
          watch();
          fade(STEP);
        }
      }
      if (p.hp <= 0) deathT += dt;
      draw(now);
      drawHud();
      if ((p.hp <= 0 && deathT >= DEATH_ANIM) || (p.hp > 0 && time >= MAX_TIME)) {
        removeEventListener('keydown', onKey);
        removeEventListener('keyup', onKey);
        removeEventListener('mousemove', onMouse);
        resolve({ time: Math.round(time * 10) / 10, kills, hero, boss: bossInfo, pierce: pierceCount, lowHp });
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
    const open = cardPool(hero, tier).filter(u => !u.max || (p.taken[u.id] || 0) < u.max);
    const cards = [];
    while (cards.length < 3 && open.length) cards.push(open.splice(Math.floor(random() * open.length), 1)[0]);
    const card = bot ? botPick(cards) : await choose(cards);
    card.apply(p);
    p.taken[card.id] = (p.taken[card.id] || 0) + 1;
    if (card.pierce) pierceCount++;
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
        hp: m.hp * hpScale(threat), dmg: m.dmg * dmgScale(threat), speed: m.speed, size: MOB_SIZE,
        hitT: -9, biting: false, phase: nextSpawn % 1 }); // phase: 몹마다 걷는 박자를 어긋나게
      nextSpawn += spawnInterval(threat);
    }
    if (!bossInfo && time >= BOSS_TIME) spawnBoss();
  }

  // 10분 보스. 조건을 가장 먼저 채운 슬라임, 하나도 못 채웠으면 프리즘 킹. 출현 난수는 쓰지 않는다
  function spawnBoss() {
    const met = Object.entries(condT).filter(([, t]) => t < Infinity).sort((a, b) => a[1] - b[1]);
    const key = met.length ? met[0][0] : 'prism';
    bossInfo = { key, killed: false };
    const threat = threatOf(time, killCount), hp = BOSS.hp * (1 + threat / 200);
    boss = { type: key, boss: true, x: p.x, y: p.y - SPAWN_RADIUS * 0.7, hp, maxHp: hp,
      dmg: BOSS.dmg * (1 + threat / 250), speed: BOSS.speed, size: BOSS.size, hitT: -9, biting: false, phase: 0 };
    mobs.push(boss);
  }

  function watch() {
    if (bossInfo) return;
    const s = { pierce: pierceCount, kills: killCount, lowHp };
    for (const k of Object.keys(condT)) if (condT[k] === Infinity && BOSS_RULES[k](s)) condT[k] = time;
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
      let mul = time < m.freezeT ? 0 : time < m.slowT ? 0.6 : 1;
      if (p.blizzard && d < 70) mul *= 0.7;
      m.x += ((p.x - m.x) / d) * m.speed * mul * dt;
      m.y += ((p.y - m.y) / d) * m.speed * mul * dt;
    }
  }

  // 공격 간격마다 영웅의 무기를 쓴다
  function shoot(dt) {
    p.reload -= dt;
    if (p.reload > 0) return;
    // 남은 시간을 버리지 않고 이어 붙인다. 버리면 프레임이 느릴수록 공격이 느려진다
    p.reload = Math.max(p.reload + p.cooldown, 0);
    p.shotT = time;
    if (bot) aim = nearestAngle() ?? aim;
    p.facing = Math.cos(aim) < 0 ? -1 : 1;
    if (DEF.weapon === 'bolt') {
      for (let i = 0; i < p.shots; i++) addBolt(aim + (i - (p.shots - 1) / 2) * SPREAD, p.damage, false);
    } else if (DEF.weapon === 'ring') {
      blast(p.x, p.y, p.radius, p.damage, 'fire');
    } else {
      bite(aim);
      if (p.clone) bite(aim + Math.PI);
    }
  }

  function addBolt(a, dmg, small) {
    bolts.push({ x: p.x, y: p.y, vx: Math.cos(a) * p.boltSpeed, vy: Math.sin(a) * p.boltSpeed,
      life: p.boltLife, pierce: small ? 0 : p.pierce, dmg, small, hit: new Set() });
  }

  // 둘레 r 안의 몹을 모두 친다 (용암 고리, 씨앗 폭탄, 분화)
  function blast(x, y, r, dmg, kind, except) {
    for (const m of mobs) if (m !== except && Math.hypot(m.x - x, m.y - y) < r + m.size) hitMob(m, dmg);
    fx.push({ kind, x, y, r, t: 0, life: 0.25 });
  }

  function bite(a) {
    for (const m of mobs) {
      if (Math.hypot(m.x - p.x, m.y - p.y) < p.range + m.size && angleGap(Math.atan2(m.y - p.y, m.x - p.x), a) < BITE_ARC) hitMob(m, p.damage);
    }
    fx.push({ kind: 'bite', x: p.x, y: p.y, r: p.range, a, t: 0, life: 0.15 });
  }

  function hitMob(m, dmg) {
    m.hp -= dmg;
    m.hitT = time;
    if (p.vine) m.slowT = time + 1.5;
    if (p.freeze && !m.boss) m.freezeT = time + 0.5;
    if (p.ember) m.burnT = time + 2;
    if (p.drain) p.hp = Math.min(p.maxHp, p.hp + p.drain);
  }

  // 시간마다 저절로 나가는 고유 카드 (꽃비·분화·그림자 걸음·밤의 장막). 처음 받으면 바로 한 번 나간다
  function skills() {
    if (p.bloom && !(time < p.bloomT)) { p.bloomT = time + 3; for (let i = 0; i < 8; i++) addBolt(i * Math.PI / 4, p.damage, true); }
    if (p.erupt && !(time < p.eruptT) && mobs.length) {
      p.eruptT = time + 2;
      const m = nearest();
      blast(m.x, m.y, 24, p.damage * 2, 'fire');
    }
    if (p.step && !(time < p.stepT)) { p.stepT = time + 4; p.x += Math.cos(aim) * 50; p.y += Math.sin(aim) * 50; }
    if (p.veil && !(time < p.veilT)) { p.veilT = time + 10; p.veilUntil = time + 1.5; }
  }

  // 봇의 이동: 가까운 몹에게서 멀어지고, 가까운 몹이 없으면 천천히 원을 그린다 (보통 플레이어 흉내).
  // 거리는 무기가 닿는 만큼만 둔다. 고리·물기 영웅이 80px씩 도망가면 한 대도 못 친다
  function botDodge() {
    const keep = DEF.weapon === 'ring' ? p.radius * 0.7 : DEF.weapon === 'bite' ? p.range * 0.8 : 80;
    let dx = 0, dy = 0;
    for (const m of mobs) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < keep) { dx += (p.x - m.x) / (d * d + 1); dy += (p.y - m.y) / (d * d + 1); }
    }
    return dx || dy ? [dx, dy] : [Math.cos(time / 3), Math.sin(time / 3)];
  }

  function nearest() {
    let best = null, bestD = Infinity;
    for (const m of mobs) {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }
  // 봇의 조준: 화면 안에 보스가 있으면 보스, 아니면 가장 가까운 몹 (사람도 보스를 먼저 노린다)
  function nearestAngle() {
    const m = boss && Math.hypot(boss.x - p.x, boss.y - p.y) < 180 ? boss : nearest();
    return m && Math.atan2(m.y - p.y, m.x - p.x);
  }

  function fly(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      const hit = mobs.find(m => !b.hit.has(m) && Math.abs(m.x - b.x) < m.size && Math.abs(m.y - b.y) < m.size);
      if (hit) {
        hitMob(hit, b.dmg);
        if (p.seed) blast(hit.x, hit.y, 20, b.dmg * 0.5, 'goo', hit);
        b.hit.add(hit);
        if (b.pierce-- <= 0) b.life = 0;
      }
      if (b.life > 0) continue;
      bolts.splice(i, 1);
      if (p.shard && !b.small) { // 두 갈래로 갈라지는 작은 고드름
        const a = Math.atan2(b.vy, b.vx);
        for (const d of [-0.6, 0.6]) bolts.push({ ...b, vx: Math.cos(a + d) * p.boltSpeed, vy: Math.sin(a + d) * p.boltSpeed, life: 0.3, pierce: 0, dmg: b.dmg * 0.5, small: true, hit: new Set(b.hit) });
      }
    }
    for (const m of mobs) if (time < m.burnT) m.hp -= p.damage * BURN * dt;
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      if (m.hp > 0) continue;
      corpses.push({ type: m.type, boss: m.boss, x: m.x, y: m.y, t: 0, flip: m.x > p.x ? -1 : 1 });
      if (m.boss) { bossInfo.killed = true; boss = null; gainXp(BOSS.xp); }
      else { kills[m.type]++; killCount++; gainXp(MOBS[m.type].xp); }
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
    const safe = time < p.veilUntil;
    for (const m of mobs) {
      m.biting = Math.abs(m.x - p.x) < m.size + 1 && Math.abs(m.y - p.y) < m.size + 1;
      if (!m.biting) continue;
      if (p.armor) m.hp -= p.damage * 1.5 * dt;
      if (!safe) { p.hp -= m.dmg * dt; p.hurtT = time; }
    }
    if (p.hp > 0 && p.hp <= p.maxHp * 0.2) lowHp = true;
  }

  function fade(dt) {
    for (let i = corpses.length - 1; i >= 0; i--) if ((corpses[i].t += dt) > 0.7) corpses.splice(i, 1);
    for (let i = fx.length - 1; i >= 0; i--) if ((fx[i].t += dt) > fx[i].life) fx.splice(i, 1);
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
    const t = now / 1000;
    for (const c of corpses) put(artOf(c).death, c.t, false, c.x - cx, c.y - cy, c.flip);
    for (const m of mobs) {
      const a = artOf(m), flip = m.x > p.x ? -1 : 1;
      // 맞은 순간은 하얗게, 붙어 있으면 공격 모션, 아니면 걷기. 공격해도 사라지지 않는다
      if (time - m.hitT < 0.08) put(a.hit, 0, false, m.x - cx, m.y - cy, flip);
      else put(m.biting ? a.attack : a.walk, t + m.phase, true, m.x - cx, m.y - cy, flip);
    }
    for (const f of fx) drawFx(f, f.x - cx, f.y - cy, t);
    for (const b of bolts) blit(ART.bolt[Math.floor(t * 8) % ART.bolt.length], b.x - cx, b.y - cy, 1, ART.bolt[0].width / 2, ART.bolt[0].height / 2, Math.atan2(b.vy, b.vx));
    if (time < p.veilUntil) ctx.globalAlpha = 0.45;
    drawPlayer(t);
    ctx.globalAlpha = 1;
    // 조준선: 마우스 방향을 짧게 보여 준다
    ctx.fillStyle = '#e8b04a';
    for (let r = 14; r <= 26; r += 4) ctx.fillRect(Math.round(W / 2 + Math.cos(aim) * r), Math.round(H / 2 + Math.sin(aim) * r), 1, 1);
  }

  function artOf(m) { return m.boss ? ART.bosses[m.type] : ART.mobs[m.type]; }

  // 고리와 폭발은 퍼지는 점선 원, 물기는 반달. 색은 영웅 속성을 따른다
  function drawFx(f, x, y, t) {
    const [c1, c2] = FX_COLORS[f.kind], k = f.t / f.life;
    if (f.kind === 'bite') {
      for (let a = -BITE_ARC; a <= BITE_ARC; a += 0.08) {
        for (const rr of [f.r * 0.6, f.r * 0.8, f.r]) {
          ctx.fillStyle = rr === f.r ? c2 : c1;
          ctx.fillRect(Math.round(x + Math.cos(f.a + a) * rr), Math.round(y + Math.sin(f.a + a) * rr), 1, 1);
        }
      }
      return;
    }
    const r = f.r * (0.4 + 0.6 * k), n = Math.max(12, Math.round(r * 1.2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.fillStyle = (i + Math.floor(t * 20)) % 3 ? c1 : c2;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.7), 2, 2);
    }
  }

  function drawPlayer(t) {
    const h = ART.hero, x = W / 2, y = H / 2;
    if (p.hp <= 0) return put(h.death, deathT, false, x, y, p.facing);
    // 맞는 동안은 하얀 번쩍임과 질끈 감은 눈을 번갈아
    if (time - p.hurtT < 0.12) return put(h.hit, Math.floor(t * 12) % 2 / h.hit.fps, false, x, y, p.facing);
    // 공격 모션은 공격 간격 안에 다 보여 준다 (공격 속도가 오르면 같이 빨라진다)
    const since = time - p.shotT, dur = Math.min(0.5, p.cooldown);
    if (since < dur) return put(h.attack, (since / dur) * h.attack.frames.length / h.attack.fps, false, x, y, p.facing);
    put(h.idle, t * (p.moving ? 2.5 : 1), true, x, y, p.facing);
  }

  // 애니메이션의 t초째 프레임을 기준점(몸 가운데)이 (x, y)에 오게 그린다
  function put(anim, t, loop, x, y, flip) {
    const n = anim.frames.length, i = Math.floor(t * anim.fps);
    blit(anim.frames[loop ? i % n : Math.min(n - 1, i)], x, y, flip, anim.ax, anim.ay);
  }

  function blit(img, x, y, flip, ax, ay, angle = 0) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (angle) ctx.rotate(angle);
    ctx.scale(flip, 1);
    ctx.drawImage(img, -ax, -ay);
    ctx.restore();
  }

  function drawHud() {
    const s = Math.floor(time);
    hud.time.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    hud.score.textContent = scoreOf(kills) + (bossInfo?.killed ? BOSSES[bossInfo.key].score : 0);
    hud.level.textContent = p.level;
    hud.threat.textContent = Math.floor(threatOf(time, killCount));
    hud.hp.style.width = `${Math.max(0, p.hp) / p.maxHp * 100}%`;
    if (!hud.boss) return; // 시뮬레이션에는 보스 막대가 없다
    hud.boss.hidden = !boss;
    if (boss) { hud.bossName.textContent = BOSSES[boss.type].name; hud.bossHp.style.width = `${Math.max(0, boss.hp) / boss.maxHp * 100}%`; }
  }
}
