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

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const DEFAULT_PROMPT = 'Hola, soy tu asistente de CV.';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 120000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MODEL_FALLBACKS = [
  DEFAULT_MODEL,
  'openai/gpt-4o-mini',
  'openai/gpt-oss-120b:free',
  'google/gemma-4-31b-it:free',
  'cohere/rerank-4-pro',
  'google/gemini-2.0-flash-001',
  'nvidia/nemotron-nano-9b-v2:free',
  'qwen/qwen3-coder:free',
  'anthropic/claude-3.5-haiku'
];


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

function formatOpenRouterError(data, statusCode) {
  const message = data?.error?.message || `OpenRouter failed: ${statusCode}`;
  const raw = data?.error?.metadata?.raw;
  if (raw && raw !== message) {
    return {
      message,
      metadata: { raw }
    };
  }

  return { message };
}

function stripMarkdownFences(text) {
  if (typeof text !== 'string') {
    return '';
  }

  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function buildAtsAdaptationMessages(cvMarkdown, jobDescription) {
  return [
    {
      role: 'system',
      content: [
        'Eres un experto en reclutamiento técnico y optimización ATS.',
        'Adapta el CV del candidato a la oferta sin inventar experiencia no respaldada.',
        'Mantén formato markdown limpio para este editor de CV.',
        'Devuelve solo markdown del CV, sin explicaciones, sin bloques de código.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        'Adapta y optimiza este CV para la oferta laboral.',
        'Objetivos:',
        '- Reforzar palabras clave ATS relevantes de la oferta.',
        '- Priorizar logros e impacto cuantificable.',
        '- Mantener redacción clara y profesional en español.',
        '- Conservar estructura markdown compatible con CV Studio.',
        '- No agregar datos falsos.',
        '- Sigue estrictamente el formato markdown, sin incluir explicaciones ni bloques de código. Devuelve solo el markdown adaptado del CV.',
        '',
        'Oferta laboral:',
        '---',
        jobDescription,
        '---',
        '',
        'CV original:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n')
    }
  ];
}

function shouldRetryWithFallback(errorMessage) {
  const normalized = String(errorMessage || '').toLowerCase();
  return normalized.includes('no endpoints found') || normalized.includes('model not found') || normalized.includes('timeout');
}

async function callOpenRouterWithFallback(token, preferredModel, messages) {
  const modelCandidates = [...new Set([preferredModel, ...MODEL_FALLBACKS].filter(Boolean))];
  let lastError = null;

  for (const candidateModel of modelCandidates) {
    try {
      const responseText = await callOpenRouter(token, candidateModel, messages);
      return { responseText, usedModel: candidateModel };
    } catch (err) {
      lastError = err;
      if (!shouldRetryWithFallback(err?.message)) {
        throw err;
      }
      console.warn(`[OpenRouter] Model unavailable, trying fallback: ${candidateModel}`);
    }
  }

  throw lastError || new Error('No available model found in fallback list');
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
      const errorInfo = formatOpenRouterError(data, openRouterResponse.status);
      const error = new Error(errorInfo.message);
      error.metadata = errorInfo.metadata;
      throw error;
    }

    return getTextFromOpenRouter(data);
  } catch (err) {
    if (err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('timed out')) {
      const timeoutError = new Error(`OpenRouter request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      timeoutError.metadata = {
        raw: `The operation was aborted due to timeout after ${REQUEST_TIMEOUT_MS}ms while calling ${model}`
      };
      console.error('[OpenRouter TIMEOUT]', timeoutError.metadata.raw);
      throw timeoutError;
    }

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

async function handleAdaptCv(request, response) {
  let body;
  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const markdown = typeof body?.markdown === 'string' ? body.markdown.trim() : '';
  const jobDescription = typeof body?.jobDescription === 'string' ? body.jobDescription.trim() : '';
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

  if (!markdown) {
    return sendJson(response, 400, { ok: false, error: 'Missing markdown' });
  }

  if (!jobDescription) {
    return sendJson(response, 400, { ok: false, error: 'Missing jobDescription' });
  }

  if (!token) {
    return sendJson(response, 400, { ok: false, error: 'Missing token' });
  }

  try {
    const { responseText, usedModel } = await callOpenRouterWithFallback(
      token,
      model,
      buildAtsAdaptationMessages(markdown, jobDescription)
    );
    const adaptedMarkdown = stripMarkdownFences(responseText);

    if (!adaptedMarkdown) {
      return sendJson(response, 502, { ok: false, error: 'Empty response from AI model' });
    }

    return sendJson(response, 200, {
      ok: true,
      markdown: adaptedMarkdown,
      model: usedModel
    });
  } catch (err) {
    return sendJson(response, 500, {
      ok: false,
      error: err.message || 'Failed to adapt CV',
      metadata: err.metadata || null
    });
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

  if (request.method === 'POST' && requestUrl.pathname === '/api/adapt-cv') {
    return await handleAdaptCv(request, response);
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
