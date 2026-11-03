// 슬라임 테마 도트 (초안). 그림을 코드로 만든다.
// 슬라임은 모양을 계산해서 그리고(눌림·늘어남·녹음을 숫자로 바꿀 수 있게), 적은 글자 도트로 그린다.
// 프레임 하나 = [{ g, x, y }] 레이어 목록. g는 { w, h, px } 픽셀 격자

const OUT = '#1a1024';
const WHITE = '#ffffff';

const grid = (w, h) => ({ w, h, px: new Array(w * h).fill(null) });
const set = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[(y | 0) * g.w + (x | 0)] = c; };
const get = (g, x, y) => (x >= 0 && y >= 0 && x < g.w && y < g.h ? g.px[y * g.w + x] : null);
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(g, x + i, y + j, c); };

// 글자 도트 → 격자. 줄 길이가 틀리면 바로 알린다
function fromRows(rows, pal) {
  const g = grid(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    if (row.length !== g.w) throw new Error(`도트 줄 길이가 다르다: ${y}번 줄 "${row}"`);
    [...row].forEach((ch, x) => { if (pal[ch]) set(g, x, y, pal[ch]); });
  });
  return g;
}

// 격자를 통째로 바꾸는 도구들
const map = (g, fn) => ({ ...g, px: g.px.map((c, i) => (c ? fn(c, i % g.w, (i / g.w) | 0) : null)) });
const flash = g => map(g, c => (c === OUT ? OUT : WHITE));
function shift(g, dx, dy) {
  const n = grid(g.w, g.h);
  g.px.forEach((c, i) => c && set(n, (i % g.w) + dx, ((i / g.w) | 0) + dy, c));
  return n;
}
function paste(dst, src, ox, oy) { src.px.forEach((c, i) => c && set(dst, ox + (i % src.w), oy + ((i / src.w) | 0), c)); return dst; }

// ── 슬라임 몸통 ──────────────────────────────────────────
// 영웅(16×16)은 손으로 찍은 기본형을 늘이고 줄인다. 얼굴과 장식은 늘인 뒤에 다시 찍어서 뭉개지지 않게 한다
const HERO_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......oooo......',
  '....oollbboo....',
  '...olsslbbbbo...',
  '..olsllbbbbbdo..',
  '..olbbbbbbbbdo..',
  '.olbbbbbbbbbbdo.',
  '.olbbbbbbbbbbdo.',
  '.olbbbbbbbbbbdo.',
  '.oddbbbbbbbbddo.',
  '..oddddddddddo..',
  '...oooooooooo...',
];

// 아래 가운데를 기준으로 가로 sx배, 세로 sy배 (가장 가까운 픽셀을 고른다)
function resample(g, sx, sy) {
  const n = grid(g.w, g.h), cx = g.w / 2, by = g.h - 1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = get(g, Math.floor((x + 0.5 - cx) / sx + cx), Math.round((y - by) / sy + by));
    if (c) set(n, x, y, c);
  }
  return n;
}

function face(g, pal, at, { eyes, mouth, k = 1 }) {
  const eye = pal.eye || OUT;
  at.eyes.forEach(([ex, ey], i) => {
    if (eyes === 'normal') { rect(g, ex, ey, 2 * k, 2 * k, eye); rect(g, ex, ey, k, k, pal.eyeShine || WHITE); }
    else if (eyes === 'angry') { rect(g, ex, ey, 2 * k, 2 * k, eye); rect(g, ex + (i ? 0 : k), ey, k, k, pal.eyeShine || WHITE); rect(g, ex, ey - k, 2 * k, k, OUT); }
    else if (eyes === 'squint' || eyes === 'dead') rect(g, ex, ey + (eyes === 'dead' ? k : 0), 2 * k, k, OUT); // 맞으면 질끈, 쓰러지면 ㅡㅡ
  });
  if (pal.blush && eyes !== 'dead') for (const [bx, by] of at.blush) rect(g, bx, by, k, k, pal.blush);
  const [mx, my] = at.mouth;
  if (mouth === 'smile') rect(g, mx, my, 2 * k, k, '#d0384a');
  else if (mouth === 'open') { rect(g, mx, my, 2 * k, 2 * k, '#5a1020'); rect(g, mx, my + k, 2 * k, k, '#d0384a'); }
  else if (mouth === 'teeth') { rect(g, mx - k, my, 4 * k, 2 * k, '#5a1020'); rect(g, mx - k, my, k, k, WHITE); rect(g, mx + 2 * k, my, k, k, WHITE); }
}

