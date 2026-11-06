import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../index';
import { CreateCheckinSchema } from '../schemas/checkins';

export const checkinsRouter = new Hono<{ Bindings: Bindings }>();

interface CheckinRow {
  id: number;
  date: string;
  energy_level: number | null;
  mood: string | null;
  notes: string | null;
  created_at: string;
}

checkinsRouter.post('/', zValidator('json', CreateCheckinSchema), async (c) => {
  const body = c.req.valid('json');
  const date = body.date ?? new Date().toISOString().slice(0, 10);

  // UPSERT on the UNIQUE(date) constraint.
  const row = await c.env.DB.prepare(
    `INSERT INTO daily_checkins (date, energy_level, mood, notes)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         energy_level = excluded.energy_level,
         mood = excluded.mood,
         notes = excluded.notes
       RETURNING *`,
  )
    .bind(date, body.energy_level ?? null, body.mood ?? null, body.notes ?? null)
    .first<CheckinRow>();

  if (!row) return c.json({ error: 'insert_failed' }, 500);
  return c.json({ checkin: row }, 201);
});

checkinsRouter.get('/recent', async (c) => {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const sinceIso = since.toISOString().slice(0, 10);

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM daily_checkins WHERE date >= ? ORDER BY date DESC`,
  )
    .bind(sinceIso)
    .all<CheckinRow>();
  return c.json({ checkins: results });
});
