/**
 * Spotify show-filter helpers.
 *
 * Per-show opt-in/opt-out for mind-pillar learning credit. Default = include.
 * Filter is forward-only: past library_save_events stay intact, past prompts
 * and bilans are immutable.
 */

type PillarId = 'body' | 'mind' | 'finance' | 'projects';

export interface SpotifyShowFilter {
  show_spotify_uri: string;
  show_name: string;
  include_in_mind_learning: boolean;
  contributes_to_pillar: PillarId;
  user_updated_at: string;
  discovered_at: string;
}

/** List all show filters ordered by most-recently discovered. */
export async function getShowFilters(db: D1Database): Promise<SpotifyShowFilter[]> {
  const { results } = await db
    .prepare(
      `SELECT show_spotify_uri, show_name, include_in_mind_learning,
              contributes_to_pillar, user_updated_at, discovered_at
       FROM spotify_show_filters
       ORDER BY discovered_at DESC`,
    )
    .all<{
      show_spotify_uri: string;
      show_name: string;
      include_in_mind_learning: number;
      contributes_to_pillar: PillarId;
      user_updated_at: string;
      discovered_at: string;
    }>();
  return results.map((r) => ({
    ...r,
    include_in_mind_learning: Boolean(r.include_in_mind_learning),
  }));
}

/**
 * Upsert a show filter row. Idempotent via PK on show_spotify_uri.
 *
 * ON CONFLICT: preserves include_in_mind_learning + contributes_to_pillar
 * (the user may have already toggled these; auto-discovery should NOT override).
 * Only show_name is refreshed in case Spotify metadata changed.
 *
 * Called by the spotify_sync alarm after fetching /me/shows + /me/episodes.
 */
export async function upsertShowFilter(
  db: D1Database,
  args: { show_spotify_uri: string; show_name: string; include?: boolean },
): Promise<void> {
  const include = args.include ?? true;
  await db
    .prepare(
      `INSERT INTO spotify_show_filters
         (show_spotify_uri, show_name, include_in_mind_learning, contributes_to_pillar,
          user_updated_at, discovered_at)
       VALUES (?, ?, ?, 'mind', datetime('now'), datetime('now'))
       ON CONFLICT(show_spotify_uri) DO UPDATE SET
         show_name = excluded.show_name`,
    )
    .bind(args.show_spotify_uri, args.show_name, include ? 1 : 0)
    .run();
}

/**
 * Toggle include_in_mind_learning for a show. Returns ok=true on success,
 * ok=false with reason='not_found' if the URI doesn't exist.
 */
export async function setShowInclude(
  db: D1Database,
  show_spotify_uri: string,
  include: boolean,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const res = await db
    .prepare(
      `UPDATE spotify_show_filters
       SET include_in_mind_learning = ?, user_updated_at = datetime('now')
       WHERE show_spotify_uri = ?`,
    )
    .bind(include ? 1 : 0, show_spotify_uri)
    .run();
  if (res.meta.changes === 0) return { ok: false, reason: 'not_found' };
  return { ok: true };
}

/**
 * Returns whether a show is included in mind-learning counting.
 * Defaults to TRUE if no filter row exists (auto-discovery hasn't fired yet).
 */
export async function isShowIncluded(db: D1Database, show_spotify_uri: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT include_in_mind_learning FROM spotify_show_filters WHERE show_spotify_uri = ?`)
    .bind(show_spotify_uri)
    .first<{ include_in_mind_learning: number }>();
  // Default to included if no filter exists.
  if (!row) return true;
  return Boolean(row.include_in_mind_learning);
}

/** Returns the Set of URIs explicitly marked as included (include_in_mind_learning = 1). */
export async function getIncludedShowUris(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare(`SELECT show_spotify_uri FROM spotify_show_filters WHERE include_in_mind_learning = 1`)
    .all<{ show_spotify_uri: string }>();
  return new Set(results.map((r) => r.show_spotify_uri));
}

/** Returns the Set of URIs explicitly marked as excluded (include_in_mind_learning = 0). */
export async function getExcludedShowUris(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare(`SELECT show_spotify_uri FROM spotify_show_filters WHERE include_in_mind_learning = 0`)
    .all<{ show_spotify_uri: string }>();
  return new Set(results.map((r) => r.show_spotify_uri));
}
