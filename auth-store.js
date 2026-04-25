const crypto = require('crypto');
const { promisify } = require('util');
const { Pool } = require('pg');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const FREE_AI_USAGE_LIMIT = 3;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const scryptAsync = promisify(crypto.scrypt);

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

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)).toString('hex');
  return `${salt}:${derivedKey}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, originalKey] = String(storedHash || '').split(':');

  if (!salt || !originalKey) {
    return false;
  }

  const derivedKey = (await scryptAsync(password, salt, 64)).toString('hex');
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

function isActiveSubscriptionStatus(status) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(status || '').toLowerCase());
}

function toIsoDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function normalizeBillingRow(row = {}) {
  const subscriptionStatus = row.subscription_status || 'none';
  return {
    stripeCustomerId: row.stripe_customer_id || null,
    stripeSubscriptionId: row.stripe_subscription_id || null,
    subscriptionStatus,
    plan: row.plan || 'free',
    currentPeriodEnd: toIsoDate(row.current_period_end),
    isActive: isActiveSubscriptionStatus(subscriptionStatus)
  };
}

function buildUsageSummary(usageRow = {}, billingRow = {}) {
  const used = Number(usageRow.ai_usage_count || 0);
  const billing = normalizeBillingRow(billingRow);
  const remaining = billing.isActive ? null : Math.max(0, FREE_AI_USAGE_LIMIT - used);

  return {
    used,
    limit: FREE_AI_USAGE_LIMIT,
    remaining,
    canUseAi: billing.isActive || used < FREE_AI_USAGE_LIMIT,
    subscriptionStatus: billing.subscriptionStatus,
    billing,
    lastAction: usageRow.last_ai_action || null,
    lastUsedAt: toIsoDate(usageRow.last_used_at)
  };
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
    CREATE TABLE IF NOT EXISTS user_ai_usage (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ai_usage_count INTEGER NOT NULL DEFAULT 0,
      last_ai_action TEXT,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_billing (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id TEXT UNIQUE,
      stripe_subscription_id TEXT UNIQUE,
      subscription_status TEXT NOT NULL DEFAULT 'none',
      plan TEXT NOT NULL DEFAULT 'free',
      current_period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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

async function ensureUserSaasRows(userId) {
  const db = getPool();

  await db.query(
    `
      INSERT INTO user_ai_usage (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );

  await db.query(
    `
      INSERT INTO user_billing (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

async function registerUser(email, password) {
  const db = getPool();
  const credentials = validateCredentials(email, password);
  const passwordHash = await hashPassword(credentials.password);

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

  if (!user || !(await verifyPassword(credentials.password, user.password_hash))) {
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

async function getUserUsageSummary(userId) {
  const db = getPool();
  await ensureUserSaasRows(userId);

  const { rows } = await db.query(
    `
      SELECT
        user_ai_usage.ai_usage_count,
        user_ai_usage.last_ai_action,
        user_ai_usage.last_used_at,
        user_billing.stripe_customer_id,
        user_billing.stripe_subscription_id,
        user_billing.subscription_status,
        user_billing.plan,
        user_billing.current_period_end
      FROM user_ai_usage
      INNER JOIN user_billing ON user_billing.user_id = user_ai_usage.user_id
      WHERE user_ai_usage.user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return buildUsageSummary(rows[0] || {}, rows[0] || {});
}

async function recordAiUsage(userId, action) {
  const db = getPool();
  const safeAction = String(action || 'ai').slice(0, 80);

  const { rows } = await db.query(
    `
      INSERT INTO user_ai_usage (user_id, ai_usage_count, last_ai_action, last_used_at, updated_at)
      VALUES ($1, 1, $2, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        ai_usage_count = user_ai_usage.ai_usage_count + 1,
        last_ai_action = EXCLUDED.last_ai_action,
        last_used_at = NOW(),
        updated_at = NOW()
      RETURNING ai_usage_count, last_ai_action, last_used_at
    `,
    [userId, safeAction]
  );

  const billing = await getUserBilling(userId);
  return buildUsageSummary(rows[0] || {}, {
    stripe_customer_id: billing.stripeCustomerId,
    stripe_subscription_id: billing.stripeSubscriptionId,
    subscription_status: billing.subscriptionStatus,
    plan: billing.plan,
    current_period_end: billing.currentPeriodEnd
  });
}

async function getUserBilling(userId) {
  const db = getPool();
  await ensureUserSaasRows(userId);

  const { rows } = await db.query(
    `
      SELECT stripe_customer_id, stripe_subscription_id, subscription_status, plan, current_period_end
      FROM user_billing
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return normalizeBillingRow(rows[0] || {});
}

async function saveStripeCustomerId(userId, stripeCustomerId) {
  const db = getPool();
  const { rows } = await db.query(
    `
      INSERT INTO user_billing (user_id, stripe_customer_id, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        stripe_customer_id = COALESCE(user_billing.stripe_customer_id, EXCLUDED.stripe_customer_id),
        updated_at = NOW()
      RETURNING stripe_customer_id, stripe_subscription_id, subscription_status, plan, current_period_end
    `,
    [userId, stripeCustomerId]
  );

  return normalizeBillingRow(rows[0] || {});
}

async function updateBillingForUser(userId, billing = {}) {
  const db = getPool();
  const currentPeriodEnd = billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd) : null;
  const { rows } = await db.query(
    `
      INSERT INTO user_billing (
        user_id,
        stripe_customer_id,
        stripe_subscription_id,
        subscription_status,
        plan,
        current_period_end,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, user_billing.stripe_customer_id),
        stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, user_billing.stripe_subscription_id),
        subscription_status = EXCLUDED.subscription_status,
        plan = EXCLUDED.plan,
        current_period_end = EXCLUDED.current_period_end,
        updated_at = NOW()
      RETURNING stripe_customer_id, stripe_subscription_id, subscription_status, plan, current_period_end
    `,
    [
      userId,
      billing.stripeCustomerId || null,
      billing.stripeSubscriptionId || null,
      billing.subscriptionStatus || 'none',
      billing.plan || 'free',
      currentPeriodEnd && !Number.isNaN(currentPeriodEnd.getTime()) ? currentPeriodEnd : null
    ]
  );

  return normalizeBillingRow(rows[0] || {});
}

async function updateBillingForStripeCustomer(stripeCustomerId, billing = {}) {
  const db = getPool();
  const currentPeriodEnd = billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd) : null;
  const { rows } = await db.query(
    `
      UPDATE user_billing
      SET
        stripe_subscription_id = COALESCE($2, stripe_subscription_id),
        subscription_status = $3,
        plan = $4,
        current_period_end = $5,
        updated_at = NOW()
      WHERE stripe_customer_id = $1
      RETURNING user_id, stripe_customer_id, stripe_subscription_id, subscription_status, plan, current_period_end
    `,
    [
      stripeCustomerId,
      billing.stripeSubscriptionId || null,
      billing.subscriptionStatus || 'none',
      billing.plan || 'free',
      currentPeriodEnd && !Number.isNaN(currentPeriodEnd.getTime()) ? currentPeriodEnd : null
    ]
  );

  return rows[0] ? { userId: rows[0].user_id, billing: normalizeBillingRow(rows[0]) } : null;
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
  FREE_AI_USAGE_LIMIT,
  SESSION_TTL_MS,
  authenticateUser,
  createSession,
  destroySession,
  getUserBilling,
  getUserState,
  getUserUsageSummary,
  initAuthStore,
  recordAiUsage,
  registerUser,
  resolveSession,
  saveStripeCustomerId,
  saveUserState
  ,updateBillingForStripeCustomer,
  updateBillingForUser
};