function slime16(pal, { sx = 1, sy = 1, dx = 0, eyes = 'normal', mouth = 'smile', hit = false, glow = 0, deco = true }) {
  const base = fromRows(HERO_ROWS, { o: OUT, l: pal.light, b: pal.base, d: pal.dark, s: pal.shine });
  const g = shift(resample(base, sx, sy), dx, 0);
  const fx = x => Math.round((x + 0.5 - 8) * sx + 8 - 0.5) + dx, fy = y => Math.round((y - 15) * sy + 15);
  face(g, pal, { eyes: [[fx(4), fy(10)], [fx(10), fy(10)]], blush: [[fx(3), fy(12)], [fx(12), fy(12)]], mouth: [fx(7), fy(12)] }, { eyes, mouth });
  if (deco) pal.deco?.(g, { c: 7 + dx, top: fy(5), glow });
  return hit ? flash(g) : g;
}

// 보스(32×32)는 칸이 넉넉해서 둥근 돔을 계산으로 그린다
function slime32(pal, { bw = 26, bh = 20, lift = 0, eyes = 'normal', mouth = 'smile', hit = false, deco = true }) {
  const s = 32, k = 2, g = grid(s, s);
  const cx = s / 2, bottom = s - 1 - lift, top = bottom - bh + 1;
  const ry = bh * 0.62, ecy = top + ry;
  const inside = (x, y) => {
    if (y < top || y > bottom) return false;
    let hw = bw / 2;
    if (y < ecy) { const d = (ecy - y - 0.5) / ry; hw *= Math.sqrt(Math.max(0, 1 - d * d)); }
    if (y === bottom) hw -= 2; else if (y === bottom - 1) hw -= 1;
    return Math.abs(x + 0.5 - cx) <= hw;
  };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    const u = (x + 0.5 - cx) / (bw / 2), v = (y - top) / bh;
    let c = pal.base;
    if (v > 0.82 || u > 0.66) c = pal.dark;
    else if (u < -0.2 && v < 0.55) c = pal.light;
    set(g, x, y, edge ? OUT : c);
  }
  // 수정 면: 몸 안에만 짧은 빛줄기
  const inBody = (x, y) => { const c = get(g, x, y); return c && c !== OUT; };
  for (const [x0, y0, len, col] of [[cx - 9, top + 5, 6, pal.shine], [cx + 3, top + 4, 5, pal.light], [cx - 2, top + 12, 4, pal.light]]) {
    for (let i = 0; i < len; i++) if (inBody(x0 + i, y0 + i)) set(g, x0 + i, y0 + i, col);
  }
  rect(g, cx - 8, top + 3, 3, 1, pal.shine); rect(g, cx - 8, top + 4, 1, 1, pal.shine);
  const ey = Math.round(top + bh * 0.46);
  face(g, pal, { eyes: [[cx - 8, ey], [cx + 4, ey]], blush: [[cx - 11, ey + 5], [cx + 9, ey + 5]], mouth: [cx - 2, ey + 5] }, { eyes, mouth, k });
  if (deco) pal.deco?.(g, { c: cx - 1, top, k });
  return hit ? flash(g) : g;
}

