const { createPdfDocumentFromMarkdown } = require('../../../cv-pdf');
const { DEFAULT_MODEL } = require('../config');
const { readRequestBody } = require('../http/request');
const { sendJson } = require('../http/response');
const { getAuthenticatedUser } = require('../http/session');
const {
  askOpenRouter,
  buildAiActionMessages,
  buildLinkedInImportMessages,
  callOpenRouterWithFallback,
  stripMarkdownFences
} = require('../services/openrouter');

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
  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const markdown = typeof body?.markdown === 'string' ? body.markdown.trim() : '';
  const userInput = typeof body?.jobDescription === 'string' ? body.jobDescription.trim() : '';
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const action = typeof body?.action === 'string' ? body.action.trim() : 'adapt';

  if (!markdown) {
    return sendJson(response, 400, { ok: false, error: 'Missing markdown' });
  }

  if (!userInput && action !== 'optimize_star' && action !== 'translate') {
    return sendJson(response, 400, { ok: false, error: 'Missing userInput (jobDescription)' });
  }

  if (!token) {
    return sendJson(response, 400, { ok: false, error: 'Missing token' });
  }

  try {
    const { responseText, usedModel } = await callOpenRouterWithFallback(
      token,
      model,
      buildAiActionMessages(action, markdown, userInput)
    );
    const adaptedMarkdown = stripMarkdownFences(responseText);

    if (!adaptedMarkdown) {
      return sendJson(response, 502, { ok: false, error: 'Empty response from AI model' });
    }

    return sendJson(response, 200, {
      ok: true,
      markdown: adaptedMarkdown,
      model: usedModel
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
  let body;

  try {
    body = await readRequestBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
  }

  const linkedInText = typeof body?.linkedInText === 'string' ? body.linkedInText.trim() : '';
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

  if (!linkedInText) {
    return sendJson(response, 400, { ok: false, error: 'Missing linkedInText' });
  }

  if (!token) {
    return sendJson(response, 400, { ok: false, error: 'Missing token' });
  }

  try {
    const { responseText, usedModel } = await callOpenRouterWithFallback(
      token,
      model,
      buildLinkedInImportMessages(linkedInText)
    );
    const cvMarkdown = stripMarkdownFences(responseText);

    if (!cvMarkdown) {
      return sendJson(response, 502, { ok: false, error: 'Empty response from AI model' });
    }

    return sendJson(response, 200, {
      ok: true,
      markdown: cvMarkdown,
      model: usedModel
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      error: error.message || 'Failed to import LinkedIn profile',
      metadata: error.metadata || null
    });
  }
}

async function handleAsk(requestUrl, response) {
  const token = requestUrl.searchParams.get('token');
  if (!token) {
    return sendJson(response, 400, { ok: false, error: 'Token missing in query parameters' });
  }

  try {
    const result = await askOpenRouter(
      token,
      requestUrl.searchParams.get('model') || DEFAULT_MODEL,
      requestUrl.searchParams.get('prompt') || 'Hello'
    );

    sendJson(response, 200, { ok: true, response: result });
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
