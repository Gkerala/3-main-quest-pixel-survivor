# 슬라임 모션을 만든다. 실행: python design-ref/make_motions.py
# 1단계: 잘라 둔 그림(design-ref/cut) 한 장을 눌렀다 늘여 대기·이동(통통 튀기)·쓰러짐을 만든다.
# 2단계: 사용자가 준 시트(stage2-source.png)의 대기·이동 프레임을 잘라 쓰고, 쓰러짐만 첫 프레임으로 만든다.
# 3단계는 아직 없다.
# 결과: web/sprites/<캐릭터>/<모션>.png (가로 한 줄) + web/sprites/manifest.json
import json
import math
import os
from collections import deque

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CUT = os.path.join(HERE, 'cut')
OUT = os.path.join(HERE, '..', 'web', 'sprites')
ELEMENTS = ['none', 'fire', 'ice', 'lightning']
FPS = {1: {'idle': 6, 'move': 10, 'death': 8}, 2: {'idle': 8, 'move': 12, 'death': 8}}
LOOP = {'idle': True, 'move': True, 'death': False}
GROUND_MARGIN = 8  # 프레임 아래 여백(칸). 잘라 낼 때 사라진다
SOLID_ALPHA = 128  # 시트의 반투명 가장자리를 이 값 기준으로 끊는다
STAGE2_SCALE = 3  # 2단계 시트는 프레임이 약 40칸이라 이만큼 키워서 보여 준다 (1단계 약 120칸과 맞추기 위해서)

# 앞은 왼쪽. 프레임: (가로 배율, 세로 배율, 앞으로 기울기, 뜨는 높이, 번쩍임, 사라짐)
IDLE = [(1 + 0.035 * s, 1 - 0.045 * s, 0, 0, 0, 0) for s in (math.sin(i / 6 * math.tau) for i in range(6))]
# 통통 튀기: 착지에서 납작해졌다가 길게 늘어나며 높이 뜬다
HOP = [(1.2, 0.76, 0, 0, 0, 0), (0.88, 1.18, 0.16, 0.14, 0, 0), (0.92, 1.12, 0.14, 0.3, 0, 0),
       (1.0, 1.0, 0.06, 0.36, 0, 0), (1.0, 1.02, -0.04, 0.22, 0, 0), (0.96, 1.08, -0.08, 0.06, 0, 0)]
DEATH = [(1.08, 0.9, -0.06, 0, 0.6, 0), (1.18, 0.72, 0, 0, 0, 0), (1.3, 0.52, 0, 0, 0, 0), (1.44, 0.34, 0, 0, 0, 0),
         (1.58, 0.2, 0, 0, 0, 0.15), (1.68, 0.13, 0, 0, 0, 0.5), (1.76, 0.08, 0, 0, 0, 0.85)]

# 시트의 칸. 각 속성마다 [대기 두 줄], [이동 두 줄]의 (y0, y1, 칸 수)
COLUMNS = [2, 50, 97, 143, 189, 235, 283]  # 세로 칸 경계
SHEET = {
    'none': {'idle': [(97, 139, 6), (140, 184, 6)], 'move': [(207, 241, 6), (246, 269, 3)]},
    'fire': {'idle': [(288, 323, 6), (325, 371, 6)], 'move': [(393, 426, 6), (433, 462, 6)]},
    'ice': {'idle': [(483, 521, 6), (525, 567, 6)], 'move': [(588, 622, 6), (626, 661, 5)]},
    'lightning': {'idle': [(682, 723, 6), (727, 767, 6)], 'move': [(790, 826, 6), (834, 869, 5)]},
}
# 대기의 뒤쪽 프레임은 어두워지거나 줄어들어 반복하면 튄다. 앞쪽만 쓴다
IDLE_USE = {'none': 9, 'fire': 10, 'ice': 9, 'lightning': 9}


