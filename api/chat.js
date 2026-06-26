'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

/* ── 환경변수 ── */
const OPENAI_KEY       = process.env.OPENAI_API_KEY;
const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MODEL            = 'gpt-4.1-mini';
const EMBED_MODEL      = 'text-embedding-3-small';
const TOP_K            = 5;

/* ── Supabase 클라이언트 (서버 전용) ── */
let supabase = null;
function getSupabase() {
  if (supabase) return supabase;
  if (!SUPABASE_URL || !SUPABASE_SERVICE) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    return supabase;
  } catch { return null; }
}

/* ── 폴백: 파일 전체 로드 ── */
function loadKnowledgeBase() {
  try {
    const dir = path.join(process.cwd(), 'uploads');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    if (!files.length) return '(등록된 지식 베이스 없음)';
    return files
      .map(f => `=== ${f} ===\n${fs.readFileSync(path.join(dir, f), 'utf-8')}`)
      .join('\n\n---\n\n');
  } catch { return '(지식 베이스 로드 실패)'; }
}

/* ── https POST helper ── */
function httpsPost(hostname, path_, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request(
      { hostname, path: path_, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers } },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('파싱 실패')); } });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* ── 임베딩 ── */
async function embed(text) {
  const res = await httpsPost(
    'api.openai.com', '/v1/embeddings',
    { Authorization: `Bearer ${OPENAI_KEY}` },
    { model: EMBED_MODEL, input: text }
  );
  if (res.error) throw new Error(res.error.message);
  return res.data[0].embedding;
}

/* ── RAG 검색 ── */
async function retrieveContext(question) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const vector = await embed(question);
    const { data, error } = await sb.rpc('match_documents', {
      query_embedding: vector,
      match_count: TOP_K,
    });
    if (error || !data?.length) return null;
    return data.map(d => d.content).join('\n\n---\n\n');
  } catch (e) {
    console.error('[RAG] 검색 실패, 폴백 사용:', e.message);
    return null;
  }
}

/* ── 대화 로그 (best-effort) ── */
async function logChat(userMsg, botReply) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('chat_logs').insert({ user_message: userMsg, bot_reply: botReply });
  } catch { /* 실패해도 응답에 영향 없음 */ }
}

/* ── OpenAI 호출 ── */
async function callOpenAI(systemPrompt, messages) {
  const res = await httpsPost(
    'api.openai.com', '/v1/chat/completions',
    { Authorization: `Bearer ${OPENAI_KEY}` },
    { model: MODEL, messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.6, max_tokens: 600 }
  );
  if (res.error) throw new Error(res.error.message);
  return res.choices?.[0]?.message?.content?.trim() ?? '응답을 받지 못했습니다.';
}

/* ── 요청 본문 파싱 ── */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) return resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('본문 파싱 실패')); } });
    req.on('error', reject);
  });
}

function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/* ── 핸들러 ── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return respond(res, 204, {});
  if (req.method !== 'POST')   return respond(res, 405, { error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const raw  = body?.messages;

    if (!Array.isArray(raw) || !raw.length)
      return respond(res, 400, { error: '메시지가 없습니다.' });

    const messages = raw
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
      .slice(-10);

    const lastUser = messages.filter(m => m.role === 'user').at(-1)?.content ?? '';

    // RAG 검색 시도 → 실패 시 파일 전체 폴백
    let context = await retrieveContext(lastUser);
    const usedRAG = !!context;
    if (!context) context = loadKnowledgeBase();

    const systemPrompt = `당신은 S마케팅의 AI 상담 챗봇 "S봇"입니다.
S마케팅은 중소기업·소상공인 전문 마케팅 파트너이며, 슬로건은 "작은 사업, 큰 성장의 시작"입니다.

[답변 규칙 — 반드시 준수]
1. 자기소개·대화형 질문 → S봇이라는 이름과 역할을 친근하게 소개한다.
2. 서비스·가격·정책 관련 질문 → 아래 [참고 정보]에 있는 내용만 사용해 답변한다.
   → 참고 정보에 없으면 반드시 "자세한 내용은 무료 상담을 통해 안내드릴게요 😊"로 안내한다.
3. S마케팅과 무관한 질문 → "저는 S마케팅 서비스 관련 질문만 답할 수 있어요! 궁금한 서비스가 있으시면 편하게 물어봐 주세요 😊"
4. 참고 정보에 없는 내용은 절대 창작·추측하지 말 것.
5. 답변은 간결하고 친근하게. 이모지 적절히 사용.

[참고 정보${usedRAG ? ' — RAG 검색 결과' : ' — 전체 지식 베이스'}]
${context}`;

    const reply = await callOpenAI(systemPrompt, messages);

    // 대화 로그 (비동기, best-effort)
    logChat(lastUser, reply).catch(() => {});

    return respond(res, 200, { reply });
  } catch (err) {
    console.error('[chat]', err.message);
    return respond(res, 500, { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
};
