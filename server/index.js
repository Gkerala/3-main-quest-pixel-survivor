// 서버 시작. 설정은 환경변수로 받는다 (로컬은 .env, 배포는 Render 설정 화면)
import { OAuth2Client } from 'google-auth-library';
import { createApp } from './app.js';
import { createMemoryStore } from './store-memory.js';

const { PORT = 3000, JWT_SECRET, GOOGLE_CLIENT_ID, CORS_ORIGIN = 'http://localhost:5176' } = process.env;

if (!JWT_SECRET) {
  console.error('JWT_SECRET 환경변수가 없습니다. .env.example을 보고 .env를 만들어 주세요');
  process.exit(1);
}

let verifyGoogle = null;
if (GOOGLE_CLIENT_ID) {
  const client = new OAuth2Client(GOOGLE_CLIENT_ID);
  verifyGoogle = async credential => {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const { sub, name } = ticket.getPayload();
    return { sub, name };
  };
}

const app = createApp({
  store: createMemoryStore(),
  jwtSecret: JWT_SECRET,
  verifyGoogle,
  corsOrigins: CORS_ORIGIN.split(',').map(s => s.trim()),
});
app.listen(PORT, () => console.log(`API 서버: http://localhost:${PORT} (구글 로그인 ${verifyGoogle ? '켜짐' : '꺼짐'})`));
