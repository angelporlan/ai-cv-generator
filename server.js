const { bootstrap } = require('./src/server/bootstrap');

bootstrap().catch((error) => {
  console.error('[bootstrap] Fatal startup error:', error);
});
