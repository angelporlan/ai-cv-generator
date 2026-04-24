const fs = require('fs/promises');
const path = require('path');
const { PUBLIC_DIR } = require('../config');
const { getMimeType, streamFile } = require('../http/response');

async function handleStaticGet(requestUrl, response) {
  let pathname = requestUrl.pathname;
  if (pathname === '/') {
    pathname = '/editor.html';
  }

  const safePathname = pathname.replace(/^\/+/, '');
  const resolvedPath = path.resolve(PUBLIC_DIR, safePathname);

  if (!resolvedPath.startsWith(PUBLIC_DIR + path.sep) && resolvedPath !== path.join(PUBLIC_DIR, 'editor.html')) {
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
        : 'no-cache'
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  handleStaticGet
};