def place(src, canvas, fn):
    """빈 캔버스의 칸마다 fn(x, y)로 원본 자리를 찾아 찍는다 (가까운 칸을 고른다)"""
    h, w = canvas.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    sx, sy = fn(xs + 0.5, ys + 0.5)
    ix, iy = np.floor(sx).astype(int), np.floor(sy).astype(int)
    ok = (ix >= 0) & (iy >= 0) & (ix < src.shape[1]) & (iy < src.shape[0])
    picked = np.zeros((h, w, 4), 'uint8')
    picked[ok] = src[iy[ok], ix[ok]]
    on = picked[:, :, 3] > 0
    canvas[on] = picked[on]


def dissolve(a, amount, seed=3):
    if amount <= 0:
        return a
    a = a.copy()
    noise = np.random.default_rng(seed).random(a.shape[:2])
    a[:, :, 3][noise < amount] = 0
    return a


def flash(a, amount):
    if amount <= 0:
        return a
    a = a.copy()
    on = a[:, :, 3] > 0
    a[:, :, :3][on] = (a[:, :, :3][on] * (1 - amount) + 255 * amount).astype('uint8')
    return a


def canvas_size(w, h):
    return int(max(w, h) * 2.2) // 2 * 2


def warp_frames(src, table, size, anchor):
    """표의 값대로 몸을 눌렀다 늘인다. 바닥을 기준으로 변형한다"""
    h, w = src.shape[:2]
    ax, ay = anchor
    ground = np.where(src[:, :, 3].any(axis=1))[0].max() + 1
    cx = w / 2
    result = []
    for sx, sy, lean, lift, fl, dis in table:
        canvas = np.zeros((size, size, 4), 'uint8')
        up = lift * h
        def fn(x, y):
            ry = (ay - up - y) / sy  # 땅에서 위로 잰 원본 높이
            return (x - ax + lean * ry) / sx + cx, ground - ry  # 위로 갈수록 앞(왼쪽)으로 기운다
        place(src, canvas, fn)
        result.append(dissolve(flash(canvas, fl), dis))
    return result


