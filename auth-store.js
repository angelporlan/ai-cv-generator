const crypto = require('crypto');
const { Pool } = require('pg');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is required to enable auth persistence');
    }

    pool = new Pool({
      connectionString
    });
  }

  return pool;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please provide a valid email address');
  }

  if (normalizedPassword.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  return {
    email: normalizedEmail,
    password: normalizedPassword
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalKey] = String(storedHash || '').split(':');

  if (!salt || !originalKey) {
    return false;
  }

  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  const originalBuffer = Buffer.from(originalKey, 'hex');
  const derivedBuffer = Buffer.from(derivedKey, 'hex');

  if (originalBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(originalBuffer, derivedBuffer);
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function initAuthStore() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_states (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      client_updated_at TIMESTAMPTZ,
      server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx
    ON sessions (user_id);
  `);

  await db.query(`
    DELETE FROM sessions
    WHERE expires_at <= NOW();
  `);
}

async function createSession(userId) {
  const db = getPool();
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.query(
    `
      INSERT INTO sessions (token, user_id, expires_at)
      VALUES ($1, $2, $3)
    `,
    [token, userId, expiresAt]
  );

  return {
    token,
    expiresAt
  };
}

async function registerUser(email, password) {
  const db = getPool();
  const credentials = validateCredentials(email, password);
  const passwordHash = hashPassword(credentials.password);

  try {
    const { rows } = await db.query(
      `
        INSERT INTO users (email, password_hash)
        VALUES ($1, $2)
        RETURNING id, email, created_at
      `,
      [credentials.email, passwordHash]
    );

    return rows[0];
  } catch (error) {
    if (error && error.code === '23505') {
      throw new Error('An account already exists for that email');
    }

    throw error;
  }
}

async function authenticateUser(email, password) {
  const db = getPool();
  const credentials = validateCredentials(email, password);
  const { rows } = await db.query(
    `
      SELECT id, email, password_hash, created_at
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [credentials.email]
  );

  const user = rows[0];

  if (!user || !verifyPassword(credentials.password, user.password_hash)) {
    throw new Error('Incorrect email or password');
  }

  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at
  };
}

async function resolveSession(token) {
  if (!token) {
    return null;
  }

  const db = getPool();
  const { rows } = await db.query(
    `
      SELECT
        users.id,
        users.email,
        users.created_at
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = $1
        AND sessions.expires_at > NOW()
      LIMIT 1
    `,
    [token]
  );

  return rows[0] || null;
}

async function destroySession(token) {
  if (!token) {
    return;
  }

  const db = getPool();
  await db.query(
    `
      DELETE FROM sessions
      WHERE token = $1
    `,
    [token]
  );
}

async function getUserState(userId) {
  const db = getPool();
  const { rows } = await db.query(
    `
      SELECT state, client_updated_at, server_updated_at
      FROM user_states
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (!rows[0]) {
    return {
      state: {},
      clientUpdatedAt: null,
      serverUpdatedAt: null
    };
  }

  return {
    state: rows[0].state || {},
    clientUpdatedAt: rows[0].client_updated_at ? rows[0].client_updated_at.toISOString() : null,
    serverUpdatedAt: rows[0].server_updated_at ? rows[0].server_updated_at.toISOString() : null
  };
}

async function saveUserState(userId, state, clientUpdatedAt) {
  const db = getPool();
  const normalizedState = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const parsedClientUpdatedAt = clientUpdatedAt ? new Date(clientUpdatedAt) : null;
  const safeClientUpdatedAt = parsedClientUpdatedAt && !Number.isNaN(parsedClientUpdatedAt.getTime())
    ? parsedClientUpdatedAt
    : null;

  const { rows } = await db.query(
    `
      INSERT INTO user_states (user_id, state, client_updated_at, server_updated_at)
      VALUES ($1, $2::jsonb, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        state = EXCLUDED.state,
        client_updated_at = EXCLUDED.client_updated_at,
        server_updated_at = NOW()
      RETURNING server_updated_at
    `,
    [userId, JSON.stringify(normalizedState), safeClientUpdatedAt]
  );

  return {
    serverUpdatedAt: rows[0]?.server_updated_at ? rows[0].server_updated_at.toISOString() : null
  };
}

module.exports = {
  SESSION_TTL_MS,
  authenticateUser,
  createSession,
  destroySession,
  getUserState,
  initAuthStore,
  registerUser,
  resolveSession,
  saveUserState
};
