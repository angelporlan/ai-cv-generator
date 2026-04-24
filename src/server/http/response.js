const fs = require('fs');
const path = require('path');
const { getCorsHeaders } = require('./cors');

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  if (statusCode >= 400) {
    console.error(`[server] ERROR response ${statusCode}:`, payload.error || payload);
  }

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...getCorsHeaders(),
    ...extraHeaders
  });

  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, content, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    ...getCorsHeaders(),
    ...extraHeaders
  });

  response.end(content);
}

function streamFile(response, filePath, contentType, extraHeaders = {}) {
  response.writeHead(200, {
    'Content-Type': contentType,
    ...getCorsHeaders(),
    ...extraHeaders
  });

  const stream = fs.createReadStream(filePath);
  stream.on('error', (error) => {
    console.error('[static] Stream error:', error);
    if (!response.headersSent) {
      sendJson(response, 500, { ok: false, error: 'Could not read static file' });
      return;
    }

    response.destroy(error);
  });

  stream.pipe(response);
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json'
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
  getMimeType,
  sendJson,
  sendText,
  streamFile
};