// 녹아내리는 쓰러짐: 낮아지고 넓어지다가 웅덩이만 남는다
function meltFrames(pal, big) {
  const one = g => [{ g, x: 0, y: 0 }];
  if (big) {
    return [
      one(slime32(pal, { eyes: 'squint', mouth: 'open' })),
      one(slime32(pal, { bw: 28, bh: 15, eyes: 'dead', mouth: 'none' })),
      one(slime32(pal, { bw: 30, bh: 9, eyes: 'dead', mouth: 'none', deco: false })),
      one(puddle(32, pal, 30)),
    ];
  }
  const f = [
    slime16(pal, { sy: 0.9, eyes: 'squint', mouth: 'open' }),
    slime16(pal, { sx: 1.08, sy: 0.7, eyes: 'dead', mouth: 'none' }),
    slime16(pal, { sx: 1.14, sy: 0.45, eyes: 'dead', mouth: 'none', deco: false }),
    puddle(16, pal, 14),
  ];
  // 튀는 방울
  set(f[1], 1, 8, pal.light); set(f[1], 14, 9, pal.base);
  set(f[2], 0, 11, pal.base); set(f[2], 15, 12, pal.light);
  return f.map(one);
}
function puddle(s, pal, w) {
  const g = grid(s, s), k = s / 16, x0 = Math.round(s / 2 - w / 2);
  rect(g, x0 + 2 * k, s - 2 * k, w - 4 * k, k, OUT);
  rect(g, x0, s - k, w, k, OUT);
  rect(g, x0 + k, s - k, w - 2 * k, k, pal.dark);
  rect(g, x0 + 2 * k, s - k, 2 * k, k, pal.light);
  return g;
}

// ── 공격 이펙트 ─────────────────────────────────────────
function gooBall(pal, wobble) {
  const g = grid(8, 8);
  const w = wobble ? 6 : 5, h = wobble ? 4 : 5, x0 = (8 - w) >> 1, y0 = (8 - h) >> 1;
  rect(g, x0, y0, w, h, OUT);
  rect(g, x0 + 1, y0 + 1, w - 2, h - 2, pal.base);
  set(g, x0 + 1, y0 + 1, pal.shine);
  set(g, x0 - 2, 4, pal.light); set(g, x0 - 4, 3, pal.dark); // 꼬리 방울
  return g;
}
function icicle(len) {
  const g = grid(16, 6);
  for (let i = 0; i < len; i++) {
    const half = i < len - 3 ? 1 : i < len - 1 ? 1 : 0;
    rect(g, i, 3 - half - 1, 1, half * 2 + 2, OUT);
  }
  for (let i = 1; i < len - 1; i++) set(g, i, 2, '#bff0ff'), set(g, i, 3, '#6cc6ee');
  set(g, len - 2, 2, WHITE);
  for (let i = 0; i < 3; i++) set(g, i - 2 + (len % 3), 0 + i * 2, '#bff0ff'); // 얼음 가루
  return g;
}
function fireRing(r, flicker) {
  const g = grid(40, 40);
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    const x = 20 + Math.cos(t) * r, y = 20 + Math.sin(t) * r * 0.6;
    const hot = (a + flicker) % 4 === 0;
    set(g, x, y, hot ? '#fff07a' : '#ff8a2a');
    set(g, x, y - 1, (a + flicker) % 3 ? '#e04a1a' : '#ffb84a');
    if ((a + flicker) % 5 === 0) set(g, x, y - 2, '#ffd84a');
  }
  return g;
}
function shadowBite(step) {
  const g = grid(16, 16);
  const from = -1.2 + step * 0.5, to = from + 1.4;
  for (let t = from; t < to; t += 0.05) {
    for (let r = 5; r <= 7; r++) set(g, 4 + Math.cos(t) * r, 8 + Math.sin(t) * r, r === 7 ? '#2a1040' : r === 6 ? '#8a4ad0' : '#d8a8ff');
  }
  if (step === 1) { rect(g, 9, 6, 1, 2, WHITE); rect(g, 11, 8, 1, 2, WHITE); rect(g, 9, 10, 1, 2, WHITE); } // 이빨 자국
  return g;
}
function shards(r) {
  const g = grid(48, 48);
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2, x = 24 + Math.cos(t) * r, y = 24 + Math.sin(t) * r;
    set(g, x, y - 1, OUT); set(g, x - 1, y, OUT); set(g, x + 1, y, OUT); set(g, x, y + 1, OUT);
    set(g, x, y, i % 2 ? '#f0d8ff' : '#a8f0ff');
  }
  return g;
}