def components(mask):
    """8방향으로 이어진 덩어리의 칸 목록"""
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    for sy, sx in zip(*np.where(mask)):
        if seen[sy, sx]:
            continue
        seen[sy, sx] = True
        q, cells = deque([(sy, sx)]), []
        while q:
            y, x = q.popleft()
            cells.append((y, x))
            for yy in range(max(0, y - 1), min(h, y + 2)):
                for xx in range(max(0, x - 1), min(w, x + 2)):
                    if mask[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        q.append((yy, xx))
        yield cells


def fill_enclosed(a, white):
    """시트에서 배경처럼 지워진 몸 안쪽 구멍을 메운다. 번개의 별 눈은 흰색이다"""
    a = a.copy()
    h, w = a.shape[:2]
    holes = a[:, :, 3] == 0
    for cells in components(holes):
        if any(y in (0, h - 1) or x in (0, w - 1) for y, x in cells) or len(cells) > 60:
            continue
        for y, x in cells:
            if white:
                a[y, x] = (255, 255, 255, 255)
            else:
                around = a[max(0, y - 2):y + 3, max(0, x - 2):x + 3]
                solid = around[around[:, :, 3] > 0]
                a[y, x] = (*solid[:, :3].mean(axis=0).astype('uint8'), 255) if len(solid) else (255, 255, 255, 255)
    return a


def cell_frame(sheet, x0, x1, y0, y1, white):
    """시트의 한 칸 → (반투명을 끊은 프레임, 본체의 좌우 가운데, 본체의 바닥)"""
    a = sheet[y0:y1, x0:x1].copy()
    a[:, :, 3] = np.where(a[:, :, 3] >= SOLID_ALPHA, 255, 0)
    main = max(components(a[:, :, 3] > 0), key=len)
    h, w = a.shape[:2]
    ys, xs = zip(*main)
    for cells in components(a[:, :, 3] > 0):  # 칸 경계에 걸친 옆 프레임의 조각을 지운다
        if cells is not main and len(cells) < len(main) and any(y in (0, h - 1) or x in (0, w - 1) for y, x in cells):
            for c in cells:
                a[c][3] = 0
    return fill_enclosed(a, white), (min(xs) + max(xs) + 1) / 2, max(ys) + 1


def sheet_frames(sheet, el, motion, size, anchor):
    """시트의 대기 또는 이동 프레임을 본체 바닥에 맞춰 캔버스에 놓는다"""
    frames = []
    for y0, y1, n in SHEET[el][motion]:
        for col in range(n):
            a, cx, bottom = cell_frame(sheet, COLUMNS[col], COLUMNS[col + 1], y0, y1, el == 'lightning')
            canvas = np.zeros((size, size, 4), 'uint8')
            ox, oy = round(anchor[0] - cx), anchor[1] - bottom
            place(a, canvas, lambda x, y: (x - ox, y - oy))
            frames.append(canvas)
    return frames


def stage1_motions(name):
    src = np.asarray(Image.open(os.path.join(CUT, name + '.png')).convert('RGBA'))
    size = canvas_size(*src.shape[1::-1])
    anchor = (size // 2, size - GROUND_MARGIN)
    return {'idle': warp_frames(src, IDLE, size, anchor), 'move': warp_frames(src, HOP, size, anchor), 'death': warp_frames(src, DEATH, size, anchor)}, anchor


def stage2_motions(sheet, el):
    size = 110  # 약 45칸 프레임이 쓰러지며 1.8배로 퍼져도 담긴다
    anchor = (size // 2, size - GROUND_MARGIN)
    idle = sheet_frames(sheet, el, 'idle', size, anchor)[:IDLE_USE[el]]
    move = sheet_frames(sheet, el, 'move', size, anchor)
    a, _, bottom = cell_frame(sheet, COLUMNS[0], COLUMNS[1], *SHEET[el]['idle'][0][:2], el == 'lightning')
    a = a[:bottom]
    # 뒤로 갔다가 되돌아와서(왕복) 이음매 없이 반복한다
    return {'idle': idle + idle[-2:0:-1], 'move': move + move[-2:0:-1], 'death': warp_frames(a, DEATH, size, anchor)}, anchor


def crop_all(motions, anchor):
    """모션 전체를 담는 가장 작은 칸으로 자른다. 기준점(발밑)은 함께 옮긴다"""
    frames = [f for fs in motions.values() for f in fs]
    any_on = np.any([f[:, :, 3] > 0 for f in frames], axis=0)
    ys, xs = np.where(any_on)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return {k: [f[y0:y1, x0:x1] for f in fs] for k, fs in motions.items()}, (int(anchor[0] - x0), int(anchor[1] - y0)), (int(x1 - x0), int(y1 - y0))


def main():
    sheet = np.asarray(Image.open(os.path.join(HERE, 'stage2-source.png')).convert('RGBA'))
    manifest = {}
    for el in ELEMENTS:
        for stage in (1, 2):
            name = f'{el}-{stage}'
            motions, anchor = stage1_motions(name) if stage == 1 else stage2_motions(sheet, el)
            motions, anchor, (w, h) = crop_all(motions, anchor)
            folder = os.path.join(OUT, name)
            os.makedirs(folder, exist_ok=True)
            info = {}
            for motion, frames in motions.items():
                strip = Image.new('RGBA', (w * len(frames), h))
                for i, f in enumerate(frames):
                    strip.paste(Image.fromarray(f, 'RGBA'), (i * w, 0))
                strip.save(os.path.join(folder, motion + '.png'))
                info[motion] = {'frames': len(frames), 'fps': FPS[stage][motion], 'loop': LOOP[motion]}
            # scale: 그릴 때 키우는 배율, facing: 이동 프레임이 향하는 쪽
            manifest[name] = {'w': w, 'h': h, 'ax': anchor[0], 'ay': anchor[1], 'scale': 1 if stage == 1 else STAGE2_SCALE,
                              'facing': 'left' if stage == 1 else 'right', 'motions': info}
            print(name, w, h, {k: v['frames'] for k, v in info.items()})
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
