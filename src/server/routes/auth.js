const crypto = require('crypto');
const {
  authenticateUser,
  createSession,
  destroySession,
  findOrCreateGoogleUser,
  getUserState,
  getUserUsageSummary,
  registerUser,
  saveUserState,
  touchSession
} = require('../../../auth-store');
const { readRequestBody } = require('../http/request');
const { sendJson } = require('../http/response');
const {
  APP_BASE_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SESSION_COOKIE_SECURE
} = require('../config');
const { syncBillingStatusForUser } = require('./billing');
const {
  getAuthenticatedUser,
  serializeExpiredSessionCookie,
  serializeSessionCookie
} = require('../http/session');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_STATE_COOKIE = 'cv_studio_google_oauth_state';

function getGoogleRedirectUri() {
  return `${APP_BASE_URL.replace(/\/$/, '')}/auth/google/callback`;
}

function serializeGoogleStateCookie(value, maxAgeSeconds = 300) {
  const parts = [
    `${GOOGLE_STATE_COOKIE}=${encodeURIComponent(value || '')}`,
    'Path=/auth/google',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, maxAgeSeconds)}`,
    'Priority=High'
  ];

  if (SESSION_COOKIE_SECURE) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function parseCookies(request) {
  const rawCookie = request.headers.cookie || '';
  const cookies = {};

  rawCookie.split(';').forEach((entry) => {
    const [rawKey, ...rawValue] = entry.split('=');
    const key = rawKey ? rawKey.trim() : '';
    if (!key) return;
    cookies[key] = decodeURIComponent(rawValue.join('=').trim());
  });

  return cookies;
}

function redirect(response, location, headers = {}) {
  response.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
    ...headers
  });
  response.end();
}

async function buildSessionPayload(user, statePayload = {}) {
  await syncBillingStatusForUser(user.id);
  const usage = await getUserUsageSummary(user.id);

  return {
    ok: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email
    },
    state: statePayload.state || {},
    clientUpdatedAt: statePayload.clientUpdatedAt || null,
    serverUpdatedAt: statePayload.serverUpdatedAt || null,
    usage,
    billing: usage.billing
  };
}

function getAuthResponseHeaders(extraHeaders = {}) {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0',
    ...extraHeaders
  };
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
      await buildSessionPayload(user, state),
      getAuthResponseHeaders({ 'Set-Cookie': serializeSessionCookie(session.token, session.expiresAt) })
    );
  } catch (error) {
    return sendJson(
      response,
      400,
      { ok: false, error: error.message || 'Could not register user' },
      getAuthResponseHeaders()
    );
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
      await buildSessionPayload(user, state),
      getAuthResponseHeaders({ 'Set-Cookie': serializeSessionCookie(session.token, session.expiresAt) })
    );
  } catch (error) {
    return sendJson(
      response,
      401,
      { ok: false, error: error.message || 'Invalid login' },
      getAuthResponseHeaders()
    );
  }
}

async function handleAuthSession(request, response) {
  const authSession = await getAuthenticatedUser(request);

  if (!authSession) {
    return sendJson(
      response,
      200,
      {
        ok: true,
        authenticated: false,
        user: null,
        state: {},
        clientUpdatedAt: null,
        serverUpdatedAt: null,
        usage: null,
        billing: null
      },
      getAuthResponseHeaders({ 'Set-Cookie': serializeExpiredSessionCookie() })
    );
  }

  const state = await getUserState(authSession.user.id);
  const renewedSession = await touchSession(authSession.token);

  if (!renewedSession?.expiresAt) {
    return sendJson(
      response,
      200,
      {
        ok: true,
        authenticated: false,
        user: null,
        state: {},
        clientUpdatedAt: null,
        serverUpdatedAt: null,
        usage: null,
        billing: null
      },
      getAuthResponseHeaders({ 'Set-Cookie': serializeExpiredSessionCookie() })
    );
  }

  return sendJson(
    response,
    200,
    await buildSessionPayload(authSession.user, state),
    getAuthResponseHeaders({
      'Set-Cookie': serializeSessionCookie(authSession.token, new Date(renewedSession.expiresAt))
    })
  );
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
    getAuthResponseHeaders({ 'Set-Cookie': serializeExpiredSessionCookie() })
  );
}

async function handleAuthState(request, response) {
  const authSession = await getAuthenticatedUser(request);

  if (!authSession) {
    return sendJson(response, 401, { ok: false, error: 'Authentication required' }, getAuthResponseHeaders());
  }

  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' }, getAuthResponseHeaders());
  }

  const state = body?.state;
  const clientUpdatedAt = typeof body?.clientUpdatedAt === 'string' ? body.clientUpdatedAt : null;

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return sendJson(response, 400, { ok: false, error: 'Invalid state payload' }, getAuthResponseHeaders());
  }

  const saved = await saveUserState(authSession.user.id, state, clientUpdatedAt);
  const renewedSession = await touchSession(authSession.token);

  if (!renewedSession?.expiresAt) {
    return sendJson(
      response,
      401,
      { ok: false, error: 'Authentication required' },
      getAuthResponseHeaders({ 'Set-Cookie': serializeExpiredSessionCookie() })
    );
  }

  return sendJson(
    response,
    200,
    {
      ok: true,
      serverUpdatedAt: saved.serverUpdatedAt
    },
    getAuthResponseHeaders({
      'Set-Cookie': serializeSessionCookie(authSession.token, new Date(renewedSession.expiresAt))
    })
  );
}

async function handleGoogleAuthStart(request, response) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return sendJson(response, 503, { ok: false, error: 'Google OAuth is not configured' }, getAuthResponseHeaders());
  }

  const state = crypto.randomBytes(24).toString('hex');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account'
  });

  return redirect(response, `${GOOGLE_AUTH_URL}?${params.toString()}`, {
    'Set-Cookie': serializeGoogleStateCookie(state)
  });
}

async function exchangeGoogleCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: getGoogleRedirectUri(),
    grant_type: 'authorization_code'
  });

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || 'Could not exchange Google code');
  }

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`
    }
  });
  const profile = await profileResponse.json().catch(() => ({}));

  if (!profileResponse.ok) {
    throw new Error(profile.error_description || profile.error || 'Could not read Google profile');
  }

  return profile;
}

async function handleGoogleAuthCallback(request, requestUrl, response) {
  const code = requestUrl.searchParams.get('code') || '';
  const state = requestUrl.searchParams.get('state') || '';
  const error = requestUrl.searchParams.get('error') || '';
  const cookies = parseCookies(request);
  const expectedState = cookies[GOOGLE_STATE_COOKIE] || '';
  const clearStateCookie = serializeGoogleStateCookie('', 0);

  if (error || !code || !state || !expectedState || state !== expectedState) {
    return redirect(response, '/?auth=google_error', {
      'Set-Cookie': clearStateCookie
    });
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const user = await findOrCreateGoogleUser(profile);
    const session = await createSession(user.id);

    return redirect(response, '/?auth=google_success', {
      'Set-Cookie': [
        clearStateCookie,
        serializeSessionCookie(session.token, session.expiresAt)
      ]
    });
  } catch (callbackError) {
    console.error('[auth] Google OAuth failed:', callbackError);
    return redirect(response, '/?auth=google_error', {
      'Set-Cookie': clearStateCookie
    });
  }
}

module.exports = {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthRegister,
  handleAuthSession,
  handleAuthState,
  handleGoogleAuthCallback,
  handleGoogleAuthStart
};
