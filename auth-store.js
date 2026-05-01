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
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS google_id TEXT;
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx
    ON users (google_id)
    WHERE google_id IS NOT NULL;
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
    CREATE TABLE IF NOT EXISTS user_cvs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Archivado',
      description TEXT NOT NULL DEFAULT '',
      job_url TEXT NOT NULL DEFAULT '',
      last_used_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      template TEXT NOT NULL DEFAULT 'harvard',
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS user_cvs_user_id_idx
    ON user_cvs (user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS user_cvs_user_id_status_idx
    ON user_cvs (user_id, status);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS user_cvs_user_id_last_used_date_idx
    ON user_cvs (user_id, last_used_date DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS user_cvs_user_id_lower_name_idx
    ON user_cvs (user_id, lower(name));
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
    CREATE TABLE IF NOT EXISTS user_ai_artifacts (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS user_ai_artifacts_user_id_created_at_idx
    ON user_ai_artifacts (user_id, created_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_job_applications (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cv_id BIGINT REFERENCES user_cvs(id) ON DELETE SET NULL,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      job_url TEXT NOT NULL DEFAULT '',
      salary TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      deadline_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS user_job_applications_user_id_status_idx
    ON user_job_applications (user_id, status);
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

async function findOrCreateGoogleUser(profile = {}) {
  const db = getPool();
  const googleId = String(profile.sub || profile.id || '').trim();
  const email = normalizeEmail(profile.email);
  const emailVerified = profile.email_verified === true || profile.verified_email === true;

  if (!googleId) {
    throw new Error('Google account did not include an id');
  }

  if (!email || !emailVerified) {
    throw new Error('Google account email must be verified');
  }

  const googlePasswordHash = `google:${crypto.createHash('sha256').update(googleId).digest('hex')}`;

  const { rows } = await db.query(
    `
      INSERT INTO users (email, password_hash, google_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE
      SET google_id = COALESCE(users.google_id, EXCLUDED.google_id)
      RETURNING id, email, created_at
    `,
    [email, googlePasswordHash, googleId]
  );

  return rows[0];
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

async function touchSession(token) {
  if (!token) {
    return null;
  }

  const db = getPool();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { rows } = await db.query(
    `
      UPDATE sessions
      SET expires_at = $2
      WHERE token = $1
        AND expires_at > NOW()
      RETURNING expires_at
    `,
    [token, expiresAt]
  );

  if (!rows[0]?.expires_at) {
    return null;
  }

  return {
    expiresAt: rows[0].expires_at
  };
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

function normalizeCvRow(row = {}, includeContent = false) {
  const cv = {
    id: String(row.id),
    name: row.name || '',
    status: row.status || 'Archivado',
    description: row.description || '',
    jobUrl: row.job_url || '',
    lastUsedDate: toIsoDate(row.last_used_date) || toIsoDate(row.updated_at) || new Date().toISOString(),
    visualTemplate: row.template || 'harvard',
    date: toIsoDate(row.created_at),
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at)
  };

  if (includeContent) {
    cv.content = row.content || '';
  }

  return cv;
}

function normalizeCvInput(input = {}, current = {}) {
  const name = typeof input.name === 'string' ? input.name.trim() : current.name;
  if (!name) {
    throw new Error('CV name is required');
  }

  const parsedLastUsedDate = input.lastUsedDate ? new Date(input.lastUsedDate) : null;
  const safeLastUsedDate = parsedLastUsedDate && !Number.isNaN(parsedLastUsedDate.getTime())
    ? parsedLastUsedDate
    : current.last_used_date || new Date();

  return {
    name: name.slice(0, 240),
    status: typeof input.status === 'string' && input.status.trim()
      ? input.status.trim().slice(0, 80)
      : current.status || 'Archivado',
    description: typeof input.description === 'string'
      ? input.description.trim().slice(0, 1000)
      : current.description || '',
    jobUrl: typeof input.jobUrl === 'string'
      ? input.jobUrl.trim().slice(0, 2000)
      : current.job_url || '',
    lastUsedDate: safeLastUsedDate,
    template: typeof input.visualTemplate === 'string' && input.visualTemplate.trim()
      ? input.visualTemplate.trim().slice(0, 80)
      : typeof input.template === 'string' && input.template.trim()
        ? input.template.trim().slice(0, 80)
        : current.template || 'harvard',
    content: typeof input.content === 'string' ? input.content : current.content || ''
  };
}

function normalizeAiArtifactRow(row = {}) {
  return {
    id: String(row.id),
    action: row.action || 'adapt',
    title: row.title || '',
    content: row.content || '',
    model: row.model || '',
    createdAt: toIsoDate(row.created_at)
  };
}

function normalizeAiArtifactInput(input = {}) {
  const action = typeof input.action === 'string' && input.action.trim()
    ? input.action.trim().slice(0, 80)
    : 'adapt';
  const title = typeof input.title === 'string' && input.title.trim()
    ? input.title.trim().slice(0, 240)
    : action;
  const content = typeof input.content === 'string' ? input.content.trim() : '';

  if (!content) {
    throw new Error('Artifact content is required');
  }

  return {
    action,
    title,
    content: content.slice(0, 30000),
    model: typeof input.model === 'string' ? input.model.trim().slice(0, 240) : ''
  };
}

function normalizeJobApplicationRow(row = {}) {
  return {
    id: String(row.id),
    cvId: row.cv_id ? String(row.cv_id) : null,
    company: row.company || '',
    role: row.role || '',
    status: row.status || 'draft',
    jobUrl: row.job_url || '',
    salary: row.salary || '',
    contact: row.contact || '',
    notes: row.notes || '',
    deadlineDate: toIsoDate(row.deadline_date),
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at)
  };
}

function normalizeJobApplicationInput(input = {}, current = {}) {
  const company = typeof input.company === 'string' ? input.company.trim() : current.company;
  const role = typeof input.role === 'string' ? input.role.trim() : current.role;

  if (!company) {
    throw new Error('Company is required');
  }

  if (!role) {
    throw new Error('Role is required');
  }

  const parsedDeadline = input.deadlineDate ? new Date(input.deadlineDate) : null;
  const safeDeadline = parsedDeadline && !Number.isNaN(parsedDeadline.getTime())
    ? parsedDeadline
    : current.deadline_date || null;

  return {
    cvId: input.cvId || current.cv_id || null,
    company: company.slice(0, 240),
    role: role.slice(0, 240),
    status: typeof input.status === 'string' && input.status.trim()
      ? input.status.trim().slice(0, 80)
      : current.status || 'draft',
    jobUrl: typeof input.jobUrl === 'string' ? input.jobUrl.trim().slice(0, 2000) : current.job_url || '',
    salary: typeof input.salary === 'string' ? input.salary.trim().slice(0, 240) : current.salary || '',
    contact: typeof input.contact === 'string' ? input.contact.trim().slice(0, 500) : current.contact || '',
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 5000) : current.notes || '',
    deadlineDate: safeDeadline
  };
}

async function listUserCvs(userId, options = {}) {
  const db = getPool();
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const status = typeof options.status === 'string' && options.status !== 'all' ? options.status.trim() : '';
  const search = typeof options.search === 'string' ? options.search.trim() : '';
  const values = [userId];
  const where = ['user_id = $1'];

  if (status) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }

  if (search) {
    values.push(`%${search.toLowerCase()}%`);
    where.push(`(lower(name) LIKE $${values.length} OR lower(description) LIKE $${values.length})`);
  }

  const whereSql = where.join(' AND ');
  values.push(limit, offset);

  const { rows } = await db.query(
    `
      SELECT id, name, status, description, job_url, last_used_date, template, created_at, updated_at,
        COUNT(*) OVER() AS total_count
      FROM user_cvs
      WHERE ${whereSql}
      ORDER BY last_used_date DESC, id DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values
  );

  return {
    items: rows.map(row => normalizeCvRow(row)),
    total: rows[0] ? Number(rows[0].total_count || 0) : 0,
    limit,
    offset
  };
}

async function getUserCv(userId, cvId) {
  const db = getPool();
  const { rows } = await db.query(
    `
      SELECT id, name, status, description, job_url, last_used_date, template, content, created_at, updated_at
      FROM user_cvs
      WHERE user_id = $1 AND id = $2
      LIMIT 1
    `,
    [userId, cvId]
  );

  return rows[0] ? normalizeCvRow(rows[0], true) : null;
}

async function createUserCv(userId, input = {}) {
  const db = getPool();
  const cv = normalizeCvInput(input);
  const { rows } = await db.query(
    `
      INSERT INTO user_cvs (user_id, name, status, description, job_url, last_used_date, template, content)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, status, description, job_url, last_used_date, template, content, created_at, updated_at
    `,
    [userId, cv.name, cv.status, cv.description, cv.jobUrl, cv.lastUsedDate, cv.template, cv.content]
  );

  return normalizeCvRow(rows[0], true);
}

async function updateUserCv(userId, cvId, input = {}) {
  const db = getPool();
  const { rows: currentRows } = await db.query(
    `
      SELECT name, status, description, job_url, last_used_date, template, content
      FROM user_cvs
      WHERE user_id = $1 AND id = $2
      LIMIT 1
    `,
    [userId, cvId]
  );

  if (!currentRows[0]) {
    return null;
  }

  const cv = normalizeCvInput(input, currentRows[0]);
  const { rows } = await db.query(
    `
      UPDATE user_cvs
      SET
        name = $3,
        status = $4,
        description = $5,
        job_url = $6,
        last_used_date = $7,
        template = $8,
        content = $9,
        updated_at = NOW()
      WHERE user_id = $1 AND id = $2
      RETURNING id, name, status, description, job_url, last_used_date, template, content, created_at, updated_at
    `,
    [userId, cvId, cv.name, cv.status, cv.description, cv.jobUrl, cv.lastUsedDate, cv.template, cv.content]
  );

  return rows[0] ? normalizeCvRow(rows[0], true) : null;
}

async function deleteUserCv(userId, cvId) {
  const db = getPool();
  const { rowCount } = await db.query(
    `
      DELETE FROM user_cvs
      WHERE user_id = $1 AND id = $2
    `,
    [userId, cvId]
  );

  return rowCount > 0;
}

async function listUserAiArtifacts(userId, options = {}) {
  const db = getPool();
  const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 100);
  const { rows } = await db.query(
    `
      SELECT id, action, title, content, model, created_at
      FROM user_ai_artifacts
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return rows.map(row => normalizeAiArtifactRow(row));
}

async function createUserAiArtifact(userId, input = {}) {
  const db = getPool();
  const artifact = normalizeAiArtifactInput(input);
  const { rows } = await db.query(
    `
      INSERT INTO user_ai_artifacts (user_id, action, title, content, model)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, action, title, content, model, created_at
    `,
    [userId, artifact.action, artifact.title, artifact.content, artifact.model]
  );

  return normalizeAiArtifactRow(rows[0]);
}

async function deleteUserAiArtifact(userId, artifactId) {
  const db = getPool();
  const { rowCount } = await db.query(
    `
      DELETE FROM user_ai_artifacts
      WHERE user_id = $1 AND id = $2
    `,
    [userId, artifactId]
  );

  return rowCount > 0;
}

async function deleteUserAiArtifacts(userId) {
  const db = getPool();
  await db.query(
    `
      DELETE FROM user_ai_artifacts
      WHERE user_id = $1
    `,
    [userId]
  );
}

async function listUserJobApplications(userId, options = {}) {
  const db = getPool();
  const status = typeof options.status === 'string' && options.status !== 'all' ? options.status.trim() : '';
  const search = typeof options.search === 'string' ? options.search.trim() : '';
  const values = [userId];
  const where = ['user_id = $1'];

  if (status) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }

  if (search) {
    values.push(`%${search.toLowerCase()}%`);
    where.push(`(lower(company) LIKE $${values.length} OR lower(role) LIKE $${values.length} OR lower(notes) LIKE $${values.length})`);
  }

  const { rows } = await db.query(
    `
      SELECT id, cv_id, company, role, status, job_url, salary, contact, notes, deadline_date, created_at, updated_at
      FROM user_job_applications
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC, id DESC
      LIMIT 200
    `,
    values
  );

  return rows.map(row => normalizeJobApplicationRow(row));
}

async function createUserJobApplication(userId, input = {}) {
  const db = getPool();
  const job = normalizeJobApplicationInput(input);
  const { rows } = await db.query(
    `
      INSERT INTO user_job_applications (user_id, cv_id, company, role, status, job_url, salary, contact, notes, deadline_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, cv_id, company, role, status, job_url, salary, contact, notes, deadline_date, created_at, updated_at
    `,
    [userId, job.cvId, job.company, job.role, job.status, job.jobUrl, job.salary, job.contact, job.notes, job.deadlineDate]
  );

  return normalizeJobApplicationRow(rows[0]);
}

async function updateUserJobApplication(userId, jobId, input = {}) {
  const db = getPool();
  const { rows: currentRows } = await db.query(
    `
      SELECT cv_id, company, role, status, job_url, salary, contact, notes, deadline_date
      FROM user_job_applications
      WHERE user_id = $1 AND id = $2
      LIMIT 1
    `,
    [userId, jobId]
  );

  if (!currentRows[0]) {
    return null;
  }

  const job = normalizeJobApplicationInput(input, currentRows[0]);
  const { rows } = await db.query(
    `
      UPDATE user_job_applications
      SET
        cv_id = $3,
        company = $4,
        role = $5,
        status = $6,
        job_url = $7,
        salary = $8,
        contact = $9,
        notes = $10,
        deadline_date = $11,
        updated_at = NOW()
      WHERE user_id = $1 AND id = $2
      RETURNING id, cv_id, company, role, status, job_url, salary, contact, notes, deadline_date, created_at, updated_at
    `,
    [userId, jobId, job.cvId, job.company, job.role, job.status, job.jobUrl, job.salary, job.contact, job.notes, job.deadlineDate]
  );

  return rows[0] ? normalizeJobApplicationRow(rows[0]) : null;
}

async function deleteUserJobApplication(userId, jobId) {
  const db = getPool();
  const { rowCount } = await db.query(
    `
      DELETE FROM user_job_applications
      WHERE user_id = $1 AND id = $2
    `,
    [userId, jobId]
  );

  return rowCount > 0;
}

module.exports = {
  FREE_AI_USAGE_LIMIT,
  SESSION_TTL_MS,
  authenticateUser,
  createUserAiArtifact,
  createUserJobApplication,
  createSession,
  createUserCv,
  deleteUserCv,
  deleteUserAiArtifact,
  deleteUserAiArtifacts,
  deleteUserJobApplication,
  destroySession,
  findOrCreateGoogleUser,
  getUserCv,
  getUserBilling,
  getUserState,
  getUserUsageSummary,
  initAuthStore,
  listUserCvs,
  listUserAiArtifacts,
  listUserJobApplications,
  recordAiUsage,
  registerUser,
  resolveSession,
  saveStripeCustomerId,
  saveUserState,
  touchSession,
  updateBillingForStripeCustomer,
  updateBillingForUser,
  updateUserCv,
  updateUserJobApplication
};
