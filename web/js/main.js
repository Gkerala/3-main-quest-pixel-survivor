// 화면 4개(시작 → 대기 → 게임 → 결과) 전환과 버튼 연결
import { api, token } from './api.js';
import { startGame } from './game.js';
import { MOBS, HEROES, BOSSES, GROWTH, tierOf, todayKST } from './rules.js';
import { GOOGLE_CLIENT_ID } from './config.js';
import { startBackdrop } from './backdrop.js';
import { gameArt, STAGE_NAMES } from './slime-art.js';

const $ = id => document.getElementById(id);
const STATUS = { guest: '게스트', web: '웹 회원', google: '구글 회원', both: '웹 + 구글' };
let user = null;
// 고른 영웅은 이 브라우저에 기억한다 (얻지 않은 영웅이면 새싹으로 돌아간다)
let hero = 'sprout';
try { hero = localStorage.getItem('ps-hero') || 'sprout'; } catch { /* 저장소를 못 쓰면 매번 새싹 */ }
const HINTS = {
  frost: '관통 강화 3번 받고 10분 보스를 이기면',
  magma: '10분 안에 1,500마리 잡고 보스를 이기면',
  shade: '체력 20% 아래에서 버티고 보스를 이기면',
};
const backdrop = startBackdrop($('backdrop'));

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${name}`;
  document.body.classList.toggle('playing', name === 'game');
  name === 'game' ? backdrop.pause() : backdrop.resume();
}

// 새 패턴(한국 시간 자정)까지 남은 시간
function tickNext() {
  const left = 86400 - Math.floor((Date.now() / 1000 + 9 * 3600) % 86400);
  $('lobby-next').textContent = [left / 3600, (left % 3600) / 60, left % 60]
    .map(n => String(Math.floor(n)).padStart(2, '0')).join(':');
  if (left === 86400) $('lobby-date').textContent = todayKST().slice(5).replace('-', '.');
}
setInterval(tickNext, 1000);

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}

function enterLobby(u) {
  user = u;
  $('auth-pw').value = ''; // 로그인하면 비밀번호 칸은 비운다 (아이디는 남긴다)
  $('profile-name').textContent = u.name;
  $('profile-status').textContent = STATUS[u.status];
  $('lobby-date').textContent = todayKST().slice(5).replace('-', '.');
  tickNext();
  $('btn-save-guest').hidden = u.status !== 'guest';
  $('google-link').hidden = u.status !== 'web';
  $('guest-note').hidden = true;
  renderHeroes();
  show('lobby');
}

const owned = h => h === 'sprout' || !!user.progress?.heroes?.includes(h);
const scoreFor = h => user.progress?.scores?.[h] ?? 0;

// 애니메이션 첫 프레임을 기준점이 가운데 오게 작은 캔버스에 옮긴다. dark면 실루엣
function sprite(anim, size, dark) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  if (dark) x.filter = 'brightness(0) opacity(.55)';
  x.drawImage(anim.frames[0], size / 2 - anim.ax, size / 2 + 2 - anim.ay);
  return c;
}

function renderHeroes() {
  if (!owned(hero)) hero = 'sprout';
  $('hero-list').replaceChildren(...HEROES.map(h => {
    const own = owned(h), total = scoreFor(h), tier = tierOf(total);
    const b = document.createElement('button');
    b.className = 'hero';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(h === hero));
    b.disabled = !own;
    const name = document.createElement('strong');
    const info = document.createElement('small');
    name.textContent = own ? STAGE_NAMES[h][tier - 1] : '???';
    info.textContent = !own ? HINTS[h] : tier < 4 ? `${tier}단계 · 다음 단계까지 ${(GROWTH[tier] - total).toLocaleString()}점` : '4단계 · 사람의 형태';
    b.append(sprite(gameArt(h, own ? tier : 1).hero.idle, 16, !own), name, info);
    if (own && tier < 4) { // 다음 단계까지 얼마나 왔나
      const bar = document.createElement('span'), fill = document.createElement('i');
      bar.className = 'grow';
      fill.style.width = `${((total - GROWTH[tier - 1]) / (GROWTH[tier] - GROWTH[tier - 1])) * 100}%`;
      bar.append(fill);
      b.append(bar);
    }
    b.onclick = () => {
      hero = h;
      try { localStorage.setItem('ps-hero', h); } catch { /* 이번 접속에서만 기억 */ }
      renderHeroes();
    };
    return b;
  }));
}

// 도감: 처치한 적과 이긴 보스만 모습이 보인다
function renderDex() {
  const dex = user.progress?.dex ?? {}, art = gameArt();
  const items = [
    ...Object.keys(MOBS).map(k => ({ name: MOBS[k].name, anim: art.mobs[k].walk, n: dex.kills?.[k] ?? 0, unit: '마리 처치', size: 16 })),
    ...Object.keys(BOSSES).map(k => ({ name: BOSSES[k].name, anim: art.bosses[k].walk, n: dex.bosses?.[k] ?? 0, unit: '번 이김', size: 40 })),
  ];
  $('dex-list').replaceChildren(...items.map(it => {
    const d = document.createElement('div'), name = document.createElement('strong'), count = document.createElement('small');
    d.className = 'dex-item';
    name.textContent = it.n ? it.name : '???';
    count.textContent = `${it.n.toLocaleString()}${it.unit}`;
    d.append(sprite(it.anim, it.size, !it.n), name, count);
    return d;
  }));
}
$('btn-dex').onclick = () => { renderDex(); $('dex').showModal(); };
$('dex-close').onclick = () => $('dex').close();

// 결과 화면의 보스 한 줄
function bossNote(boss, r) {
  if (!boss || !r.valid) return null;
  const name = BOSSES[boss.key].name;
  if (!boss.killed) return `${name}에게 졌습니다. 다음에는 이겨 보세요`;
  if (r.unlocked) return `${name}이 동료가 되었습니다. 대기 화면에서 고를 수 있어요`;
  if (!BOSSES[boss.key].hero) return `${name}을 이겨 도감에 등록했습니다`;
  return `${name}을 또 이겼습니다 (도감 ${r.progress.dex.bosses[boss.key]}번)`;
}

async function run(fn) {
  try { enterLobby((await fn()).user); } catch (e) { toast(e.message); }
}

// 시작 화면
$('btn-guest').onclick = () => run(() => api.guest());
$('auth-form').onsubmit = e => {
  e.preventDefault();
  const id = $('auth-id').value.trim(), pw = $('auth-pw').value;
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(id)) return toast('아이디는 영문·숫자·_ 3~20자입니다');
  if (pw.length < 6) return toast('비밀번호는 6자 이상입니다');
  run(() => (e.submitter.value === 'signup' ? api.signup(id, pw) : api.login(id, pw)));
};
// 구글 로그인 버튼. 받은 증표(credential)를 서버가 확인한다.
// 로그인한 상태(게스트·웹 회원)에서 누르면 지금 계정에 구글이 연결된다 (토큰이 같이 가기 때문)
function setupGoogle() {
  if (!window.google?.accounts) return setTimeout(setupGoogle, 200); // 구글 스크립트가 늦게 올 수 있다
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: r => run(() => api.google(r.credential)) });
  const look = { theme: 'outline', size: 'large', width: 300 };
  google.accounts.id.renderButton($('google-login'), { ...look, text: 'signin_with' });
  google.accounts.id.renderButton($('google-link-btn'), { ...look, text: 'continue_with' });
}
setupGoogle();

// 대기 화면: 랭킹·프로필·상점·환경설정·도감은 버튼만 (PRD Won't)
for (const b of document.querySelectorAll('[data-soon]')) b.onclick = () => toast(`${b.textContent}: 다음 버전에서 열립니다`);
$('btn-logout').onclick = () => { user = null; token.set(null); show('start'); };
// 게스트 토큰을 지우지 않고 시작 화면으로. 여기서 가입하거나 구글을 연동하면 지금 계정이 회원이 된다
$('btn-save-guest').onclick = () => { $('guest-note').hidden = false; show('start'); };
$('btn-play').onclick = play;

// 게임 → 결과
async function play() {
  show('game');
  const hud = { time: $('hud-time'), score: $('hud-score'), level: $('hud-level'), hp: $('hud-hp'), threat: $('hud-threat'),
    boss: $('hud-boss'), bossName: $('hud-boss-name'), bossHp: $('hud-boss-hp') };
  const record = await startGame($('game-canvas'), hud, todayKST(), { choose, pause, hero, tier: tierOf(scoreFor(hero)) });
  // 일시정지에서 그만두면 기록을 보내지 않는다
  if (record.aborted === 'restart') return play();
  if (record.aborted === 'lobby') return enterLobby(user);
  show('result');
  $('result-time').textContent = `${Math.floor(record.time / 60)}분 ${Math.floor(record.time % 60)}초`;
  $('result-kills').textContent = Object.entries(record.kills)
    .filter(([, n]) => n).map(([k, n]) => `${MOBS[k].name} ${n}`).join(' · ') || '없음';
  $('result-score').textContent = '…';
  $('result-best').textContent = '…';
  $('result-new').hidden = true;
  $('result-boss').hidden = true;
  try {
    const r = await api.submit(record);
    $('result-score').textContent = r.score;
    $('result-best').textContent = r.best;
    $('result-new').hidden = !(r.valid && r.score > 0 && r.score >= r.best);
    if (r.progress) user = { ...user, progress: r.progress };
    const note = bossNote(record.boss, r);
    if (note) { $('result-boss').textContent = note; $('result-boss').hidden = false; }
    if (!r.valid) toast(`확인되지 않은 기록이라 최고 점수에서 뺐습니다 (${r.reason})`);
  } catch (e) {
    $('result-score').textContent = '-';
    toast(`기록 저장 실패: ${e.message}`);
  }
}
// 레벨업 카드 3장. 클릭하거나 숫자키 1·2·3으로 고른다
function choose(cards) {
  const box = $('levelup-cards');
  box.replaceChildren(...cards.map((c, i) => {
    const b = document.createElement('button');
    b.className = `card grade-${c.grade}`;
    b.innerHTML = `<span class="card-top"><kbd>${i + 1}</kbd><em class="grade">${c.grade}</em></span><strong></strong><span></span>`;
    b.querySelector('strong').textContent = c.name;
    b.querySelector('span:last-child').textContent = c.desc;
    return b;
  }));
  $('levelup').hidden = false;
  return new Promise(resolve => {
    const pick = i => {
      removeEventListener('keydown', onKey);
      $('levelup').hidden = true;
      resolve(cards[i]);
    };
    const onKey = e => { const i = Number(e.key) - 1; if (cards[i]) pick(i); };
    addEventListener('keydown', onKey);
    [...box.children].forEach((b, i) => { b.onclick = () => pick(i); });
  });
}

// 일시정지 메뉴. ESC를 다시 누르면 계속한다
function pause() {
  $('pause').hidden = false;
  $('btn-resume').focus();
  return new Promise(resolve => {
    const done = act => {
      removeEventListener('keydown', onKey);
      $('pause').hidden = true;
      resolve(act);
    };
    const onKey = e => { if (e.code === 'Escape') done('resume'); };
    addEventListener('keydown', onKey);
    $('btn-resume').onclick = () => done('resume');
    $('btn-restart').onclick = () => done('restart');
    $('btn-quit').onclick = () => done('lobby');
  });
}

$('btn-again').onclick = play;
$('btn-lobby').onclick = () => enterLobby(user);

// 이전에 로그인했으면 바로 대기 화면으로
// 확인하는 동안은 아무 화면도 보이지 않게 한다 (그 사이 시작 화면 버튼이 눌리지 않게)
if (token.get()) { show('none'); api.me().then(r => enterLobby(r.user), () => show('start')); }
else show('start');
