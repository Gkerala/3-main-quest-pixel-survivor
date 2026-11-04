// API 서버 호출. 로그인 토큰은 이 브라우저에만 보관한다
import { API_BASE } from './config.js';

const KEY = 'ps-token';
export const token = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* 저장 못 하면 새로고침 때 다시 로그인 */ } },
};

async function call(path, body) {
  const t = token.get();
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(t && { authorization: `Bearer ${t}` }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 해 주세요');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path === '/api/me') token.set(null);
    throw new Error(data.error || `요청 실패 (${res.status})`);
  }
  if (data.token) token.set(data.token);
  return data;
}

export const api = {
  guest: () => call('/api/guest', {}),
  signup: (username, password) => call('/api/signup', { username, password }),
  login: (username, password) => call('/api/login', { username, password }),
  google: credential => call('/api/google', { credential }),
  submit: record => call('/api/records', record),
  me: () => call('/api/me'),
  rankings: period => call(`/api/rankings?period=${period}`),
  setNickname: nickname => call('/api/profile', { nickname }),
  setPassword: (current, next) => call('/api/password', { current, next }),
};
