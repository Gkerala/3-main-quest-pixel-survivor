# pixel-survivor

하루 한 번, 10분, 모두 같은 조건에서 겨루는 브라우저 서바이버 게임. (아이펠 메인 퀘스트 01)

- 플레이: https://gkerala.github.io/3-main-quest-pixel-survivor/
- 기획: [PRD.md](PRD.md) (문제·유저·기능·데이터, 검증 기록)
- 설정·성장·밸런스 변경 기록: [SETTING.md](SETTING.md)
- 회고: [retrospective.md](retrospective.md)

## 구성
| 부분 | 기술 | 위치 | 배포 |
|---|---|---|---|
| 화면 4개 (시작/로그인 · 대기 · 게임 · 결과) + 랭킹·프로필·환경설정·도감 창 | HTML·CSS·JavaScript, canvas (영웅은 `web/sprites`의 그림, 몹과 보스는 코드 도트) | `web/` | GitHub Pages |
| API 서버 | Node.js + Express | `server/` | Render |
| DB | Supabase (Postgres) | `server/schema.sql` | Supabase |
| 로그인 | 아이디·비밀번호(bcrypt) + 구글(Google Identity Services) | | |

기록 검증 규칙(`web/js/rules.js`)은 화면과 서버가 같은 파일을 쓴다. 서버는 점수를 받지 않고 처치 수로 다시 계산하며, 설계상 불가능한 기록은 버그로 표시해 최고 점수에서 뺀다.

## 지금 상태 (2026-11-04)
- 영웅: 새싹(무속성)·서리(얼음)·용암(불)·번개. 성장은 3단계(12,000 / 50,000점)이고, 3단계 그림은 미구현이라 2단계 그림을 쓴다
- 보스: 처치 점수 10,000 또는 10분에 등장, 세기 고정. 일반 몹은 보스보다 강해지지 않는다
- 랭킹: 오늘과 시즌(이번 달). 유저당 최고 기록 1줄, 탑 100과 내 기록. 게스트·버그 기록·관리자는 뺀다. 이름은 닉네임 또는 아이디만 보여 주고 구글 실명은 공개하지 않는다
- 프로필: 닉네임과 비밀번호 변경. 환경설정: 조준선, 위협도 표시, 배경 움직임, 확대 배율 (브라우저에 저장)
- 관리자: 서버 환경변수 `ADMIN_USERNAMES`에 적은 아이디는 모든 영웅이 열리고 최소 2단계로 보인다. 가입한 뒤에 적는다
- 알려진 문제: 봇 시뮬레이션에서 번개(1단계부터)와 서리(2단계부터)가 20분까지 생존하고, 용암 3단계는 1단계보다 일찍 쓰러진다

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
cd server && npm test               # API·계정 연동·기록 검증·성장·관리자·랭킹·프로필·보안 21개
node tests/balance-sim.mjs          # 봇이 몇 분에 쓰러지는지, 서버 검증을 통과하는지 (한 판 길이 점검)
```
