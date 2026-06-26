'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// 모듈 로드 시 한 번만 실행 (콜드 스타트마다 캐시)
function loadKnowledgeBase() {
  try {
    const dir = path.join(process.cwd(), 'uploads');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    if (!files.length) return '(등록된 지식 베이스 없음)';
    return files
      .map(f => `=== ${f} ===\n${fs.readFileSync(path.join(dir, f), 'utf-8')}`)
      .join('\n\n---\n\n');
  } catch (e) {
    console.error('Knowledge base load error:', e.message);
    return '(지식 베이스 로드 실패)';
  }
}

const KNOWLEDGE_BASE = loadKnowledgeBase();

const SYSTEM_PROMPT = `당신은 S마케팅의 AI 상담 챗봇 "S봇"입니다.
S마케팅은 중소기업·소상공인 전문 마케팅 파트너이며, 슬로건은 "작은 사업, 큰 성장의 시작"입니다.

[답변 규칙 — 반드시 준수]
1. 자기소개·대화형 질문("이름이 뭐야", "뭘 도와줄 수 있어" 등)
   → S봇이라는 이름과 역할을 자연스럽고 친근하게 소개한다.
2. 서비스·가격·정책 관련 질문
   → 아래 [지식 베이스]에 있는 내용만 사용해 답변한다.
   → 지식 베이스에 없으면 반드시 "자세한 내용은 무료 상담을 통해 안내드릴게요 😊"로 안내한다.
3. S마케팅과 무관한 질문 (날씨, 스포츠, 시사 등)
   → "저는 S마케팅 서비스 관련 질문만 답할 수 있어요! 궁금한 서비스가 있으시면 편하게 물어봐 주세요 😊"
4. 지식 베이스에 없는 정보는 절대 창작·추측하지 말 것.
5. 답변은 간결하고 친근하게 (불필요한 장황한 설명 지양).
6. 이모지를 적절히 사용해 친근한 톤 유지.

[지식 베이스]
${KNOWLEDGE_BASE}`;

// OpenAI API 호출 (native https, 의존성 없음)
const MODEL = 'gpt-4.1-mini'; // gpt-4.1-mini (GPT 5.4 mini 계열)

function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');

  const payload = JSON.stringify({
    model: MODEL,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    temperature: 0.6,
    max_tokens: 600,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('OpenAI 응답 파싱 실패')); }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Vercel(자동 파싱된 req.body) + 로컬 Node.js HTTP 스트림 모두 지원
function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) return resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('요청 본문 파싱 실패')); }
    });
    req.on('error', reject);
  });
}

function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  // CORS (Vercel 배포 시 동일 도메인이므로 기본적으로 불필요)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return respond(res, 204, {});
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const raw = body?.messages;

    if (!Array.isArray(raw) || raw.length === 0) {
      return respond(res, 400, { error: '메시지가 없습니다.' });
    }

    // 입력 정제: 허용된 role만, 내용 길이 제한, 최대 10개
    const messages = raw
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
      .slice(-10);

    const result = await callOpenAI(messages);

    if (result.error) {
      console.error('OpenAI error:', result.error);
      return respond(res, 502, { error: result.error.message });
    }

    const reply = result.choices?.[0]?.message?.content?.trim() ?? '응답을 받지 못했습니다.';
    return respond(res, 200, { reply });
  } catch (err) {
    console.error('Chat handler error:', err.message);
    return respond(res, 500, { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
};
