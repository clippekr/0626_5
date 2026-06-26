-- Supabase SQL Editor에서 한 번 실행

-- pgvector 확장
create extension if not exists vector;

-- RAG 문서 테이블
create table if not exists documents (
  id        bigserial primary key,
  source    text        not null,
  chunk_idx integer     not null,
  content   text        not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index if not exists documents_embedding_idx
  on documents using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- 유사도 검색 함수
create or replace function match_documents(
  query_embedding vector(1536),
  match_count     int default 5
)
returns table (content text, similarity float)
language sql stable as $$
  select content, 1 - (embedding <=> query_embedding) as similarity
  from documents
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- 리드 테이블
create table if not exists leads (
  id         bigserial primary key,
  name       text,
  phone      text,
  email      text,
  company    text,
  message    text,
  created_at timestamptz default now()
);

-- 대화 로그 테이블
create table if not exists chat_logs (
  id           bigserial primary key,
  user_message text,
  bot_reply    text,
  created_at   timestamptz default now()
);
