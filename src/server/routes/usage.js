const { getUserUsageSummary } = require('../../../auth-store');
const { sendJson } = require('../http/response');
const { getAuthenticatedUser } = require('../http/session');

async function handleUsage(request, response) {
  const authSession = await getAuthenticatedUser(request);

  if (!authSession) {
    return sendJson(response, 401, {
      ok: false,
      requiresAuth: true,
      error: 'Authentication required to view usage'
    });
  }

  const usage = await getUserUsageSummary(authSession.user.id);
  return sendJson(response, 200, {
    ok: true,
    ...usage
  });
}

module.exports = {
  handleUsage
};
