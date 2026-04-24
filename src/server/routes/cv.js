const { CV_MAPPING } = require('../../../cv-content');
const { createCvPdfResponse } = require('../../../cv-pdf');
const { sendJson, sendText } = require('../http/response');

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

module.exports = {
  handleCvPdf,
  handleCvSource
};
