// 코드로 그린 16×16 도트. 글자 하나 = 픽셀 하나, '.'은 투명.
// 처음 한 번만 작은 캔버스에 찍어 두고(bake) 이후엔 복사만 한다.

const PAL = {
  k: '#1a1626', c: '#2f5d7c', C: '#4f9bb3', s: '#f0c8a0', y: '#e8b04a',
  g: '#4c9a2a', G: '#a8e070', p: '#6b3f8f', P: '#b07ad0', r: '#d95763',
  m: '#7d8699', M: '#c4cbd8', o: '#6e5f4e', O: '#a89880', w: '#ffffff',
};

const RAW = {
  player: [[
    '......kkkk......',
    '....kkcccckk....',
    '...kccCCCCcck...',
    '...kcCkkkkCck...',
    '..kccksssskcck..',
    '..kcksksskskck..',
    '..kcksssssskck..',
    '...kkyyyyyykk...',
    '..kccyycccccck..',
    '.kscccccccccsk..',
    '.ksccCcccCccsk..',
    '..kcccccccccck..',
    '...kcccccccck...',
    '....kkk..kkk....',
    '....kok..kok....',
    '....kk....kk....',
  ], 13],
  slime: [[
    '................',
    '................',
    '................',
    '................',
    '................',
    '......kkkk......',
    '....kkGGggkk....',
    '...kGGgggggggk..',
    '..kGgggggggggk..',
    '..kggkkgggkkgk..',
    '.kgggkwggggwkgk.',
    '.kgggggggggggggk',
    '.kggggggrrgggggk',
    '.kgggggggggggggk',
    '..kkkkkkkkkkkkk.',
    '................',
  ], 0],
  bat: [[
    '................',
    '................',
    '................',
    '.k....kk.kk...k.',
    '.kk...kPPPk..kk.',
    '.kPk.kPPPPPk.kPk',
    '.kPPkPPrPrPPkPPk',
    '.kPpPPPPPPPPPpPk',
    '.kpppPPwPwPPppPk',
    '..kppkPPPPPkppk.',
    '...kk.kpppk.kk..',
    '.......kpk......',
    '........k.......',
    '................',
    '................',
    '................',
  ], 0],
  knight: [[
    '.....kkkkkk.....',
    '....kMMMMMMk....',
    '...kMMmmmmMMk...',
    '...kMkkkkkkMk...',
    '...kMkrkkrkMk...',
    '...kMMmmmmMMk...',
    '....kkmmmmkk....',
    '..kkMMMMMMMMkk.k',
    '.kmMMMmMMmMMMmkM',
    '.kmkMMMMMMMMkmkM',
    '.kk.kmmmmmmk.kkM',
    '....kMMMMMMk..km',
    '....kmmkkmmk....',
    '....kmk..kmk....',
    '...kkmk..kmkk...',
    '...kkkk..kkkk...',
  ], 0],
  golem: [[
    '....kkkkkkkk....',
    '...kOOOOOOOOk...',
    '..kOooooooooOk..',
    '..kOokyookyoOk..',
    '..kOooooooooOk..',
    '.kkkOOooooOOkkk.',
    'kOOkkkkkkkkkkOOk',
    'kOookOOOOOOkooOk',
    'kOookOooooOkooOk',
    'kOookOooooOkooOk',
    '.kkkkOooooOkkkk.',
    '....kOOOOOOk....',
    '...kOook.kOOok..',
    '...kOook.kOOok..',
    '..kOOOok.kOOOOk.',
    '..kkkkkk.kkkkkk.',
  ], 0],
  bolt: [[
    '................',
    '................',
    '................',
    '................',
    '................',
    '......kkkk......',
    '.....kyyyyk.....',
    '....kywwwwyk....',
    '....kywwwwyk....',
    '.....kyyyyk.....',
    '......kkkk......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], 0],
};

// 걷기 2프레임: 아랫줄(다리) 3줄만 바꾼다. legsFrom이 0이면 1프레임
const LEGS = ['....kok....kok..', '...kk.......kk..', '................'];

function bake(rows) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const x = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, i) => {
    if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, y, 1, 1); }
  }));
  return c;
}

export const SPRITES = Object.fromEntries(Object.entries(RAW).map(([name, [rows, legsFrom]]) => {
  const frames = [bake(rows)];
  if (legsFrom) frames.push(bake(rows.slice(0, legsFrom).concat(LEGS)));
  return [name, frames];
}));
