import express from 'express';
import cors from 'cors';

/**
 * Create a test Express app with the same middleware as production,
 * but without starting a server (for supertest).
 */
export function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  return app;
}
