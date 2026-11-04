# 받은 4속성 × 3단계 그림(roster-source.webp)에서 12캐릭터를 잘라 투명 배경 PNG로 만든다.
# 실행: python design-ref/slice_roster.py
import os
from collections import deque

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'cut')
WHITE_MIN = 232  # 이보다 밝고 무채색이면 배경 후보
# 칸 경계 (x0, y0, x1, y1): 원본 1024×683 기준. 글자와 옆 칸을 피해 눈으로 잡았다
BOXES = {
    'none-1': (225, 105, 370, 225), 'none-2': (395, 60, 620, 215), 'none-3': (610, 40, 810, 225),
    'fire-1': (225, 275, 370, 390), 'fire-2': (390, 235, 625, 395), 'fire-3': (735, 210, 1005, 420),
    'ice-1': (225, 405, 370, 540), 'ice-2': (395, 390, 620, 533), 'ice-3': (640, 352, 815, 552),
    'lightning-1': (225, 555, 370, 675), 'lightning-2': (405, 538, 615, 683), 'lightning-3': (720, 440, 1024, 675),
}
# 윤곽 안에 갇힌 흰 배경을 지울 최소 넓이. 갑옷의 작은 흰 반짝임을 지우지 않도록 캐릭터마다 다르다
ENCLOSED = {'none-3': 60, 'fire-3': 8, 'lightning-3': 15}
SHADOW = {'lightning-3': ((110, 125, 140), 40, 209)}  # 발밑 회색 그림자: (색, 허용 오차, 이 y부터)


def background(rgb):
    """가장자리에서 이어진 밝은 무채색만 배경으로 본다. 은빛 슬라임 안쪽의 흰색은 지키기 위해서다"""
    h, w = rgb.shape[:2]
    light = (rgb.min(axis=2) >= WHITE_MIN) & (rgb.max(axis=2) - rgb.min(axis=2) <= 14)
    seen = np.zeros((h, w), bool)
    q = deque((y, x) for y in range(h) for x in (0, w - 1) if light[y, x])
    q.extend((y, x) for x in range(w) for y in (0, h - 1) if light[y, x])
    for p in q:
        seen[p] = True
    while q:
        y, x = q.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and light[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True
                q.append((yy, xx))
    return seen


def drop_strays(bg):
    """칸 가장자리에 걸친 조각(옆 캐릭터의 일부)을 지운다. 가장 큰 덩어리와 안쪽의 반짝이는 남긴다"""
    h, w = bg.shape
    label = np.zeros((h, w), int)
    sizes, touches = {}, {}
    n = 0
    for sy, sx in zip(*np.where(~bg)):
        if label[sy, sx]:
            continue
        n += 1
        label[sy, sx] = n
        q, size, touch = deque([(sy, sx)]), 0, False
        while q:
            y, x = q.popleft()
            size += 1
            touch |= y in (0, h - 1) or x in (0, w - 1)
            for yy in range(max(0, y - 1), min(h, y + 2)):
                for xx in range(max(0, x - 1), min(w, x + 2)):
                    if not bg[yy, xx] and not label[yy, xx]:
                        label[yy, xx] = n
                        q.append((yy, xx))
        sizes[n], touches[n] = size, touch
    main_id = max(sizes, key=sizes.get)
    out = bg.copy()
    for i in sizes:
        if i != main_id and touches[i]:
            out[label == i] = True
    return out


def components(mask):
    """4방향으로 이어진 덩어리의 칸 목록"""
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
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    q.append((yy, xx))
        yield cells


def clean(name, rgba):
    """갇힌 흰 배경, 발밑 그림자, 바깥의 흰 테두리를 지운다. 잘린 크기는 그대로 둔다 (부품 좌표가 이 크기 기준)"""
    a = rgba.copy()
    rgb = a[:, :, :3].astype(int)
    if name in ENCLOSED:
        white = (rgb.min(axis=2) >= WHITE_MIN - 4) & (rgb.max(axis=2) - rgb.min(axis=2) <= 16) & (a[:, :, 3] > 0)
        for cells in components(white):
            if len(cells) >= ENCLOSED[name]:
                for c in cells:
                    a[c][3] = 0
    if name in SHADOW:
        color, tol, y0 = SHADOW[name]
        near = np.abs(rgb - np.array(color)).sum(axis=2) < tol * 3
        a[:, :, 3][y0:][near[y0:]] = 0
    for _ in range(2):  # 투명 칸에 닿은 밝은 칸을 벗겨 낸다
        solid = a[:, :, 3] > 0
        edge = solid & ~(np.roll(solid, 1, 0) & np.roll(solid, -1, 0) & np.roll(solid, 1, 1) & np.roll(solid, -1, 1))
        rgb = a[:, :, :3].astype(int)
        pale = rgb.min(axis=2) >= 195
        a[:, :, 3][edge & pale] = 0
    return a


def main():
    os.makedirs(OUT, exist_ok=True)
    src = Image.open(os.path.join(HERE, 'roster-source.webp')).convert('RGB')
    print('source', src.size)
    a = np.asarray(src).astype(int)
    for name, (x0, y0, x1, y1) in BOXES.items():
        rgb = a[y0:y1, x0:x1]
        bg = drop_strays(background(rgb))
        rgba = np.dstack([rgb, np.where(bg, 0, 255)]).astype('uint8')
        ys, xs = np.where(~bg)
        cut = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        Image.fromarray(clean(name, cut), 'RGBA').save(os.path.join(OUT, name + '.png'))
        touch = [s for s, v in (('L', xs.min() == 0), ('R', xs.max() == x1 - x0 - 1), ('T', ys.min() == 0), ('B', ys.max() == y1 - y0 - 1)) if v]
        print(name, 'size', cut.shape[1], cut.shape[0], 'touches', touch)

    # 확인용: 분홍 바탕에 12장을 4×3으로 (빈틈과 잘린 곳이 잘 보인다)
    cell = 300
    sheet = Image.new('RGBA', (cell * 3, cell * 4), (255, 120, 220, 255))
    for r, el in enumerate(['none', 'fire', 'ice', 'lightning']):
        for c in range(3):
            im = Image.open(os.path.join(OUT, f'{el}-{c + 1}.png'))
            sheet.alpha_composite(im, ((cell - im.width) // 2 + c * cell, (cell - im.height) // 2 + r * cell))
    sheet.save(os.path.join(HERE, 'cut-sheet.png'))


if __name__ == '__main__':
    main()