// ── 슬라임 정의 ─────────────────────────────────────────
// 장식은 머리 위 가운데(c = 가운데 두 칸 중 왼쪽)를 기준으로 찍는다
const deco = {
  sprout: (g, { c, top }) => {
    set(g, c + 1, top - 1, '#3a7a1a'); set(g, c + 1, top - 2, '#3a7a1a');
    rect(g, c + 2, top - 3, 2, 1, '#8ae04a'); set(g, c + 2, top - 2, '#5ab82a'); rect(g, c - 1, top - 3, 2, 1, '#5ab82a');
  },
  frost: (g, { c, top, glow }) => {
    const tip = glow ? WHITE : '#dff8ff';
    for (const [x, h] of [[c - 3, 2], [c, 3 + glow], [c + 1, 3 + glow], [c + 4, 2]]) {
      for (let i = 1; i <= h; i++) set(g, x, top + 1 - i, i === h ? tip : '#8ad8f8');
    }
  },
  magma: (g, { c, top, glow }) => {
    const hot = glow ? '#fff07a' : '#ffd84a';
    for (const [x, y] of [[c - 3, 3], [c - 2, 4], [c + 3, 2], [c + 2, 3], [c + 2, 4]]) set(g, x, top + y, hot);
    if (glow) for (const [x, y] of [[c, -1], [c + 1, -2], [c - 2, -1], [c + 3, -1]]) set(g, x, top + y, y === -2 ? '#ffd84a' : '#ff8a2a');
  },
  shade: (g, { c, top, glow }) => {
    set(g, c, top - 1, '#3a2060'); set(g, c + 1, top - 2, '#3a2060'); set(g, c + 1, top - 3, '#5a3a90'); set(g, c, top - 4, '#5a3a90');
    if (glow) { set(g, c - 5, top + 2, '#b07ad0'); set(g, c + 6, top + 3, '#b07ad0'); set(g, c - 4, top, '#7a4ab8'); }
  },
  prism: (g, { c, top }) => { // 왕관: 몸 꼭대기에 걸쳐 앉는다
    const x = c - 6, y = top - 4;
    rect(g, x, y + 3, 14, 3, OUT);
    for (const ox of [0, 6, 12]) { rect(g, x + ox, y - 1, 2, 4, OUT); rect(g, x + ox, y, 2, 4, '#ffd84a'); }
    rect(g, x + 1, y + 3, 12, 1, '#ffd84a');
    rect(g, x + 1, y + 4, 12, 1, '#e8a020');
    rect(g, x + 6, y + 4, 2, 1, '#d0384a'); set(g, x + 2, y + 4, '#6af0ff'); set(g, x + 11, y + 4, '#6af0ff');
  },
};

const PAL = {
  sprout: { base: '#5ac83a', light: '#9af05a', dark: '#2e8a2a', shine: '#e8ffd0', blush: '#ff8aa0', deco: deco.sprout },
  frost: { base: '#4ab8f0', light: '#9ae0ff', dark: '#2a6ac0', shine: WHITE, blush: '#ff9ab8', deco: deco.frost },
  magma: { base: '#f07a2a', light: '#ffb84a', dark: '#b03a1a', shine: '#fff0b0', eye: '#4a1008', eyeShine: '#ffd84a', deco: deco.magma },
  shade: { base: '#4a2a80', light: '#7a4ab8', dark: '#2a1450', shine: '#c8a8ff', eye: '#ff3a4a', eyeShine: '#ffd0d0', deco: deco.shade },
  prism: { base: '#d0c8ee', light: '#f0ecff', dark: '#9484c8', shine: WHITE, blush: '#ffa8c8', deco: deco.prism },
};

