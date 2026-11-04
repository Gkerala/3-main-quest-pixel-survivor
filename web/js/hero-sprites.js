// 영웅 그림: web/sprites의 가로 줄 그림을 프레임으로 잘라 게임에서 쓸 크기로 한 번만 굽는다.
// 게임 캔버스가 RENDER_SCALE배로 촘촘하므로, 몹(16칸)보다 훨씬 세밀한 영웅 그림을 그대로 보여 줄 수 있다

export const RENDER_SCALE = 4; // 게임 픽셀 1칸 = 캔버스 4칸
const ELEMENT = { sprout: 'none', frost: 'ice', magma: 'fire', shade: 'lightning' };
const LAST_STAGE = 2; // 3단계 그림은 미구현이라 3단계도 2단계 그림을 쓴다
// real: 원본 1칸 = 캔버스 몇 칸. 1단계 약 120칸은 줄이고, 2단계 약 40칸은 2배로 키운다
// body: 원본에서 몸의 폭·높이 (쓰러질 때 퍼지는 여백을 빼고 중심을 잡기 위해서)
const STAGE = { 1: { real: 0.72, body: [125, 100] }, 2: { real: 2, body: [66, 40] } };

const art = {};

function loadImage(src) {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => no(new Error(`그림을 읽지 못함: ${src}`));
    im.src = src;
  });
}

function bake(strip, info, def, real) {
  const frames = [], w = info.w * real, h = info.h * real;
  for (let i = 0; i < def.frames; i++) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = real < 1; // 줄일 때만 부드럽게. 키울 때는 도트 칸을 지킨다
    g.imageSmoothingQuality = 'high';
    g.drawImage(strip, i * info.w, 0, info.w, info.h, 0, 0, w, h);
    frames.push(c);
  }
  return frames;
}

// 처음 한 번 부른다. 실패하면 heroArt가 null을 돌려주고 게임은 기존 그림으로 돈다
export async function loadHeroSprites() {
  const res = await fetch('sprites/manifest.json');
  if (!res.ok) throw new Error(`manifest.json 응답 ${res.status}`);
  const manifest = await res.json();
  await Promise.all(Object.entries(ELEMENT).flatMap(([hero, el]) => [1, 2].map(async stage => {
    const info = manifest[`${el}-${stage}`], { real, body } = STAGE[stage], anims = {};
    await Promise.all(Object.entries(info.motions).map(async ([motion, def]) => {
      anims[motion] = {
        frames: bake(await loadImage(`sprites/${el}-${stage}/${motion}.png`), info, def, real),
        fps: def.fps,
        ax: info.ax * real,
        ay: (info.ay - body[1] / 2) * real, // 기준점은 몸 가운데
        scale: 1 / RENDER_SCALE,
        flip: info.facing === 'left' ? -1 : 1, // 왼쪽을 보는 그림은 오른쪽으로 갈 때 뒤집는다
        fit: 1 / (Math.max(...body) * real), // 칸에 맞춰 그릴 때의 배율
      };
    }));
    art[`${hero}:${stage}`] = anims;
  })));
}

export const heroArt = (hero, tier) => art[`${hero}:${Math.min(tier, LAST_STAGE)}`] ?? null;
