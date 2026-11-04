// 환경설정. 이 브라우저에만 저장한다
const KEY = 'ps-settings';
const DEFAULTS = { aimLine: true, showThreat: true, backdrop: true, zoom: 1 };

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}

export const settings = { ...DEFAULTS, ...load() };

export function saveSetting(name, value) {
  settings[name] = value;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* 저장 못 하면 이번 접속에서만 적용 */ }
}