// 슬라임 한 마리의 애니메이션 세트. at은 몸을 놓을 자리 (이펙트가 둘레로 퍼지는 슬라임만 가운데로 옮긴다)
function slimeSet(key, attack, { big = false, at = [0, 0] } = {}) {
  const pal = PAL[key], draw = big ? slime32 : slime16;
  const body = o => [{ g: draw(pal, o), x: at[0], y: at[1] }];
  const hitPose = big ? { bw: 28, bh: 17 } : { sx: 1.1, sy: 0.82 };
  return {
    idle: { fps: 4, frames: [body({}), body(big ? { bw: 27, bh: 19 } : { sx: 1.07, sy: 0.92 })] },
    attack: { fps: 8, frames: attack(body, pal) },
    hit: { fps: 8, frames: [body({ hit: true, ...hitPose, eyes: 'squint', mouth: 'open' }), body({ ...hitPose, eyes: 'squint', mouth: 'open' }), body({})] },
    death: { fps: 6, frames: meltFrames(pal, big).map(f => f.map(l => ({ ...l, x: at[0], y: at[1] }))) },
  };
}

export const HEROES = [
  {
    key: 'sprout', name: '새싹 슬라임', role: '기본 영웅', attack: '점액탄: 마우스 쪽으로 점액 덩어리를 뱉는다 (지금 게임의 공격)',
    anims: slimeSet('sprout', (body, pal) => [
      body({ sx: 1.14, sy: 0.8 }), // 움츠리기
      body({ sx: 0.9, sy: 1.12, mouth: 'open' }), // 늘어나며 뱉기
      [...body({ sx: 0.95, sy: 1.05, mouth: 'open' }), { g: gooBall(pal, 0), x: 14, y: 6 }],
      [...body({}), { g: gooBall(pal, 1), x: 22, y: 6 }],
    ]),
  },
  {
    key: 'frost', name: '서리 슬라임', role: '관통형', attack: '고드름: 길고 빠른 얼음창이 적 여러 마리를 뚫는다',
    anims: slimeSet('frost', body => [
      body({ glow: 1, sx: 1.07, sy: 0.88 }),
      body({ glow: 1, dx: 1, mouth: 'open' }),
      [...body({ dx: 1, mouth: 'open' }), { g: icicle(10), x: 14, y: 8 }],
      [...body({}), { g: icicle(14), x: 21, y: 8 }],
    ]),
  },
  {
    key: 'magma', name: '용암 슬라임', role: '범위형', attack: '화염 고리: 몸이 부풀었다가 둘레로 불길을 퍼뜨린다',
    anims: slimeSet('magma', body => [
      body({ glow: 1, sx: 1.12, sy: 1.08, eyes: 'angry' }),
      [{ g: fireRing(8, 0), x: 0, y: 0 }, ...body({ glow: 1, sx: 1.1, sy: 0.85, mouth: 'open' })],
      [{ g: fireRing(13, 1), x: 0, y: 0 }, ...body({ glow: 1 })],
      [{ g: fireRing(17, 2), x: 0, y: 0 }, ...body({})],
    ], { at: [12, 12] }),
  },
  {
    key: 'shade', name: '그림자 슬라임', role: '근접형', attack: '그림자 물기: 앞으로 튀어 나가며 반달 모양으로 물어뜯는다',
    anims: slimeSet('shade', body => [
      body({ eyes: 'angry', sx: 1.1, sy: 0.85, glow: 1 }),
      [...body({ eyes: 'angry', dx: 2, mouth: 'teeth', sx: 1.1, sy: 0.9 }), { g: shadowBite(0), x: 12, y: 0 }],
      [...body({ eyes: 'angry', dx: 2, mouth: 'teeth', sx: 1.1, sy: 0.9 }), { g: shadowBite(1), x: 12, y: 0 }],
      [...body({ eyes: 'angry', dx: 1 }), { g: shadowBite(2), x: 12, y: 0 }],
    ]),
  },
];

export const BOSS = {
  key: 'prism', name: '프리즘 킹', role: '10분 보스 (32×32)', attack: '수정 폭발: 크게 눌렸다가 튀어 오르며 수정 조각을 여덟 방향으로 쏜다',
  anims: slimeSet('prism', body => [
    body({ bw: 30, bh: 15, eyes: 'angry' }),
    body({ bw: 22, bh: 23, lift: 4, eyes: 'angry', mouth: 'open' }),
    [{ g: shards(12), x: 0, y: 0 }, ...body({ eyes: 'angry', mouth: 'open' })],
    [{ g: shards(20), x: 0, y: 0 }, ...body({})],
  ], { big: true, at: [8, 8] }),
};

