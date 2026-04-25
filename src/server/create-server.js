const http = require('http');
const { URL } = require('url');
const { handleAdaptCv, handleAsk, handleImportLinkedIn, handlePreviewPdf } = require('./routes/ai');
const { handleBillingCheckout, handleBillingPortal } = require('./routes/billing');
const {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthRegister,
  handleAuthSession,
  handleAuthState
} = require('./routes/auth');
const { handleCvPdf, handleCvSource } = require('./routes/cv');
const { handleStaticGet } = require('./routes/static');
const { handleStripeWebhook } = require('./routes/stripe-webhook');
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
