const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const ENV_PATH = path.join(ROOT_DIR, '.env');

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  fs.readFileSync(ENV_PATH, 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const [key, ...value] = line.split('=');
      if (key && value.length) {
        process.env[key.trim()] = value.join('=').trim();
      }
    });
}

loadEnvFile();

const PORT = Number(process.env.PORT || 3002);
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 120000);
const SESSION_COOKIE_NAME = 'cv_studio_session';
const SESSION_SECRET = process.env.APP_SESSION_SECRET || 'change-me-in-production';
const MODEL_FALLBACKS = [
  DEFAULT_MODEL,
  'openai/gpt-4o-mini',
  'openai/gpt-oss-120b:free',
  'google/gemma-4-31b-it:free',
  'cohere/rerank-4-pro',
  'google/gemini-2.0-flash-001',
  'nvidia/nemotron-nano-9b-v2:free',
  'qwen/qwen3-coder:free',
  'anthropic/claude-3.5-haiku'
];

module.exports = {
  DEFAULT_MODEL,
  MODEL_FALLBACKS,
  OPENROUTER_URL,
  PORT,
  PUBLIC_DIR,
  REQUEST_TIMEOUT_MS,
  ROOT_DIR,
  SESSION_COOKIE_NAME,
  SESSION_SECRET
};
