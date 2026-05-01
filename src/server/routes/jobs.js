const {
  createUserJobApplication,
  deleteUserJobApplication,
  listUserJobApplications,
  updateUserJobApplication
} = require('../../../auth-store');
const { readRequestBody } = require('../http/request');
const { sendJson } = require('../http/response');
const { getAuthenticatedUser } = require('../http/session');

function parseJobId(pathname) {
  const match = pathname.match(/^\/api\/jobs\/(\d+)$/);
  return match ? match[1] : null;
}

async function requireJobsUser(request, response) {
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

async function handleJobsList(request, requestUrl, response) {
  const user = await requireJobsUser(request, response);
  if (!user) return;

  const items = await listUserJobApplications(user.id, {
    status: requestUrl.searchParams.get('status') || 'all',
    search: requestUrl.searchParams.get('search') || ''
  });

  return sendJson(response, 200, { ok: true, items });
}

async function handleJobCreate(request, response) {
  const user = await requireJobsUser(request, response);
  if (!user) return;

  let body;
  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  try {
    const job = await createUserJobApplication(user.id, body || {});
    return sendJson(response, 201, { ok: true, job });
  } catch (error) {
    return sendJson(response, 400, { ok: false, error: error.message || 'Could not create job application' });
  }
}

async function handleJobUpdate(request, jobId, response) {
  const user = await requireJobsUser(request, response);
  if (!user) return;

  let body;
  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  try {
    const job = await updateUserJobApplication(user.id, jobId, body || {});
    if (!job) {
      return sendJson(response, 404, { ok: false, error: 'Job application not found' });
    }
    return sendJson(response, 200, { ok: true, job });
  } catch (error) {
    return sendJson(response, 400, { ok: false, error: error.message || 'Could not update job application' });
  }
}

async function handleJobDelete(request, jobId, response) {
  const user = await requireJobsUser(request, response);
  if (!user) return;

  const deleted = await deleteUserJobApplication(user.id, jobId);
  if (!deleted) {
    return sendJson(response, 404, { ok: false, error: 'Job application not found' });
  }

  return sendJson(response, 200, { ok: true });
}

module.exports = {
  handleJobCreate,
  handleJobDelete,
  handleJobUpdate,
  handleJobsList,
  parseJobId
};
