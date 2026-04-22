const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { createCvPdfResponse, createPdfDocumentFromMarkdown } = require('./cv-pdf');
const { CV_MAPPING } = require('./cv-content');
const {
  SESSION_TTL_MS,
  authenticateUser,
  createSession,
  destroySession,
  getUserState,
  initAuthStore,
  registerUser,
  resolveSession,
  saveUserState
} = require('./auth-store');

if (fs.existsSync('.env')) {
  fs.readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const [key, ...value] = line.split('=');
      if (key && value.length) {
        process.env[key.trim()] = value.join('=').trim();
      }
    });
}

const PORT = Number(process.env.PORT || 3002);
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 120000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_COOKIE_NAME = 'cv_studio_session';
const SESSION_SECRET = process.env.APP_SESSION_SECRET || 'change-me-in-production';
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

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  if (statusCode >= 400) {
    console.error(`[server] ERROR response ${statusCode}:`, payload.error || payload);
  }

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...getCorsHeaders(),
    ...extraHeaders
  });

  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, content, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    ...getCorsHeaders(),
    ...extraHeaders
  });

  response.end(content);
}

function sendFile(response, filePath, contentType, extraHeaders = {}) {
  if (!fs.existsSync(filePath)) {
    return sendJson(response, 404, { ok: false, error: 'File not found' });
  }

  response.writeHead(200, {
    'Content-Type': contentType,
    ...getCorsHeaders(),
    ...extraHeaders
  });

  response.end(fs.readFileSync(filePath));
}

function parseCookies(request) {
  const rawCookie = request.headers.cookie || '';
  const cookies = {};

  rawCookie.split(';').forEach((entry) => {
    const [rawKey, ...rawValue] = entry.split('=');
    const key = rawKey ? rawKey.trim() : '';
    if (!key) {
      return;
    }

    cookies[key] = decodeURIComponent(rawValue.join('=').trim());
  });

  return cookies;
}

function signSessionValue(token) {
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(token)
    .digest('hex');

  return `${token}.${signature}`;
}

function verifySessionValue(signedValue) {
  const [token, signature] = String(signedValue || '').split('.');

  if (!token || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(token)
    .digest('hex');

  const providedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  return token;
}

function serializeSessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(signSessionValue(token))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ].join('; ');
}

function serializeExpiredSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ].join('; ');
}

async function getAuthenticatedUser(request) {
  const cookies = parseCookies(request);
  const signedValue = cookies[SESSION_COOKIE_NAME];
  const sessionToken = verifySessionValue(signedValue);

  if (!sessionToken) {
    return null;
  }

  const user = await resolveSession(sessionToken);

  if (!user) {
    return null;
  }

  return {
    token: sessionToken,
    user
  };
}

function buildSessionPayload(user, statePayload = {}) {
  return {
    ok: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email
    },
    state: statePayload.state || {},
    clientUpdatedAt: statePayload.clientUpdatedAt || null,
    serverUpdatedAt: statePayload.serverUpdatedAt || null
  };
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

