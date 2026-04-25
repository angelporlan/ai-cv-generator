const { createPdfDocumentFromMarkdown } = require('../../../cv-pdf');
const {
  DEFAULT_MODEL,
  OPENROUTER_API_KEY
} = require('../config');
const { readRequestBody } = require('../http/request');
const { sendJson } = require('../http/response');
const { getAuthenticatedUser } = require('../http/session');
const {
  getUserUsageSummary,
  recordAiUsage
} = require('../../../auth-store');
const {
  askOpenRouter,
  buildAiActionMessages,
  buildLinkedInImportMessages,
  callOpenRouterWithFallback,
  stripMarkdownFences
} = require('../services/openrouter');

async function requireAiAccess(request, response) {
  if (!OPENROUTER_API_KEY) {
    sendJson(response, 503, {
      ok: false,
      error: 'OpenRouter server token is not configured'
    });
    return null;
  }

  const authSession = await getAuthenticatedUser(request);
  if (!authSession) {
    sendJson(response, 401, {
      ok: false,
      requiresAuth: true,
      error: 'Authentication required to use AI'
    });
    return null;
  }

  const usage = await getUserUsageSummary(authSession.user.id);
  if (!usage.canUseAi) {
    sendJson(response, 402, {
      ok: false,
      requiresSubscription: true,
      error: 'Free AI usage limit reached',
      usage: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      subscriptionStatus: usage.subscriptionStatus,
      upgradeUrl: '/pricing'
    });
    return null;
  }

  return {
    authSession,
    usage
  };
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
  const aiAccess = await requireAiAccess(request, response);
  if (!aiAccess) {
    return;
  }

  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const markdown = typeof body?.markdown === 'string' ? body.markdown.trim() : '';
  const userInput = typeof body?.jobDescription === 'string' ? body.jobDescription.trim() : '';
  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const action = typeof body?.action === 'string' ? body.action.trim() : 'adapt';

  if (!markdown) {
    return sendJson(response, 400, { ok: false, error: 'Missing markdown' });
  }

  if (!userInput && action !== 'optimize_star' && action !== 'translate') {
    return sendJson(response, 400, { ok: false, error: 'Missing userInput (jobDescription)' });
  }

  try {
    const { responseText, usedModel } = await callOpenRouterWithFallback(
      OPENROUTER_API_KEY,
      model,
      buildAiActionMessages(action, markdown, userInput)
    );
    const adaptedMarkdown = stripMarkdownFences(responseText);

    if (!adaptedMarkdown) {
      return sendJson(response, 502, { ok: false, error: 'Empty response from AI model' });
    }

    const usage = await recordAiUsage(aiAccess.authSession.user.id, action);

    return sendJson(response, 200, {
      ok: true,
      markdown: adaptedMarkdown,
      model: usedModel,
      usage
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
  const aiAccess = await requireAiAccess(request, response);
  if (!aiAccess) {
    return;
  }

  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const linkedInText = typeof body?.linkedInText === 'string' ? body.linkedInText.trim() : '';
  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

  if (!linkedInText) {
    return sendJson(response, 400, { ok: false, error: 'Missing linkedInText' });
  }

  try {
    const { responseText, usedModel } = await callOpenRouterWithFallback(
      OPENROUTER_API_KEY,
      model,
      buildLinkedInImportMessages(linkedInText)
    );
    const cvMarkdown = stripMarkdownFences(responseText);

    if (!cvMarkdown) {
      return sendJson(response, 502, { ok: false, error: 'Empty response from AI model' });
    }

    const usage = await recordAiUsage(aiAccess.authSession.user.id, 'import_linkedin');

    return sendJson(response, 200, {
      ok: true,
      markdown: cvMarkdown,
      model: usedModel,
      usage
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      error: error.message || 'Failed to import LinkedIn profile',
      metadata: error.metadata || null
    });
  }
}

async function handleAsk(request, requestUrl, response) {
  const aiAccess = await requireAiAccess(request, response);
  if (!aiAccess) {
    return;
  }

  try {
    const result = await askOpenRouter(
      OPENROUTER_API_KEY,
      requestUrl.searchParams.get('model') || DEFAULT_MODEL,
      requestUrl.searchParams.get('prompt') || 'Hello'
    );

    const usage = await recordAiUsage(aiAccess.authSession.user.id, 'ask');

    sendJson(response, 200, { ok: true, response: result, usage });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
}

module.exports = {
  handleAdaptCv,
  handleAsk,
  handleImportLinkedIn,
  handlePreviewPdf
};
