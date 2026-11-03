// 시작·대기 화면 뒤에서 몹이 천천히 지나가는 배경. 게임과 같은 바닥과 도트를 쓴다
import { gameArt } from './slime-art.js';

const W = 320, H = 180, TILE = 32, COUNT = 14;
const TYPES = ['hero', 'slime', 'bat', 'knight', 'golem'];

export function startBackdrop(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const art = gameArt();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobs = Array.from({ length: COUNT }, (_, i) => ({
    type: TYPES[i % TYPES.length], phase: i,
    x: Math.random() * W, y: 20 + Math.random() * (H - 40),
    vx: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 10),
  }));
  let last = performance.now(), running = true;

  function draw(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let ty = 0; ty * TILE < H; ty++) {
      for (let tx = 0; tx * TILE < W; tx++) {
        ctx.fillStyle = (tx + ty) & 1 ? '#23302a' : '#26352d';
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    for (const m of mobs) {
      m.x += m.vx * dt;
      if (m.x < -16) m.x = W + 16; else if (m.x > W + 16) m.x = -16;
      ctx.save();
      ctx.translate(Math.round(m.x), Math.round(m.y));
      ctx.scale(m.vx > 0 ? -1 : 1, 1);
      const a = m.type === 'hero' ? art.hero.idle : art.mobs[m.type].walk;
      ctx.drawImage(a.frames[(Math.floor(now / 250) + m.phase) % a.frames.length], -a.ax, -a.ay);
      ctx.restore();
    }
    if (running && !still) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // 게임 중에는 멈춰 둔다 (게임 캔버스와 같이 돌 필요가 없다)
  return {
    pause() { running = false; },
    resume() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(draw); },
  };
}