// ── 적: 슬라임을 사냥하러 온 숲의 무리 ─────────────────
const EP = {
  k: OUT, w: '#f4ece0', W: WHITE, y: '#ffd84a', r: '#c83c4a', R: '#ee6a6a',
  s: '#e8d6b0', S: '#b89c78', p: '#4a2a6a', P: '#8a5ab0', q: '#b88ad8',
  m: '#7d8699', M: '#c4cbd8', c: '#2f5d7c', C: '#4f9bb3', b: '#8a5a2a',
  o: '#6e6458', O: '#a89880', g: '#4c8a2a', G: '#8ac84a', t: '#6af0ff',
};

const ENEMY_ROWS = {
  slime: [ // 포자버섯 (키는 그대로 slime)
    '................',
    '.....kkkkkk.....',
    '...kkrrRRrrkk...',
    '..krrwwRRrrrrk..',
    '.krrrwwrrrwwrrk.',
    '.krrrrrrrrwwrrk.',
    'krrwwrrrrrrrrrrk',
    'krrwwrrrrrrRrrrk',
    '.kkrrrrrrrrrrkk.',
    '...kkkkkkkkkk...',
    '....kssssssk....',
    '....kskssksk....',
    '....kssssssk....',
    '....kssssSSk....',
    '....kkk..kkk....',
    '................',
  ],
  bat: [
    '................',
    '................',
    '.k............k.',
    '.kk...k..k...kk.',
    '.kpk..kkkk..kpk.',
    '.kppk.kPPk.kppk.',
    '.kpppkPPPPkpppk.',
    '.kppPPyPPyPPppk.',
    '..kpPPPPPPPPpk..',
    '..kppkPWWPkppk..',
    '...kk.kPPk.kk...',
    '.......kk.......',
    '................',
    '................',
    '................',
    '................',
  ],
  knight: [ // 슬라임 사냥꾼. 칼은 코드로 그린다
    '................',
    '.....kkkkkk.....',
    '....kMMMMMMk.r..',
    '...kMMmmmmMMkr..',
    '...kMkkkkkkMk...',
    '...kMktkktkMk...',
    '...kMMmmmmMMk...',
    '....kkkkkkkk....',
    '...kcCCCCCCck...',
    '..kMcCcyycCcMk..',
    '..kMkcccccckMk..',
    '..kk.kbbbbk.kk..',
    '....kcckkcck....',
    '....kmk..kmk....',
    '...kkmk..kmkk...',
    '...kkkk..kkkk...',
  ],
  golem: [
    '................',
    '....kkkkkkkk....',
    '...kOOOOgGOOk...',
    '..kOoooooooOOk..',
    '..kOoktookttOk..',
    '..kOooooooooOk..',
    '.kkkOOooooOOkkk.',
    'kOOkkkkkkkkkkOOk',
    'kOgokOOOOOOkoOOk',
    'kOookOooGoOkooOk',
    'kOookOooooOkogOk',
    '.kkkkOooooOkkkk.',
    '....kOOOOOOk....',
    '...kOook.kOOok..',
    '..kOOOok.kOOOOk.',
    '..kkkkkk.kkkkkk.',
  ],
};
const BAT_DOWN = [ // 날개를 내린 박쥐
  '................',
  '................',
  '................',
  '................',
  '......kkkk......',
  '......kPPk......',
  '.....kPPPPk.....',
  '..kkkPyPPyPkkk..',
  '.kpppPPPPPPpppk.',
  'kppppkPWWPkppppk',
  'kpk.kkPPPPkk.kpk',
  'kk....kPPk....kk',
  '.......kk.......',
  '................',
  '................',
  '................',
];
const LEGS_ALT = {
  slime: ['....kk....kk....'],
  knight: ['....kmk..kmk....', '....kmk...kmkk..', '....kkk...kkkk..'],
  golem: ['...kOook..kOOok.', '..kOOOok..kOOOOk', '..kkkkkk..kkkkkk'],
};

