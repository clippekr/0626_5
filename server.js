'use strict';

// 로컬 개발 전용 서버 — Vercel 배포 시에는 api/chat.js가 서버리스 함수로 동작
try { require('dotenv').config(); } catch {}

const http = require('http');
const fs = require('fs');
const path = require('path');

const chatHandler = require('./api/chat');
const leadHandler = require('./api/lead');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.md':   'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
};

const ROOT = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // API 라우트
  if (req.url === '/api/chat' && req.method === 'POST') {
    return chatHandler(req, res);
  }
  if (req.url === '/api/chat' && req.method === 'OPTIONS') {
    return chatHandler(req, res);
  }
  if (req.url === '/api/lead' && (req.method === 'POST' || req.method === 'OPTIONS')) {
    return leadHandler(req, res);
  }

  // 정적 파일 서빙
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));

  // 경로 탈출 방지
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ S마케팅 로컬 서버 시작`);
  console.log(`   http://localhost:${PORT}\n`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.\n');
  }
});
