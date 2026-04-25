const {
  authenticateUser,
  createSession,
  destroySession,
  getUserState,
  getUserUsageSummary,
  registerUser,
  saveUserState
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
      await buildSessionPayload(user, state),
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
      serverUpdatedAt: null,
      usage: null,
      billing: null
    });
  }

  const state = await getUserState(authSession.user.id);
  return sendJson(response, 200, await buildSessionPayload(authSession.user, state));
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

module.exports = {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthRegister,
  handleAuthSession,
  handleAuthState
};