// 쓰러짐: 하얗게 번쩍 → 픽셀이 부서져 흘러내린다 (모든 적 공통)
function crumble(g) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const frames = [flash(g)];
  for (let t = 1; t <= 3; t++) {
    const n = grid(g.w, g.h);
    g.px.forEach((c, i) => {
      if (!c || rnd() < t * 0.28) return;
      const x = i % g.w, y = (i / g.w) | 0;
      set(n, x + Math.round((rnd() - 0.5) * t), Math.min(g.h - 1, y + t * 2), t === 3 ? '#8a8a7a' : c);
    });
    frames.push(n);
  }
  return frames.map(f => [{ g: f, x: 0, y: 0 }]);
}

function sword(angle) { // 손(9,10) 근처에서 뻗는 칼
  const g = grid(24, 24);
  const ox = 13, oy = 14;
  for (let i = 2; i < 10; i++) set(g, ox + Math.cos(angle) * i, oy + Math.sin(angle) * i, i < 3 ? '#8a5a2a' : i === 9 ? WHITE : '#dfe6f0');
  set(g, ox + Math.cos(angle + 1.57) * 1 + Math.cos(angle) * 3, oy + Math.sin(angle + 1.57) + Math.sin(angle) * 3, '#ffd84a');
  return g;
}
function swingArc() {
  const g = grid(24, 24);
  for (let t = -1.3; t < 0.6; t += 0.06) set(g, 13 + Math.cos(t) * 10, 14 + Math.sin(t) * 10, '#ffffffcc');
  return g;
}
function spores(step) {
  const g = grid(24, 24);
  [[5, 6], [12, 3], [18, 7], [8, 1], [16, 0]].forEach(([x, y], i) => {
    if (i > step + 2) return;
    const yy = y + 4 - step * 2;
    set(g, x, yy, '#e8f0a0'); set(g, x + 1, yy, '#c8d870'); set(g, x, yy + 1, '#c8d870');
  });
  return g;
}
function shockwave(r) {
  const g = grid(40, 24);
  for (let t = 0; t < Math.PI * 2; t += 0.08) {
    const x = 20 + Math.cos(t) * r, y = 19 + Math.sin(t) * r * 0.3;
    if (y >= 17) set(g, x, y, r % 2 ? '#c8b898' : '#e8dcc0');
  }
  for (let i = 0; i < r / 3; i++) set(g, 20 - r + i * 3, 16 - (i % 2), '#a89880'); // 튀는 돌
  return g;
}

function enemySet(key) {
  const base = fromRows(ENEMY_ROWS[key], EP);
  const alt = LEGS_ALT[key] ? fromRows(ENEMY_ROWS[key].slice(0, 16 - LEGS_ALT[key].length).concat(LEGS_ALT[key]), EP) : null;
  const one = (g, x = 0, y = 0) => [{ g, x, y }];
  let walk, attack, stage;
  if (key === 'bat') { // 날개를 접었다 폈다
    const down = fromRows(BAT_DOWN, EP);
    stage = [24, 20];
    walk = [one(base, 4, 2), one(down, 4, 2)];
    const bite = fromRows(ENEMY_ROWS.bat.map((r, y) => (y === 9 ? '..kppkWkkWkppk..' : r)), EP);
    attack = [one(base, 4, 0), one(bite, 6, 3), one(bite, 8, 4), one(base, 4, 2)];
  } else if (key === 'knight') {
    stage = [24, 24];
    walk = [[{ g: sword(-1.2), x: 0, y: 0 }, { g: base, x: 4, y: 4 }], [{ g: sword(-1.2), x: 0, y: 1 }, { g: alt, x: 4, y: 4 }]];
    attack = [
      [{ g: sword(-2.2), x: 0, y: 0 }, { g: base, x: 4, y: 4 }],
      [{ g: base, x: 4, y: 4 }, { g: sword(-0.5), x: 0, y: 0 }, { g: swingArc(), x: 0, y: 0 }],
      [{ g: base, x: 5, y: 4 }, { g: sword(0.6), x: 1, y: 0 }],
      [{ g: sword(-1.2), x: 0, y: 0 }, { g: base, x: 4, y: 4 }],
    ];
  } else if (key === 'golem') {
    stage = [40, 24];
    walk = [one(base, 12, 4), one(alt, 12, 4)];
    attack = [one(base, 12, 1), one(base, 12, 0), [{ g: shift(base, 0, 1), x: 12, y: 4 }, { g: shockwave(8), x: 0, y: 0 }], [{ g: base, x: 12, y: 4 }, { g: shockwave(16), x: 0, y: 0 }]];
  } else {
    stage = [24, 24];
    walk = [one(base, 4, 6), one(alt, 4, 6)];
    attack = [one(shift(base, 0, 1), 4, 6), [{ g: base, x: 4, y: 5 }, { g: spores(0), x: 0, y: 0 }], [{ g: base, x: 4, y: 6 }, { g: spores(1), x: 0, y: 0 }], [{ g: base, x: 4, y: 6 }, { g: spores(2), x: 0, y: 0 }]];
  }
  const st = stage || [16, 16];
  const ox = (st[0] - 16) >> 1, oy = { slime: 6, bat: 2, knight: 4, golem: 4 }[key];
  return {
    stage: st,
    body: [ox, oy], // 몸(16×16)이 놓인 자리. 게임에서 기준점으로 쓴다
    anims: {
      walk: { fps: 4, frames: walk },
      attack: { fps: 8, frames: attack },
      hit: { fps: 8, frames: [one(flash(base), ox - 1, oy), one(base, ox - 1, oy), one(base, ox, oy)] },
      death: { fps: 6, frames: crumble(base).map(f => [{ ...f[0], x: ox, y: oy }]) },
    },
  };
}

