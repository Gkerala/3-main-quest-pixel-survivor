// 서버 시작. 설정은 환경변수로 받는다 (로컬은 .env, 배포는 Render 설정 화면)
import { OAuth2Client } from 'google-auth-library';
import { createApp } from './app.js';
import { createMemoryStore } from './store-memory.js';
import { createPgStore } from './store-pg.js';

const { PORT = 3000, JWT_SECRET, DATABASE_URL, GOOGLE_CLIENT_ID, CORS_ORIGIN = 'http://localhost:5176', ADMIN_USERNAMES = '' } = process.env;

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
  store: DATABASE_URL ? createPgStore(DATABASE_URL) : createMemoryStore(),
  jwtSecret: JWT_SECRET,
  verifyGoogle,
  corsOrigins: CORS_ORIGIN.split(',').map(s => s.trim()),
  adminUsernames: ADMIN_USERNAMES.split(',').map(s => s.trim()).filter(Boolean),
});
// Express 5는 포트가 이미 쓰이고 있어도 이 함수를 부른다. 오류를 확인하지 않으면 켜진 척하고 꺼진다
app.listen(PORT, err => err ? (console.error(`서버를 못 켰습니다: ${err.message}`), process.exit(1)) : console.log(`API 서버: http://localhost:${PORT} (저장소 ${DATABASE_URL ? 'DB' : '메모리 - 껐다 켜면 사라짐'}, 구글 로그인 ${verifyGoogle ? '켜짐' : '꺼짐'})`));
