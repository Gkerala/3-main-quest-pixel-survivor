-- 표 2개. 여러 번 실행해도 안전하다 (npm run db:init)

create table if not exists users (
  id            bigint generated always as identity primary key,
  status        text not null check (status in ('guest', 'web', 'google', 'both')),
  username      text unique,          -- 웹 회원 아이디
  password_hash text,                 -- bcrypt 해시. 원래 비밀번호는 저장하지 않는다
  google_sub    text unique,          -- 구글 계정 고유번호. 한 구글 계정은 한 유저에만
  name          text,                 -- 구글 표시 이름
  created_at    timestamptz not null default now()
);

create table if not exists records (
  id           bigint generated always as identity primary key,
  user_id      bigint not null references users (id) on delete cascade,
  time         real not null check (time >= 0),
  kills        jsonb not null,        -- 몹별 처치 수 {"slime": 3, ...}
  score        integer not null check (score >= 0),
  valid        boolean not null,      -- false = 설계상 불가능한 기록(버그). 랭킹·최고 점수에서 뺀다
  pattern_date date not null default (now() at time zone 'Asia/Seoul')::date, -- 오늘의 패턴 날짜 (다음 버전 날짜별 랭킹용)
  created_at   timestamptz not null default now()
);

create index if not exists records_user_valid on records (user_id) where valid;

-- 다음 버전(SETTING.md): 영웅·보스·성장. 이미 있는 표에도 칸만 더한다
alter table users add column if not exists progress jsonb not null default '{}'; -- {heroes, scores, dex}
alter table records add column if not exists hero text not null default 'sprout';
alter table records add column if not exists boss text;                          -- 나온 보스 (없으면 null)
alter table records add column if not exists boss_killed boolean not null default false;

-- Supabase는 공개 키로 표를 바로 읽는 길(REST)을 열어 둔다. 정책 없이 RLS만 켜서 그 길을 막는다.
-- 이 서버는 DB 주인 계정으로 접속하므로 영향이 없다
alter table users enable row level security;
alter table records enable row level security;
