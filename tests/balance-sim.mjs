// 브라우저 없이 game.js를 돌려 가만히 서 있는 플레이어가 언제 쓰러지는지 본다.
// 실행: node tests/balance-sim.mjs [프레임 간격(초), 기본 1/60]
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true) });
globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const dt = Number(process.argv[2] || 1 / 60);
let now = 0, queue = [];
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = cb => queue.push(cb);
const { startGame } = await import('../web/js/game.js');
const el = () => ({ style: {}, textContent: '' });
let done; startGame({ getContext: () => ctx }, { time: el(), score: el(), level: el(), hp: el() }, '2026-11-03').then(r => done = r);
while (!done && queue.length) { const cb = queue.shift(); now += dt * 1000; cb(now); await null; }
const { validateRecord } = await import('../web/js/rules.js');
console.log(`dt=${dt}`, JSON.stringify(done), JSON.stringify(validateRecord(done)));
