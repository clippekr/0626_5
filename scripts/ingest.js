'use strict';

/**
 * uploads/*.md → 청크 → OpenAI 임베딩 → Supabase documents 테이블 적재
 * 실행: node scripts/ingest.js
 *
 * Supabase SQL (한 번만 실행):
 *   create extension if not exists vector;
 *   create table documents (
 *     id        bigserial primary key,
 *     source    text,
 *     chunk_idx integer,
 *     content   text,
 *     embedding vector(1536)
 *   );
 *   create index on documents using ivfflat (embedding vector_cosine_ops) with (lists = 50);
 */

require('dotenv').config();

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY        = process.env.OPENAI_API_KEY;
const CHUNK_SIZE        = 600;   // 자(글자) 기준
const CHUNK_OVERLAP     = 80;

if (!SUPABASE_URL || !SUPABASE_SERVICE || !OPENAI_KEY) {
  console.error('❌  .env에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY 필요');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

/* ── 텍스트 청킹 ── */
function chunkText(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end).trim());
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter(c => c.length > 20);
}

/* ── OpenAI 임베딩 ── */
function embedTexts(inputs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'text-embedding-3-small', input: inputs });
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.data.map(d => d.embedding));
        } catch { reject(new Error('임베딩 응답 파싱 실패')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ── 배치 임베딩 (API 한도 고려 최대 20개씩) ── */
async function embedBatch(texts) {
  const SIZE = 20;
  const all = [];
  for (let i = 0; i < texts.length; i += SIZE) {
    const batch = texts.slice(i, i + SIZE);
    const vecs = await embedTexts(batch);
    all.push(...vecs);
  }
  return all;
}

/* ── 메인 ── */
async function main() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.md'));

  if (!files.length) { console.log('uploads/*.md 파일 없음'); return; }

  console.log(`📂  파일 ${files.length}개 처리 시작…`);

  for (const file of files) {
    console.log(`\n▶  ${file}`);
    const text = fs.readFileSync(path.join(uploadsDir, file), 'utf-8');
    const chunks = chunkText(text);
    console.log(`   청크 ${chunks.length}개`);

    // 기존 데이터 삭제 (재적재)
    await supabase.from('documents').delete().eq('source', file);

    const embeddings = await embedBatch(chunks);

    const rows = chunks.map((content, i) => ({
      source:    file,
      chunk_idx: i,
      content,
      embedding: embeddings[i],
    }));

    const { error } = await supabase.from('documents').insert(rows);
    if (error) { console.error('   ❌ 적재 오류:', error.message); }
    else        { console.log(`   ✅ ${rows.length}개 적재 완료`); }
  }

  console.log('\n🎉  ingest 완료');
}

main().catch(e => { console.error(e); process.exit(1); });
