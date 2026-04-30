const {
  authenticateUser,
  createSession,
  destroySession,
  getUserState,
  getUserUsageSummary,
  registerUser,
  saveUserState,
  touchSession
} = require('../../../auth-store');
const { readRequestBody } = require('../http/request');
const { sendJson } = require('../http/response');
const {
  getAuthenticatedUser,
  serializeExpiredSessionCookie,
  serializeSessionCookie
} = require('../http/session');

async function buildSessionPayload(user, statePayload = {}) {
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

module.exports = {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthRegister,
  handleAuthSession,
  handleAuthState
};
