// 화면 4개(시작 → 대기 → 게임 → 결과) 전환과 버튼 연결
import { api, token } from './api.js';
import { startGame } from './game.js';
import { MOBS, todayKST } from './rules.js';
import { GOOGLE_CLIENT_ID } from './config.js';

const $ = id => document.getElementById(id);
const STATUS = { guest: '게스트', web: '웹 회원', google: '구글 회원', both: '웹 + 구글' };
let user = null;

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${name}`;
}

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
  $('lobby-date').textContent = `오늘의 패턴 ${todayKST()}`;
  $('btn-save-guest').hidden = u.status !== 'guest';
  $('google-link').hidden = u.status !== 'web';
  $('guest-note').hidden = true;
  show('lobby');
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
  const hud = { time: $('hud-time'), score: $('hud-score'), level: $('hud-level'), hp: $('hud-hp'), threat: $('hud-threat') };
  const record = await startGame($('game-canvas'), hud, todayKST(), { choose });
  show('result');
  $('result-time').textContent = `${Math.floor(record.time / 60)}분 ${Math.floor(record.time % 60)}초`;
  $('result-kills').textContent = Object.entries(record.kills)
    .filter(([, n]) => n).map(([k, n]) => `${MOBS[k].name} ${n}`).join(' · ') || '없음';
  $('result-score').textContent = '…';
  $('result-best').textContent = '…';
  try {
    const r = await api.submit(record);
    $('result-score').textContent = r.score;
    $('result-best').textContent = r.best;
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
    b.className = 'card';
    b.innerHTML = `<kbd>${i + 1}</kbd><strong></strong><span></span>`;
    b.querySelector('strong').textContent = c.name;
    b.querySelector('span').textContent = c.desc;
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

$('btn-again').onclick = play;
$('btn-lobby').onclick = () => enterLobby(user);

// 이전에 로그인했으면 바로 대기 화면으로
// 확인하는 동안은 아무 화면도 보이지 않게 한다 (그 사이 시작 화면 버튼이 눌리지 않게)
if (token.get()) { show('none'); api.me().then(r => enterLobby(r.user), () => show('start')); }
else show('start');
