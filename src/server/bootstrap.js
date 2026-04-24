const { initAuthStore } = require('../../auth-store');
const { PORT } = require('./config');
const { createServer } = require('./create-server');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap() {
  const server = createServer();
  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      await initAuthStore();
      server.listen(PORT, () => console.log(`Microservice on http://localhost:${PORT}`));
      return server;
    } catch (error) {
      console.error(`[bootstrap] Database init failed (attempt ${attempts}/${maxAttempts}):`, error.message);

      if (attempts >= maxAttempts) {
        process.exitCode = 1;
        throw error;
      }

      await wait(3000);
    }
  }

  return server;
}

module.exports = {
  bootstrap
};
