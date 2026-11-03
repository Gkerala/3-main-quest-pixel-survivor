// 화면 4개(시작 → 대기 → 게임 → 결과) 전환과 버튼 연결
import { api, token } from './api.js';
import { startGame } from './game.js';
import { MOBS, todayKST } from './rules.js';

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
  $('profile-name').textContent = u.name;
  $('profile-status').textContent = STATUS[u.status];
  $('lobby-date').textContent = `오늘의 패턴 ${todayKST()}`;
  $('btn-save-guest').hidden = u.status !== 'guest';
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
$('btn-google').onclick = () => toast('구글 로그인은 다음 단계에서 연결합니다');

// 대기 화면: 랭킹·프로필·상점·환경설정·도감은 버튼만 (PRD Won't)
for (const b of document.querySelectorAll('[data-soon]')) b.onclick = () => toast(`${b.textContent}: 다음 버전에서 열립니다`);
$('btn-logout').onclick = () => { user = null; token.set(null); show('start'); };
// 게스트 토큰을 지우지 않고 시작 화면으로. 여기서 가입하거나 구글을 연동하면 지금 계정이 회원이 된다
$('btn-save-guest').onclick = () => { $('guest-note').hidden = false; show('start'); };
$('btn-play').onclick = play;

// 게임 → 결과
async function play() {
  show('game');
  const hud = { time: $('hud-time'), score: $('hud-score'), level: $('hud-level'), hp: $('hud-hp') };
  const record = await startGame($('game-canvas'), hud, todayKST());
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
$('btn-again').onclick = play;
$('btn-lobby').onclick = () => enterLobby(user);

// 이전에 로그인했으면 바로 대기 화면으로
if (token.get()) api.me().then(r => enterLobby(r.user), () => show('start'));
else show('start');
