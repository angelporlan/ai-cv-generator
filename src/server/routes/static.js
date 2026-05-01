const fs = require('fs/promises');
const path = require('path');
const { PUBLIC_DIR } = require('../config');
const { getMimeType, streamFile } = require('../http/response');

const SPA_DIR = path.join(PUBLIC_DIR, 'app-spa');
const SPA_INDEX = path.join(SPA_DIR, 'index.html');
const LEGACY_INDEX = path.join(PUBLIC_DIR, 'editor.html');

async function handleStaticGet(requestUrl, response) {
  let pathname = requestUrl.pathname;
  if (pathname === '/') {
    pathname = '/app-spa/index.html';
  }

  const safePathname = pathname.replace(/^\/+/, '');
  const resolvedPath = path.resolve(PUBLIC_DIR, safePathname);

  if (!resolvedPath.startsWith(PUBLIC_DIR + path.sep) && resolvedPath !== LEGACY_INDEX) {
    return false;
  }

  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      return false;
    }

    streamFile(response, resolvedPath, getMimeType(resolvedPath), {
      'Cache-Control': safePathname.startsWith('favicon/') || safePathname.startsWith('svg/')
        ? 'public, max-age=86400'
        : 'no-store, no-cache, must-revalidate'
    });
    return true;
  } catch {
    if (pathname.startsWith('/api/') || pathname.startsWith('/auth/') || pathname === '/cv.pdf') {
      return false;
    }

    try {
      await fs.stat(SPA_INDEX);
      streamFile(response, SPA_INDEX, 'text/html; charset=utf-8', {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      });
      return true;
    } catch {
      try {
        await fs.stat(LEGACY_INDEX);
        streamFile(response, LEGACY_INDEX, 'text/html; charset=utf-8', {
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        });
        return true;
      } catch {
        return false;
      }
    }
  }
}

module.exports = {
  handleStaticGet
};
