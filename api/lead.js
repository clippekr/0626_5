'use strict';

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return respond(res, 204, {});
  if (req.method !== 'POST')   return respond(res, 405, { error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const { name, phone, email, message, company } = body ?? {};

    if (!name && !phone && !email)
      return respond(res, 400, { error: '이름, 전화번호, 이메일 중 하나 이상 필요합니다.' });

    const sb = getSupabase();
    if (!sb)
      return respond(res, 503, { error: 'Supabase가 설정되지 않았습니다.' });

    const { error } = await sb.from('leads').insert({
      name:    (name    ?? '').slice(0, 100),
      phone:   (phone   ?? '').slice(0, 50),
      email:   (email   ?? '').slice(0, 200),
      company: (company ?? '').slice(0, 200),
      message: (message ?? '').slice(0, 2000),
    });

    if (error) {
      console.error('[lead]', error.message);
      return respond(res, 500, { error: '저장 중 오류가 발생했습니다.' });
    }

    return respond(res, 200, { ok: true });
  } catch (err) {
    console.error('[lead]', err.message);
    return respond(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
};
