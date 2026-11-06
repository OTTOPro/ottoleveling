import { Hono } from 'hono';
import type { Bindings } from '../index';
import { levelFromXp, xpToNextLevel } from '../lib/xp';
import {
  titleFromLevel,
  rankFromLevel,
  compositeTitle,
  compositeRankProgress,
} from '../lib/titles';
import type { PillarId } from '../do/state';

export const statsRouter = new Hono<{ Bindings: Bindings }>();

interface PillarStatsRow {
  id: string;
  name: string;
  color: string;
  xp: number;
}

statsRouter.get('/pillars', async (c) => {
  const sql = `
    SELECT
      p.id,
      p.name,
      p.color,
      COALESCE((
        SELECT SUM(amount) FROM xp_events WHERE pillar_id = p.id
      ), 0) AS xp
    FROM pillars p
    ORDER BY p.id
  `;
  const { results } = await c.env.DB.prepare(sql).all<PillarStatsRow>();
  const pillars = results.map((r) => {
    const xpForLevel = Math.max(0, r.xp);
    const level = levelFromXp(xpForLevel);
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      xp: r.xp,
      level,
      xp_to_next: xpToNextLevel(level),
      title: titleFromLevel(r.id as PillarId, level),
      rank: rankFromLevel(level),
    };
  });
  return c.json({ pillars });
});

statsRouter.get('/composite', async (c) => {
  const sql = `
    SELECT
      p.id,
      COALESCE((
        SELECT SUM(amount) FROM xp_events WHERE pillar_id = p.id
      ), 0) AS xp
    FROM pillars p
  `;
  const { results } = await c.env.DB.prepare(sql).all<{ id: PillarId; xp: number }>();
  const levels: Record<PillarId, number> = {
    body: 0,
    mind: 0,
    finance: 0,
    projects: 0,
  };
  for (const r of results) {
    levels[r.id] = levelFromXp(Math.max(0, r.xp));
  }
  const sum =
    Math.max(0, levels.body) +
    Math.max(0, levels.mind) +
    Math.max(0, levels.finance) +
    Math.max(0, levels.projects);
  const comp = compositeTitle(levels);
  const { progress, is_max } = compositeRankProgress(sum);
  // Additive fields - backwards-compatible: existing callers reading only title+rank unaffected.
  return c.json({ title: comp.title, rank: comp.rank, progress, is_max, sum });
});
