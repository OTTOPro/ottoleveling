import { Hono } from 'hono';
import type { Bindings } from '../index';

export const healthRouter = new Hono<{ Bindings: Bindings }>();

healthRouter.get('/', (c) =>
  c.json({
    status: 'ok',
    env: c.env.ENV,
    llm: c.env.LLM_PROVIDER,
    ts: new Date().toISOString(),
  }),
);
