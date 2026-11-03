# pixel-survivor

하루 한 번, 10분, 모두 같은 조건에서 겨루는 브라우저 서바이버 게임. (아이펠 메인 퀘스트 01)

- 플레이: https://gkerala.github.io/3-main-quest-pixel-survivor/
- 기획: [PRD.md](PRD.md) (문제·유저·기능·데이터, 검증 기록)
- 회고: [retrospective.md](retrospective.md)

## 구성
| 부분 | 기술 | 위치 | 배포 |
|---|---|---|---|
| 화면 4개 (시작/로그인 · 대기 · 게임 · 결과) | HTML·CSS·JavaScript, canvas 코드 도트 | `web/` | GitHub Pages |
| API 서버 | Node.js + Express | `server/` | Render |
| DB | Supabase (Postgres) | `server/schema.sql` | Supabase |
| 로그인 | 아이디·비밀번호(bcrypt) + 구글(Google Identity Services) | | |

기록 검증 규칙(`web/js/rules.js`)은 화면과 서버가 같은 파일을 쓴다. 서버는 점수를 받지 않고 처치 수로 다시 계산하며, 설계상 불가능한 기록은 버그로 표시해 최고 점수에서 뺀다.

## 로컬 실행
```bash
cd server
cp .env.example .env   # JWT_SECRET, DATABASE_URL, GOOGLE_CLIENT_ID 채우기 (DATABASE_URL이 없으면 메모리 저장)
npm install
npm run db:init        # 표 만들기 (DB를 쓸 때 한 번)
npm run dev            # http://localhost:3000
```
다른 터미널에서 화면을 띄운다.
```bash
python -m http.server 5176 -d web   # http://localhost:5176
```

## 테스트
```bash
cd server && npm test               # API·계정 연동·기록 검증 9개
node tests/balance-sim.mjs          # 가만히 서 있으면 몇 분에 쓰러지는지 (한 판 길이 점검)
```
