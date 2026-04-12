const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { createCvPdfResponse, createPdfDocumentFromMarkdown } = require('./cv-pdf');
const { CV_MAPPING } = require('./cv-content');

const PORT = Number(process.env.PORT || 3002);
if (fs.existsSync('.env')) {
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const DEFAULT_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';
const DEFAULT_PROMPT = 'Hola, soy tu asistente de CV.';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 60000;
const PUBLIC_DIR = path.join(__dirname, 'public');


function sendJson(response, statusCode, payload) {
  if (statusCode >= 400) {
    console.error(`[server] ERROR response ${statusCode}:`, payload.error || payload);
  }

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, content, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  response.end(content);
}

function sendFile(response, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    return sendJson(response, 404, { ok: false, error: 'File not found' });
  }

  return sendText(response, 200, fs.readFileSync(filePath, 'utf8'), contentType);
}

function getTextFromOpenRouter(data) {
  return data?.choices?.[0]?.message?.content ?? '';
}

async function callOpenRouter(token, model, messages) {
  try {
    const openRouterResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost:3002',
        'X-Title': 'CV Optimizer'
      },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    console.log(`[OpenRouter] Status: ${openRouterResponse.status}`);
    const data = await openRouterResponse.json();

    if (!openRouterResponse.ok) {
      console.error('[OpenRouter API Error]', JSON.stringify(data, null, 2));
      throw new Error(data?.error?.message || `OpenRouter failed: ${openRouterResponse.status}`);
    }

    return getTextFromOpenRouter(data);
  } catch (err) {
    console.error('[OpenRouter EXCEPTION]', err.message);
    throw err;
  }
}



function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function getEmbeddedCvContent(fileName) {
  const safeFileName = fileName || 'cv.md';
  return CV_MAPPING[safeFileName] || null;
}



async function handlePreviewPdf(request, response) {
  let body;
  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const markdown = typeof body?.markdown === 'string' ? body.markdown : '';
  if (!markdown.trim()) {
    return sendJson(response, 400, { ok: false, error: 'Missing markdown' });
  }

  // Permitir elegir plantilla
  const template = body.template || 'harvard';
  const download = body.download !== false;
  const requestedFontSize = Number(body.fontSize);
  const fontSize = Number.isFinite(requestedFontSize) ? requestedFontSize : undefined;

  try {
    createPdfDocumentFromMarkdown(markdown, response, { download, template, fontSize });
  } catch (err) {
    console.error('[preview-pdf] EXCEPTION:', err);
    sendJson(response, 500, { ok: false, error: err.message });
  }
}


const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') return sendJson(response, 204, {});

  if (request.method === 'GET' && requestUrl.pathname === '/') {
    return sendFile(response, path.join(PUBLIC_DIR, 'editor.html'), 'text/html; charset=utf-8');
  }

  if (request.method === 'GET' && requestUrl.pathname === '/app.js') {
    return sendFile(response, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript; charset=utf-8');
  }

  if (request.method === 'GET' && requestUrl.pathname === '/styles.css') {
    return sendFile(response, path.join(PUBLIC_DIR, 'styles.css'), 'text/css; charset=utf-8');
  }

  if (request.method === 'GET' && requestUrl.pathname === '/favicon.ico') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/cv') {
    const content = getEmbeddedCvContent(requestUrl.searchParams.get('file'));
    if (!content) {
      return sendJson(response, 404, { ok: false, error: 'CV content not found' });
    }

    return sendText(response, 200, content, 'text/markdown; charset=utf-8');
  }

  if (request.method === 'GET' && requestUrl.pathname === '/ask') {
    return await handleAsk(requestUrl, response);
  }


  if (request.method === 'POST' && requestUrl.pathname === '/api/preview.pdf') {
    return await handlePreviewPdf(request, response);
  }

  if (request.method === 'GET' && requestUrl.pathname === '/cv.pdf') {
    const result = createCvPdfResponse(response, requestUrl.searchParams.get('file'));
    if (!result.ok) sendJson(response, result.statusCode || 500, { ok: false, error: result.error });
    return;
  }

  sendJson(response, 404, { ok: false, error: 'Not found' });
});

async function handleAsk(requestUrl, response) {
  const token = requestUrl.searchParams.get('token');
  if (!token) return sendJson(response, 400, { ok: false, error: 'Token missing in query parameters' });
  try {
    const res = await callOpenRouter(token, requestUrl.searchParams.get('model') || DEFAULT_MODEL, [
      { role: 'user', content: requestUrl.searchParams.get('prompt') || 'Hello' }
    ]);
    sendJson(response, 200, { ok: true, response: res });
  } catch (err) {
    sendJson(response, 500, { ok: false, error: err.message });
  }
}

server.listen(PORT, () => console.log(`Microservice on http://localhost:${PORT}`));
