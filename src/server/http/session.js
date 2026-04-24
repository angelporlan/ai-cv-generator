const crypto = require('crypto');
const {
  SESSION_COOKIE_NAME,
  SESSION_SECRET
} = require('../config');
const { resolveSession } = require('../../../auth-store');

function parseCookies(request) {
  const rawCookie = request.headers.cookie || '';
  const cookies = {};

  rawCookie.split(';').forEach((entry) => {
    const [rawKey, ...rawValue] = entry.split('=');
    const key = rawKey ? rawKey.trim() : '';
    if (!key) {
      return;
    }

    cookies[key] = decodeURIComponent(rawValue.join('=').trim());
  });

  return cookies;
}

function signSessionValue(token) {
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(token)
    .digest('hex');

  return `${token}.${signature}`;
}

function verifySessionValue(signedValue) {
  const [token, signature] = String(signedValue || '').split('.');

  if (!token || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(token)
    .digest('hex');

  const providedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  return token;
}

function serializeSessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(signSessionValue(token))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ].join('; ');
}

function serializeExpiredSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ].join('; ');
}

async function getAuthenticatedUser(request) {
  const cookies = parseCookies(request);
  const signedValue = cookies[SESSION_COOKIE_NAME];
  const sessionToken = verifySessionValue(signedValue);

  if (!sessionToken) {
    return null;
  }

  const user = await resolveSession(sessionToken);

  if (!user) {
    return null;
  }

  return {
    token: sessionToken,
    user
  };
}

module.exports = {
  getAuthenticatedUser,
  serializeExpiredSessionCookie,
  serializeSessionCookie
};
