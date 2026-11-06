/**
 * /api/sources/* routes.
 *
 * Separate from /api/data-sources (which handles OAuth, sync, and status).
 * /api/sources covers user-facing per-source configuration (show filters, etc.)
 *
 * All routes mounted behind global accessMiddleware (inherited from app.use('/api/*')).
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../index';
import { SpotifyShowFilterPatchSchema } from '../schemas/spotify-show-filters';
import { getShowFilters, setShowInclude } from '../lib/data-sources/spotify-show-filters';

export const sourcesRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/sources/spotify/filters - list all show filters.
sourcesRouter.get('/spotify/filters', async (c) => {
  const filters = await getShowFilters(c.env.DB);
  return c.json({ filters });
});

// PATCH /api/sources/spotify/filters/:uri - toggle include_in_mind_learning.
// :uri is URL-encoded (show_spotify_uri, e.g. spotify:show:xxxxx).
//
// contributes_to_pillar is accepted by the schema but any non-'mind' value is
// rejected with 400: per-show pillar mapping is not editable yet. The field is
// structurally ready for it - remove this route-level guard to enable it.
sourcesRouter.patch(
  '/spotify/filters/:uri',
  zValidator('json', SpotifyShowFilterPatchSchema),
  async (c) => {
    const uri = decodeURIComponent(c.req.param('uri'));
    if (!uri) return c.json({ error: 'missing_uri' }, 400);

    const patch = c.req.valid('json');

    // contributes_to_pillar is structurally accepted but locked to 'mind'.
    // Reject any non-mind value explicitly.
    if ('contributes_to_pillar' in patch && patch.contributes_to_pillar !== 'mind') {
      return c.json({ error: 'pillar_editing_locked' }, 400);
    }

    if (patch.include_in_mind_learning === undefined) {
      return c.json({ error: 'no_fields_to_update' }, 400);
    }

    const result = await setShowInclude(c.env.DB, uri, patch.include_in_mind_learning);
    if (!result.ok) return c.json({ error: 'filter_not_found' }, 404);

    // Return the post-update row.
    const { results } = await c.env.DB.prepare(
      `SELECT show_spotify_uri, show_name, include_in_mind_learning,
                contributes_to_pillar, user_updated_at, discovered_at
         FROM spotify_show_filters
         WHERE show_spotify_uri = ?`,
    )
      .bind(uri)
      .all<{
        show_spotify_uri: string;
        show_name: string;
        include_in_mind_learning: number;
        contributes_to_pillar: string;
        user_updated_at: string;
        discovered_at: string;
      }>();
    const row = results[0];
    if (!row) return c.json({ error: 'filter_not_found' }, 404);

    return c.json({
      ok: true,
      filter: {
        ...row,
        include_in_mind_learning: Boolean(row.include_in_mind_learning),
      },
    });
  },
);