export const ENEMIES = [
  { key: 'slime', name: '포자버섯', role: '첫 적 · 느리고 약함', attack: '포자 뿜기: 몸을 웅크렸다 포자를 뿜는다', ...enemySet('slime') },
  { key: 'bat', name: '동굴박쥐', role: '빠름', attack: '급강하 물기: 위로 솟았다가 이빨을 드러내며 덮친다', ...enemySet('bat') },
  { key: 'knight', name: '슬라임 사냥꾼', role: '단단함', attack: '내려베기: 칼을 들었다가 반원을 그리며 벤다', ...enemySet('knight') },
  { key: 'golem', name: '바위 골렘', role: '가장 강함', attack: '땅 내려치기: 몸을 들었다 내리찍어 충격파를 낸다', ...enemySet('golem') },
];

// 격자 → 캔버스 (게임에서도 이 함수로 한 번만 굽고 복사해서 쓴다)
export function bake(g) {
  const c = document.createElement('canvas');
  c.width = g.w; c.height = g.h;
  const x = c.getContext('2d');
  g.px.forEach((col, i) => { if (col) { x.fillStyle = col; x.fillRect(i % g.w, (i / g.w) | 0, 1, 1); } });
  return c;
}
// 게임용 묶음: 애니메이션마다 프레임 캔버스, fps, 기준점(ax, ay = 몸 가운데).
// 처음 부를 때 한 번만 굽는다. 영웅은 몸 레이어만 쓴다 (탄은 게임이 따로 날린다)
let art = null;
export function gameArt() {
  if (art) return art;
  const flatten = (anim, onlyBody, ax, ay) => {
    const frames = anim.frames.map(f => (onlyBody ? f.slice(0, 1) : f));
    let w = 0, h = 0;
    for (const f of frames) for (const l of f) { w = Math.max(w, l.x + l.g.w); h = Math.max(h, l.y + l.g.h); }
    return { fps: anim.fps, ax, ay, frames: frames.map(f => bake(f.reduce((g, l) => paste(g, l.g, l.x, l.y), grid(w, h)))) };
  };
  const hero = HEROES[0];
  art = {
    hero: Object.fromEntries(Object.entries(hero.anims).map(([k, a]) => [k, flatten(a, true, 8, 10)])),
    mobs: Object.fromEntries(ENEMIES.map(e => [e.key, Object.fromEntries(Object.entries(e.anims)
      .map(([k, a]) => [k, flatten(a, false, e.body[0] + 8, e.body[1] + 8)]))])),
    goo: [0, 1].map(i => bake(gooBall(PAL.sprout, i))),
  };
  return art;
}
