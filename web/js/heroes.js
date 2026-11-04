// 영웅별 기본 능력과 레벨업 카드 (SETTING.md 4장). DOM을 쓰지 않는다
// weapon: bolt = 탄을 쏜다, ring = 둘레에 불길 고리, bite = 앞을 반달 모양으로 문다
// 카드의 tier = 이 성장 단계부터 나온다. pierce = 서리 보스 조건("관통 강화")에 세는 카드
// grade: 카드 등급 (S는 아직 없음)
//   A = 기본 공격 강화: 기본 공격의 모습이 바뀌고 피해·범위가 오른다
//   B = 추가 공격: 기본 공격과 따로 도는 공격 (대기시간 공격, 장판, 가까이 오면 다치는 기운)
//   C = 영웅 고유 수치, D = 공통 공격 수치, E = 이동·회복

export const GRADES = ['A', 'B', 'C', 'D', 'E'];
export const GRADE_WEIGHT = { A: 6, B: 12, C: 22, D: 30, E: 30 }; // 카드가 뽑힐 비율. 등급이 높을수록 드물다

export const HERO_DEFS = {
  sprout: {
    name: '새싹 슬라임', weapon: 'bolt',
    base: { damage: 20, cooldown: 0.5, boltSpeed: 300, boltLife: 1, pierce: 0 },
    cards: [
      { id: 'shots', grade: 'C', tier: 1, name: '탄 추가', desc: '한 번에 1발 더', max: 6, apply: p => { p.shots++; } },
      { id: 'pierce', grade: 'C', tier: 1, pierce: true, name: '관통', desc: '탄이 1마리 더 뚫고 간다', max: 3, apply: p => { p.pierce++; } },
      { id: 'bigGoo', grade: 'A', tier: 1, name: '왕방울 점액', desc: '점액탄이 크고 무거워진다. 피해 ×1.4, 판정이 넓어진다', max: 1, apply: p => { p.damage *= 1.4; p.boltScale = 1.6; } },
      { id: 'seed', grade: 'A', tier: 2, name: '씨앗 폭탄', desc: '맞으면 작게 터져 주변도 다친다', max: 1, apply: p => { p.seed = true; } },
      { id: 'vine', grade: 'A', tier: 3, name: '덩굴', desc: '맞은 적이 1.5초 느려진다', max: 1, apply: p => { p.vine = true; } },
      { id: 'bloom', grade: 'B', tier: 3, name: '꽃비', desc: '3초마다 사방으로 탄 8발', max: 1, apply: p => { p.bloom = true; } },
    ],
  },
  frost: {
    name: '서리 슬라임', weapon: 'bolt',
    base: { damage: 24, cooldown: 0.4, boltSpeed: 420, boltLife: 0.8, pierce: 3, shots: 4 },
    cards: [
      { id: 'length', grade: 'C', tier: 1, pierce: true, name: '고드름 길이', desc: '1마리 더 뚫고 간다', max: 3, apply: p => { p.pierce++; } },
      { id: 'velocity', grade: 'C', tier: 1, name: '탄 속도', desc: '고드름이 20% 빨라진다', max: 4, apply: p => { p.boltSpeed *= 1.2; } },
      { id: 'spear', grade: 'A', tier: 1, name: '얼음창', desc: '고드름이 창처럼 길어진다. 피해 ×1.3, 2마리 더 뚫는다', max: 1, apply: p => { p.damage *= 1.3; p.pierce += 2; p.boltScale = 1.5; } },
      { id: 'freeze', grade: 'A', tier: 2, name: '빙결', desc: '맞은 적이 0.5초 멈춘다', max: 1, apply: p => { p.freeze = true; } },
      { id: 'shard', grade: 'A', tier: 3, name: '얼음 파편', desc: '고드름이 끝나면 두 갈래로 갈라진다', max: 1, apply: p => { p.shard = true; } },
      { id: 'blizzard', grade: 'B', tier: 3, name: '눈보라', desc: '가까운 적이 30% 느려진다', max: 1, apply: p => { p.blizzard = true; } },
    ],
  },
  magma: {
    name: '용암 슬라임', weapon: 'ring',
    base: { damage: 16, cooldown: 1, radius: 46 },
    cards: [
      { id: 'radius', grade: 'C', tier: 1, name: '고리 범위', desc: '불길 고리가 15% 넓어진다', max: 4, apply: p => { p.radius *= 1.15; } },
      { id: 'pulse', grade: 'C', tier: 1, name: '고리 주기', desc: '고리 간격 -15%', max: 4, apply: p => { p.cooldown *= 0.85; } },
      { id: 'flare', grade: 'A', tier: 1, name: '백열 고리', desc: '고리가 하얗게 달아오른다. 피해 ×1.3, 범위 ×1.25', max: 1, apply: p => { p.damage *= 1.3; p.radius *= 1.25; p.flare = true; } },
      { id: 'ember', grade: 'A', tier: 2, name: '잔불', desc: '맞은 적이 2초 동안 탄다', max: 1, apply: p => { p.ember = true; } },
      { id: 'erupt', grade: 'B', tier: 3, name: '분화', desc: '2초마다 가까운 적 자리에서 폭발', max: 1, apply: p => { p.erupt = true; } },
      { id: 'armor', grade: 'B', tier: 3, name: '용암 갑옷', desc: '붙은 적이 계속 화상을 입는다', max: 1, apply: p => { p.armor = true; } },
    ],
  },
  shade: {
    name: '그림자 슬라임', weapon: 'bite',
    base: { damage: 34, cooldown: 0.45, range: 34, arc: 0.8 },
    cards: [
      { id: 'reach', grade: 'C', tier: 1, name: '물기 범위', desc: '20% 더 멀리 문다', max: 4, apply: p => { p.range *= 1.2; } },
      { id: 'drain', grade: 'C', tier: 1, name: '흡혈', desc: '물 때마다 체력 1 회복', max: 3, apply: p => { p.drain++; } },
      { id: 'abyss', grade: 'A', tier: 1, name: '심연의 이빨', desc: '반달이 붉게 넓어진다. 피해 ×1.3, 물기 각도 ×1.5', max: 1, apply: p => { p.damage *= 1.3; p.arc *= 1.5; p.abyss = true; } },
      { id: 'step', grade: 'B', tier: 2, name: '그림자 걸음', desc: '4초마다 조준 방향으로 돌진하며 지나간 자리를 문다', max: 1, apply: p => { p.step = true; } },
      { id: 'clone', grade: 'A', tier: 3, name: '분신', desc: '뒤쪽도 같이 문다', max: 1, apply: p => { p.clone = true; } },
      { id: 'veil', grade: 'C', tier: 3, name: '밤의 장막', desc: '10초마다 1.5초 무적', max: 1, apply: p => { p.veil = true; } },
    ],
  },
};

