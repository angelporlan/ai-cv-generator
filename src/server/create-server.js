const http = require('http');
const { URL } = require('url');
const { handleAdaptCv, handleAsk, handleImportLinkedIn, handlePreviewPdf } = require('./routes/ai');
const {
  handleAiArtifactCreate,
  handleAiArtifactDelete,
  handleAiArtifactsClear,
  handleAiArtifactsList,
  parseArtifactId
} = require('./routes/ai-artifacts');
const { handleBillingCheckout, handleBillingPortal } = require('./routes/billing');
const {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthRegister,
  handleAuthSession,
  handleAuthState,
  handleGoogleAuthCallback,
  handleGoogleAuthStart
} = require('./routes/auth');
const {
  handleCvCreate,
  handleCvDelete,
  handleCvGet,
  handleCvPdf,
  handleCvSource,
  handleCvUpdate,
  handleCvsList,
  parseCvId
} = require('./routes/cv');
const { handleStaticGet } = require('./routes/static');
const { handleStripeWebhook } = require('./routes/stripe-webhook');
const {
  handleJobCreate,
  handleJobDelete,
  handleJobUpdate,
  handleJobsList,
  parseJobId
} = require('./routes/jobs');
const { handleUsage } = require('./routes/usage');
const { sendJson } = require('./http/response');

function createServer() {
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'OPTIONS') {
      return sendJson(response, 204, {});
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/cv') {
      return handleCvSource(requestUrl, response);
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/cvs') {
      return handleCvsList(request, requestUrl, response);
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/cvs') {
      return handleCvCreate(request, response);
    }

    const cvId = parseCvId(requestUrl.pathname);
    if (cvId && request.method === 'GET') {
      return handleCvGet(request, cvId, response);
    }

    if (cvId && request.method === 'PATCH') {
      return handleCvUpdate(request, cvId, response);
    }

    if (cvId && request.method === 'DELETE') {
      return handleCvDelete(request, cvId, response);
    }

    if (request.method === 'GET' && requestUrl.pathname === '/auth/google') {
      return handleGoogleAuthStart(request, response);
    }

    if (request.method === 'GET' && requestUrl.pathname === '/auth/google/callback') {
      return handleGoogleAuthCallback(request, requestUrl, response);
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

    if (request.method === 'GET' && requestUrl.pathname === '/api/usage') {
      return handleUsage(request, response);
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/jobs') {
      return handleJobsList(request, requestUrl, response);
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/jobs') {
      return handleJobCreate(request, response);
    }

    const jobId = parseJobId(requestUrl.pathname);
    if (jobId && request.method === 'PATCH') {
      return handleJobUpdate(request, jobId, response);
    }

    if (jobId && request.method === 'DELETE') {
      return handleJobDelete(request, jobId, response);
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/ai-artifacts') {
      return handleAiArtifactsList(request, requestUrl, response);
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/ai-artifacts') {
      return handleAiArtifactCreate(request, response);
    }

    if (request.method === 'DELETE' && requestUrl.pathname === '/api/ai-artifacts') {
      return handleAiArtifactsClear(request, response);
    }

    const artifactId = parseArtifactId(requestUrl.pathname);
    if (artifactId && request.method === 'DELETE') {
      return handleAiArtifactDelete(request, artifactId, response);
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/billing/checkout') {
      return handleBillingCheckout(request, response);
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/billing/portal') {
      return handleBillingPortal(request, response);
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/stripe/webhook') {
      return handleStripeWebhook(request, response);
    }

    if (request.method === 'GET' && requestUrl.pathname === '/ask') {
      return handleAsk(request, requestUrl, response);
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
      return handleCvPdf(requestUrl, response);
    }

    if (request.method === 'GET' && await handleStaticGet(requestUrl, response)) {
      return;
    }

    return sendJson(response, 404, { ok: false, error: 'Not found' });
  });
}

module.exports = {
  createServer
};