function buildAiActionMessages(action, cvMarkdown, userInput) {
  let systemMsg = '';
  let userMsg = '';

  switch (action) {
    case 'skill_gap':
      systemMsg = 'Eres un experto en reclutamiento tecnico y recursos humanos. Tu tarea es analizar un CV contra una oferta laboral y proporcionar un analisis de "Skill Gap". Devuelve el reporte en formato Markdown puro sin explicaciones adicionales fuera del reporte. No uses bloques de codigo.';
      userMsg = [
        'Realiza un analisis de "Skill Gap" entre mi CV y la oferta laboral.',
        'Proporciona:',
        '1. Un "Score de Compatibilidad" (%).',
        '2. Fortalezas (que cumplo).',
        '3. Brechas (que falta o no esta claro).',
        '4. Sugerencias de palabras clave a incluir en mi CV.',
        '',
        'Oferta laboral:',
        '---',
        userInput,
        '---',
        '',
        'CV original:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;

    case 'cover_letter':
      systemMsg = 'Eres un redactor experto en carreras profesionales. Escribe cartas de presentacion persuasivas, profesionales y modernas. Devuelve solo el texto de la carta en formato Markdown puro, sin explicaciones ni bloques de codigo.';
      userMsg = [
        'Escribe una carta de presentacion basada en mi CV para aplicar a la siguiente oferta.',
        'La carta debe ser persuasiva, destacar mis fortalezas relevantes para la oferta y mantener un tono profesional en espanol.',
        'Estructura la carta en Markdown.',
        '',
        'Oferta laboral:',
        '---',
        userInput,
        '---',
        '',
        'Mi CV:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;

    case 'optimize_star':
      systemMsg = 'Eres un experto en curriculums y optimizacion de logros. Tu tarea es reescribir la seccion de "Experiencia" del CV usando la metodologia STAR. Manten el resto del formato Markdown intacto. Devuelve solo el Markdown completo resultante, sin explicaciones ni bloques de codigo.';
      userMsg = [
        'Reescribe las vietas de experiencia de mi CV aplicando el metodo STAR para maximizar el impacto.',
        'Manten la estructura Markdown intacta. No modifiques la educacion ni los datos personales.',
        '',
        'Oferta laboral o notas adicionales (si las hay):',
        '---',
        userInput,
        '---',
        '',
        'Mi CV:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;

    case 'translate':
      systemMsg = 'Eres un traductor profesional experto en curriculums tecnicos. Traduce el documento manteniendo intacta la estructura Markdown original, los encabezados y la semantica tecnica. Devuelve solo el Markdown resultante, sin explicaciones ni bloques de codigo.';
      userMsg = [
        `Traduce el siguiente CV al idioma: ${userInput || 'Ingles'}.`,
        'Manten todos los caracteres especiales, iconos y estructura Markdown original.',
        '',
        'CV original:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;

    case 'adapt':
    default:
      systemMsg = [
        'Eres un experto en reclutamiento tecnico y optimizacion ATS.',
        'Adapta el CV del candidato a la oferta sin inventar experiencia no respaldada.',
        'Manten formato markdown limpio para este editor de CV.',
        'Devuelve solo markdown del CV, sin explicaciones ni bloques de codigo.'
      ].join(' ');
      userMsg = [
        'Adapta y optimiza este CV para la oferta laboral.',
        'Objetivos:',
        '- Reforzar palabras clave ATS relevantes de la oferta.',
        '- Priorizar logros e impacto cuantificable.',
        '- Mantener redaccion clara y profesional en espanol.',
        '- Conservar estructura markdown compatible con CV Studio.',
        '- No agregar datos falsos.',
        '',
        'Oferta laboral:',
        '---',
        userInput,
        '---',
        '',
        'CV original:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;
  }

  return [
    { role: 'system', content: systemMsg },
    { role: 'user', content: userMsg }
  ];
}

function buildLinkedInImportMessages(linkedInText) {
  return [
    {
      role: 'system',
      content: [
        'Eres un experto en redaccion de curriculums tecnicos y parseo de datos estructurados.',
        'Toma el texto pegado desde un perfil de LinkedIn y conviertelo a un formato Markdown limpio y profesional.',
        'Sigue la estructura estandar de CV: nombre, titulo, informacion de contacto, resumen, experiencia, educacion y habilidades.',
        'Devuelve solo el markdown del CV, sin explicaciones ni bloques de codigo.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        'Convierte este texto bruto de LinkedIn a un curriculum en formato Markdown estructurado.',
        'Objetivos:',
        '- Extraer nombre, cargo y datos de contacto.',
        '- Estructurar la experiencia profesional con cargos, empresas, fechas y descripciones concisas.',
        '- Estructurar educacion y proyectos si los hay.',
        '- Estructurar habilidades.',
        '- Eliminar texto irrelevante generado por la UI de LinkedIn.',
        '- Mantener un tono profesional en espanol.',
        '',
        'Texto de LinkedIn:',
        '---',
        linkedInText,
        '---'
      ].join('\n')
    }
  ];
}

function shouldRetryWithFallback(errorMessage) {
  const normalized = String(errorMessage || '').toLowerCase();
  return normalized.includes('no endpoints found')
    || normalized.includes('model not found')
    || normalized.includes('timeout');
}

async function callOpenRouterWithFallback(token, preferredModel, messages) {
  const modelCandidates = [...new Set([preferredModel, ...MODEL_FALLBACKS].filter(Boolean))];
  let lastError = null;

  for (const candidateModel of modelCandidates) {
    try {
      const responseText = await callOpenRouter(token, candidateModel, messages);
      return { responseText, usedModel: candidateModel };
    } catch (error) {
      lastError = error;
      if (!shouldRetryWithFallback(error?.message)) {
        throw error;
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
  } catch (error) {
    if (error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('timed out')) {
      const timeoutError = new Error(`OpenRouter request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      timeoutError.metadata = {
        raw: `The operation was aborted due to timeout after ${REQUEST_TIMEOUT_MS}ms while calling ${model}`
      };
      console.error('[OpenRouter TIMEOUT]', timeoutError.metadata.raw);
      throw timeoutError;
    }

    console.error('[OpenRouter EXCEPTION]', error.message);
    throw error;
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const rawBody = Buffer.concat(chunks).toString();
        resolve(rawBody ? JSON.parse(rawBody) : {});
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

  const template = body.template || 'harvard';
  const download = body.download !== false;
  const requestedFontSize = Number(body.fontSize);
  const fontSize = Number.isFinite(requestedFontSize) ? requestedFontSize : undefined;
  const showIcons = body.showIcons !== false;
  const accentColor = body.accentColor;
  const fontFamily = body.fontFamily;
  const pageMargin = body.pageMargin;

  if (download) {
    const authSession = await getAuthenticatedUser(request);
    if (!authSession) {
      return sendJson(response, 401, {
        ok: false,
        requiresAuth: true,
        error: 'Authentication required to download PDFs'
      });
    }
  }

  try {
    createPdfDocumentFromMarkdown(markdown, response, {
      download,
      template,
      fontSize,
      showIcons,
      accentColor,
      fontFamily,
      pageMargin
    });
  } catch (error) {
    console.error('[preview-pdf] EXCEPTION:', error);
    sendJson(response, 500, { ok: false, error: error.message });
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
  const userInput = typeof body?.jobDescription === 'string' ? body.jobDescription.trim() : '';
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const action = typeof body?.action === 'string' ? body.action.trim() : 'adapt';

  if (!markdown) {
    return sendJson(response, 400, { ok: false, error: 'Missing markdown' });
  }

  if (!userInput && action !== 'optimize_star' && action !== 'translate') {
    return sendJson(response, 400, { ok: false, error: 'Missing userInput (jobDescription)' });
  }

  if (!token) {
    return sendJson(response, 400, { ok: false, error: 'Missing token' });
  }

  try {
    const { responseText, usedModel } = await callOpenRouterWithFallback(
      token,
      model,
      buildAiActionMessages(action, markdown, userInput)
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
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      error: error.message || 'Failed to adapt CV',
      metadata: error.metadata || null
    });
  }
}

async function handleImportLinkedIn(request, response) {
  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const linkedInText = typeof body?.linkedInText === 'string' ? body.linkedInText.trim() : '';
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

  if (!linkedInText) {
    return sendJson(response, 400, { ok: false, error: 'Missing linkedInText' });
  }

  if (!token) {
    return sendJson(response, 400, { ok: false, error: 'Missing token' });
  }

  try {
    const { responseText, usedModel } = await callOpenRouterWithFallback(
      token,
      model,
      buildLinkedInImportMessages(linkedInText)
    );
    const cvMarkdown = stripMarkdownFences(responseText);

    if (!cvMarkdown) {
      return sendJson(response, 502, { ok: false, error: 'Empty response from AI model' });
    }

    return sendJson(response, 200, {
      ok: true,
      markdown: cvMarkdown,
      model: usedModel
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      error: error.message || 'Failed to import LinkedIn profile',
      metadata: error.metadata || null
    });
  }
}

async function handleAsk(requestUrl, response) {
  const token = requestUrl.searchParams.get('token');
  if (!token) {
    return sendJson(response, 400, { ok: false, error: 'Token missing in query parameters' });
  }

  try {
    const result = await callOpenRouter(token, requestUrl.searchParams.get('model') || DEFAULT_MODEL, [
      { role: 'user', content: requestUrl.searchParams.get('prompt') || 'Hello' }
    ]);
    sendJson(response, 200, { ok: true, response: result });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
}

async function handleAuthRegister(request, response) {
  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  try {
    const user = await registerUser(email, password);
    const session = await createSession(user.id);
    const state = await getUserState(user.id);

    return sendJson(
      response,
      201,
      buildSessionPayload(user, state),
      { 'Set-Cookie': serializeSessionCookie(session.token, session.expiresAt) }
    );
  } catch (error) {
    return sendJson(response, 400, { ok: false, error: error.message || 'Could not register user' });
  }
}

async function handleAuthLogin(request, response) {
  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  try {
    const user = await authenticateUser(email, password);
    const session = await createSession(user.id);
    const state = await getUserState(user.id);

    return sendJson(
      response,
      200,
      buildSessionPayload(user, state),
      { 'Set-Cookie': serializeSessionCookie(session.token, session.expiresAt) }
    );
  } catch (error) {
    return sendJson(response, 401, { ok: false, error: error.message || 'Invalid login' });
  }
}

async function handleAuthSession(request, response) {
  const authSession = await getAuthenticatedUser(request);

  if (!authSession) {
    return sendJson(response, 200, {
      ok: true,
      authenticated: false,
      user: null,
      state: {},
      clientUpdatedAt: null,
      serverUpdatedAt: null
    });
  }

  const state = await getUserState(authSession.user.id);
  return sendJson(response, 200, buildSessionPayload(authSession.user, state));
}

async function handleAuthLogout(request, response) {
  const authSession = await getAuthenticatedUser(request);

  if (authSession?.token) {
    await destroySession(authSession.token);
  }

  return sendJson(
    response,
    200,
    { ok: true, authenticated: false },
    { 'Set-Cookie': serializeExpiredSessionCookie() }
  );
}

async function handleAuthState(request, response) {
  const authSession = await getAuthenticatedUser(request);

  if (!authSession) {
    return sendJson(response, 401, { ok: false, error: 'Authentication required' });
  }

  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const state = body?.state;
  const clientUpdatedAt = typeof body?.clientUpdatedAt === 'string' ? body.clientUpdatedAt : null;

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return sendJson(response, 400, { ok: false, error: 'Invalid state payload' });
  }

  const saved = await saveUserState(authSession.user.id, state, clientUpdatedAt);
  return sendJson(response, 200, {
    ok: true,
    serverUpdatedAt: saved.serverUpdatedAt
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    return sendJson(response, 204, {});
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/cv') {
    const content = getEmbeddedCvContent(requestUrl.searchParams.get('file'));
    if (!content) {
      return sendJson(response, 404, { ok: false, error: 'CV content not found' });
    }
    return sendText(response, 200, content, 'text/markdown; charset=utf-8');
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/auth/register') {
    return handleAuthRegister(request, response);
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/auth/login') {
    return handleAuthLogin(request, response);
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/auth/logout') {
    return handleAuthLogout(request, response);
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/auth/session') {
    return handleAuthSession(request, response);
  }

  if (request.method === 'PUT' && requestUrl.pathname === '/api/auth/state') {
    return handleAuthState(request, response);
  }

  if (request.method === 'GET' && requestUrl.pathname === '/ask') {
    return handleAsk(requestUrl, response);
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/preview.pdf') {
    return handlePreviewPdf(request, response);
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/adapt-cv') {
    return handleAdaptCv(request, response);
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/import-linkedin') {
    return handleImportLinkedIn(request, response);
  }

  if (request.method === 'GET' && requestUrl.pathname === '/cv.pdf') {
    const result = createCvPdfResponse(response, requestUrl.searchParams.get('file'));
    if (!result.ok) {
      sendJson(response, result.statusCode || 500, { ok: false, error: result.error });
    }
    return;
  }

  if (request.method === 'GET') {
    let pathname = requestUrl.pathname;
    if (pathname === '/') {
      pathname = 'editor.html';
    }

    const safePathname = pathname.replace(/^\/+/, '');
    const filePath = path.join(PUBLIC_DIR, safePathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.ico': 'image/x-icon',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json'
      };

      return sendFile(response, filePath, mimeTypes[ext] || 'application/octet-stream');
    }
  }

  return sendJson(response, 404, { ok: false, error: 'Not found' });
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap() {
  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      await initAuthStore();
      server.listen(PORT, () => console.log(`Microservice on http://localhost:${PORT}`));
      return;
    } catch (error) {
      console.error(`[bootstrap] Database init failed (attempt ${attempts}/${maxAttempts}):`, error.message);

      if (attempts >= maxAttempts) {
        process.exitCode = 1;
        throw error;
      }

      await wait(3000);
    }
  }
}

bootstrap().catch((error) => {
  console.error('[bootstrap] Fatal startup error:', error);
});
