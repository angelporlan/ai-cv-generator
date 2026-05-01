const {
  createUserAiArtifact,
  deleteUserAiArtifact,
  deleteUserAiArtifacts,
  listUserAiArtifacts
} = require('../../../auth-store');
const { readRequestBody } = require('../http/request');
const { sendJson } = require('../http/response');
const { getAuthenticatedUser } = require('../http/session');

function parseArtifactId(pathname) {
  const match = pathname.match(/^\/api\/ai-artifacts\/(\d+)$/);
  return match ? match[1] : null;
}

async function requireArtifactUser(request, response) {
  const authSession = await getAuthenticatedUser(request);
  if (!authSession) {
    sendJson(response, 401, {
      ok: false,
      requiresAuth: true,
      error: 'Authentication required'
    });
    return null;
  }

  return authSession.user;
}

async function handleAiArtifactsList(request, requestUrl, response) {
  const user = await requireArtifactUser(request, response);
  if (!user) return;

  const limit = Math.min(Math.max(Number(requestUrl.searchParams.get('limit')) || 25, 1), 100);
  const items = await listUserAiArtifacts(user.id, { limit });
  return sendJson(response, 200, { ok: true, items });
}

async function handleAiArtifactCreate(request, response) {
  const user = await requireArtifactUser(request, response);
  if (!user) return;

  let body;
  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  try {
    const artifact = await createUserAiArtifact(user.id, body || {});
    return sendJson(response, 201, { ok: true, artifact });
  } catch (error) {
    return sendJson(response, 400, { ok: false, error: error.message || 'Could not create AI artifact' });
  }
}

async function handleAiArtifactDelete(request, artifactId, response) {
  const user = await requireArtifactUser(request, response);
  if (!user) return;

  const deleted = await deleteUserAiArtifact(user.id, artifactId);
  if (!deleted) {
    return sendJson(response, 404, { ok: false, error: 'AI artifact not found' });
  }

  return sendJson(response, 200, { ok: true });
}

async function handleAiArtifactsClear(request, response) {
  const user = await requireArtifactUser(request, response);
  if (!user) return;

  await deleteUserAiArtifacts(user.id);
  return sendJson(response, 200, { ok: true });
}

module.exports = {
  handleAiArtifactCreate,
  handleAiArtifactDelete,
  handleAiArtifactsClear,
  handleAiArtifactsList,
  parseArtifactId
};
