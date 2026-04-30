const { CV_MAPPING } = require('../../../cv-content');
const { createCvPdfResponse } = require('../../../cv-pdf');
const {
  createUserCv,
  deleteUserCv,
  getUserCv,
  listUserCvs,
  updateUserCv
} = require('../../../auth-store');
const { readRequestBody } = require('../http/request');
const { sendJson, sendText } = require('../http/response');
const { getAuthenticatedUser } = require('../http/session');

function getEmbeddedCvContent(fileName) {
  const safeFileName = fileName || 'cv.md';
  return CV_MAPPING[safeFileName] || null;
}

function handleCvSource(requestUrl, response) {
  const content = getEmbeddedCvContent(requestUrl.searchParams.get('file'));
  if (!content) {
    return sendJson(response, 404, { ok: false, error: 'CV content not found' });
  }

  return sendText(response, 200, content, 'text/markdown; charset=utf-8');
}

function handleCvPdf(requestUrl, response) {
  const result = createCvPdfResponse(response, requestUrl.searchParams.get('file'));
  if (!result.ok) {
    sendJson(response, result.statusCode || 500, { ok: false, error: result.error });
  }
}

function parseCvId(pathname) {
  const match = pathname.match(/^\/api\/cvs\/(\d+)$/);
  return match ? match[1] : null;
}

async function requireCvUser(request, response) {
  const authSession = await getAuthenticatedUser(request);
  if (!authSession) {
    sendJson(response, 401, { ok: false, error: 'Authentication required' });
    return null;
  }

  return authSession.user;
}

async function handleCvsList(request, requestUrl, response) {
  const user = await requireCvUser(request, response);
  if (!user) return;

  const page = Math.max(Number(requestUrl.searchParams.get('page')) || 1, 1);
  const limit = Math.min(Math.max(Number(requestUrl.searchParams.get('limit')) || 50, 1), 100);
  const status = requestUrl.searchParams.get('status') || 'all';
  const search = requestUrl.searchParams.get('search') || '';
  const result = await listUserCvs(user.id, {
    limit,
    offset: (page - 1) * limit,
    status,
    search
  });

  return sendJson(response, 200, {
    ok: true,
    items: result.items,
    total: result.total,
    page,
    limit: result.limit,
    hasMore: result.offset + result.items.length < result.total
  });
}

async function handleCvCreate(request, response) {
  const user = await requireCvUser(request, response);
  if (!user) return;

  let body;
  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  try {
    const cv = await createUserCv(user.id, body || {});
    return sendJson(response, 201, { ok: true, cv });
  } catch (error) {
    return sendJson(response, 400, { ok: false, error: error.message || 'Could not create CV' });
  }
}

async function handleCvGet(request, cvId, response) {
  const user = await requireCvUser(request, response);
  if (!user) return;

  const cv = await getUserCv(user.id, cvId);
  if (!cv) {
    return sendJson(response, 404, { ok: false, error: 'CV not found' });
  }

  return sendJson(response, 200, { ok: true, cv });
}

async function handleCvUpdate(request, cvId, response) {
  const user = await requireCvUser(request, response);
  if (!user) return;

  let body;
  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  try {
    const cv = await updateUserCv(user.id, cvId, body || {});
    if (!cv) {
      return sendJson(response, 404, { ok: false, error: 'CV not found' });
    }

    return sendJson(response, 200, { ok: true, cv });
  } catch (error) {
    return sendJson(response, 400, { ok: false, error: error.message || 'Could not update CV' });
  }
}

async function handleCvDelete(request, cvId, response) {
  const user = await requireCvUser(request, response);
  if (!user) return;

  const deleted = await deleteUserCv(user.id, cvId);
  if (!deleted) {
    return sendJson(response, 404, { ok: false, error: 'CV not found' });
  }

  return sendJson(response, 200, { ok: true });
}

module.exports = {
  handleCvCreate,
  handleCvDelete,
  handleCvGet,
  handleCvUpdate,
  handleCvsList,
  handleCvPdf,
  handleCvSource,
  parseCvId
};
