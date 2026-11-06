/**
 * Unit tests for spotify-show-filters helpers.
 * Tests upsert idempotency, include toggle, isShowIncluded fallback,
 * getExcludedShowUris.
 */
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  getShowFilters,
  upsertShowFilter,
  setShowInclude,
  isShowIncluded,
  getIncludedShowUris,
  getExcludedShowUris,
} from '../../src/lib/data-sources/spotify-show-filters';

describe('spotify-show-filters helpers', () => {
  it('upsertShowFilter inserts a new row with include=true by default', async () => {
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:test123',
      show_name: 'Test Show',
    });
    const row = await env.DB.prepare(
      `SELECT * FROM spotify_show_filters WHERE show_spotify_uri = ?`,
    )
      .bind('spotify:show:test123')
      .first<{
        show_name: string;
        include_in_mind_learning: number;
        contributes_to_pillar: string;
      }>();
    expect(row).toBeDefined();
    expect(row?.show_name).toBe('Test Show');
    expect(row?.include_in_mind_learning).toBe(1);
    expect(row?.contributes_to_pillar).toBe('mind');
  });

  it('upsertShowFilter preserves include_in_mind_learning on conflict (only refreshes show_name)', async () => {
    // First insert - include=true (default)
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:idempotent',
      show_name: 'Original Name',
    });

    // User opts out
    await setShowInclude(env.DB, 'spotify:show:idempotent', false);

    // Re-upsert (simulate re-sync) - should NOT override include_in_mind_learning
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:idempotent',
      show_name: 'Updated Name',
    });

    const row = await env.DB.prepare(
      `SELECT show_name, include_in_mind_learning FROM spotify_show_filters WHERE show_spotify_uri = ?`,
    )
      .bind('spotify:show:idempotent')
      .first<{ show_name: string; include_in_mind_learning: number }>();
    // show_name refreshed
    expect(row?.show_name).toBe('Updated Name');
    // include_in_mind_learning preserved at 0 (user's opt-out respected)
    expect(row?.include_in_mind_learning).toBe(0);
  });

  it('setShowInclude returns ok=true and updates the row', async () => {
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:toggle',
      show_name: 'Toggle Show',
    });

    const r1 = await setShowInclude(env.DB, 'spotify:show:toggle', false);
    expect(r1.ok).toBe(true);

    const row = await env.DB.prepare(
      `SELECT include_in_mind_learning FROM spotify_show_filters WHERE show_spotify_uri = ?`,
    )
      .bind('spotify:show:toggle')
      .first<{ include_in_mind_learning: number }>();
    expect(row?.include_in_mind_learning).toBe(0);

    // Toggle back
    const r2 = await setShowInclude(env.DB, 'spotify:show:toggle', true);
    expect(r2.ok).toBe(true);

    const row2 = await env.DB.prepare(
      `SELECT include_in_mind_learning FROM spotify_show_filters WHERE show_spotify_uri = ?`,
    )
      .bind('spotify:show:toggle')
      .first<{ include_in_mind_learning: number }>();
    expect(row2?.include_in_mind_learning).toBe(1);
  });

  it('setShowInclude returns ok=false reason=not_found for unknown URI', async () => {
    const result = await setShowInclude(env.DB, 'spotify:show:doesnotexist', true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });

  it('isShowIncluded defaults to true if no filter row exists', async () => {
    const result = await isShowIncluded(env.DB, 'spotify:show:no-filter-row');
    expect(result).toBe(true);
  });

  it('isShowIncluded returns false after setShowInclude(false)', async () => {
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:excl',
      show_name: 'Excluded Show',
    });
    await setShowInclude(env.DB, 'spotify:show:excl', false);
    const result = await isShowIncluded(env.DB, 'spotify:show:excl');
    expect(result).toBe(false);
  });

  it('getExcludedShowUris returns only excluded URIs', async () => {
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:incl-a',
      show_name: 'Included A',
    });
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:excl-b',
      show_name: 'Excluded B',
    });
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:excl-c',
      show_name: 'Excluded C',
    });

    await setShowInclude(env.DB, 'spotify:show:excl-b', false);
    await setShowInclude(env.DB, 'spotify:show:excl-c', false);

    const excluded = await getExcludedShowUris(env.DB);
    expect(excluded.has('spotify:show:excl-b')).toBe(true);
    expect(excluded.has('spotify:show:excl-c')).toBe(true);
    expect(excluded.has('spotify:show:incl-a')).toBe(false);
  });

  it('getIncludedShowUris returns only included URIs', async () => {
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:incl-x',
      show_name: 'Included X',
    });
    await upsertShowFilter(env.DB, {
      show_spotify_uri: 'spotify:show:excl-y',
      show_name: 'Excluded Y',
    });
    await setShowInclude(env.DB, 'spotify:show:excl-y', false);

    const included = await getIncludedShowUris(env.DB);
    expect(included.has('spotify:show:incl-x')).toBe(true);
    expect(included.has('spotify:show:excl-y')).toBe(false);
  });

  it('getShowFilters returns all rows ordered by discovered_at DESC', async () => {
    await env.DB.prepare(
      `INSERT INTO spotify_show_filters (show_spotify_uri, show_name, include_in_mind_learning, contributes_to_pillar, user_updated_at, discovered_at)
       VALUES ('spotify:show:old', 'Old Show', 1, 'mind', '2026-01-01', '2026-01-01'),
              ('spotify:show:new', 'New Show', 1, 'mind', '2026-06-01', '2026-06-01')`,
    ).run();

    const filters = await getShowFilters(env.DB);
    const uris = filters.map((f) => f.show_spotify_uri);
    const oldIdx = uris.indexOf('spotify:show:old');
    const newIdx = uris.indexOf('spotify:show:new');
    // New should come before old (DESC order)
    expect(newIdx).toBeGreaterThanOrEqual(0);
    expect(oldIdx).toBeGreaterThanOrEqual(0);
    expect(newIdx).toBeLessThan(oldIdx);
  });
});