// 모든 영웅이 쓰는 카드. 수치는 더하기 위주로: 곱하기로 끝없이 늘리면 몹보다 빨리 강해져 끝나지 않는다
const COMMON = {
  damage: { id: 'damage', grade: 'D', name: '공격력', desc: '피해 +8', apply: p => { p.damage += 8; } },
  rate: { id: 'rate', grade: 'D', name: '공격 속도', desc: '공격 간격 -12%', max: 8, apply: p => { p.cooldown *= 0.88; } },
  speed: { id: 'speed', grade: 'E', name: '이동 속도', desc: '+12%', max: 4, apply: p => { p.speed *= 1.12; } },
  vital: { id: 'vital', grade: 'D', name: '최대 체력', desc: '+25, 그만큼 회복', apply: p => { p.maxHp += 25; p.hp += 25; } },
  heal: { id: 'heal', grade: 'E', name: '회복', desc: '체력 50% 회복', apply: p => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp / 2); } },
};

// 모든 영웅이 받을 수 있는 추가 공격(B). 기본 공격과 따로 돈다
const EXTRA = [
  { id: 'thorns', grade: 'B', name: '가시 장판', desc: '5초마다 발밑에 3초 동안 가시밭을 깐다', max: 1, apply: p => { p.thorns = true; } },
  { id: 'aura', grade: 'B', name: '끈적 기운', desc: '가까이 붙은 적이 계속 다친다', max: 1, apply: p => { p.aura = true; } },
  { id: 'orb', grade: 'B', name: '튀는 방울', desc: '2.5초마다 가까운 적에게 큰 방울을 던진다 (피해 ×3)', max: 1, apply: p => { p.orb = true; } },
];

// 이 영웅·단계에서 나올 수 있는 카드. 순서도 고정이다 (봇 시뮬레이션이 같은 판을 내려면)
export function cardPool(hero, tier) {
  const own = HERO_DEFS[hero].cards.filter(c => c.tier <= tier);
  return [COMMON.damage, COMMON.rate, ...own, ...EXTRA, COMMON.speed, COMMON.vital, COMMON.heal];
}
