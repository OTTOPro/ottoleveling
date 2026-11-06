import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  upsertLibrarySaveEvent,
  getCurrentLibrarySaves,
} from '../../src/lib/data-sources/library-save-events';

describe('upsertLibrarySaveEvent', () => {
  it('inserts a fresh row when no existing (date, uri, type) row', async () => {
    await upsertLibrarySaveEvent(env.DB, {
      date: '2026-05-29',
      show_or_book_title: 'Long Conversations',
      show_or_book_author: 'Avery Lane',
      show_or_book_spotify_uri: 'spotify:show:longconv',
      listening_type: 'episode_save',
    });

    const row = await env.DB.prepare(
      `SELECT * FROM library_save_events WHERE date = '2026-05-29' AND show_or_book_spotify_uri = 'spotify:show:longconv'`,
    ).first<{ show_or_book_title: string; listening_type: string }>();
    expect(row).not.toBeNull();
    expect(row!.show_or_book_title).toBe('Long Conversations');
    expect(row!.listening_type).toBe('episode_save');
  });

  it('upserts (updates existing row) when (date, uri, type) matches - title refreshed', async () => {
    await upsertLibrarySaveEvent(env.DB, {
      date: '2026-05-29',
      show_or_book_title: 'Old Title',
      show_or_book_author: 'Old Author',
      show_or_book_spotify_uri: 'spotify:show:longconv',
      listening_type: 'episode_save',
    });
    await upsertLibrarySaveEvent(env.DB, {
      date: '2026-05-29',
      show_or_book_title: 'Long Conversations',
      show_or_book_author: 'Avery Lane',
      show_or_book_spotify_uri: 'spotify:show:longconv',
      listening_type: 'episode_save',
    });
    const { results } = await env.DB.prepare(
      `SELECT show_or_book_title FROM library_save_events WHERE show_or_book_spotify_uri = 'spotify:show:longconv'`,
    ).all<{ show_or_book_title: string }>();
    expect(results).toHaveLength(1); // Still 1 row
    expect(results[0]!.show_or_book_title).toBe('Long Conversations');
  });

  it('allows the same URI with different listening_type on the same day (composite unique key)', async () => {
    await upsertLibrarySaveEvent(env.DB, {
      date: '2026-05-29',
      show_or_book_title: 'A Short History of Tools',
      show_or_book_author: 'Morgan Ellis',
      show_or_book_spotify_uri: 'spotify:audiobook:toolshistory',
      listening_type: 'audiobook_save',
    });
    await upsertLibrarySaveEvent(env.DB, {
      date: '2026-05-29',
      show_or_book_title: 'A Short History of Tools (companion podcast)',
      show_or_book_author: 'Morgan Ellis',
      show_or_book_spotify_uri: 'spotify:audiobook:toolshistory',
      listening_type: 'episode_save',
    });
    const { results } = await env.DB.prepare(
      `SELECT listening_type FROM library_save_events WHERE show_or_book_spotify_uri = 'spotify:audiobook:toolshistory' ORDER BY listening_type`,
    ).all<{ listening_type: string }>();
    expect(results).toHaveLength(2);
    expect(results[0]!.listening_type).toBe('audiobook_save');
    expect(results[1]!.listening_type).toBe('episode_save');
  });
});

describe('getCurrentLibrarySaves', () => {
  beforeEach(async () => {
    // Seed 4 entries across various dates relative to '2026-05-30':
    //   show A (episode_save): saved 1 day ago + 5 days ago (in window) - 2 events
    //   show B (episode_save): saved 14 days ago (edge of window)
    //   book C (audiobook_save): saved 20 days ago (out of window)
    const seeds: Array<{
      date: string;
      title: string;
      uri: string;
      type: 'episode_save' | 'audiobook_save';
    }> = [
      { date: '2026-05-29', uri: 'spotify:show:a', title: 'Show A', type: 'episode_save' },
      { date: '2026-05-25', uri: 'spotify:show:a', title: 'Show A', type: 'episode_save' },
      { date: '2026-05-16', uri: 'spotify:show:b', title: 'Show B', type: 'episode_save' },
      { date: '2026-05-10', uri: 'spotify:audiobook:c', title: 'Book C', type: 'audiobook_save' },
    ];
    for (const s of seeds) {
      await upsertLibrarySaveEvent(env.DB, {
        date: s.date,
        show_or_book_title: s.title,
        show_or_book_author: null,
        show_or_book_spotify_uri: s.uri,
        listening_type: s.type,
      });
    }
  });

  it('returns entries saved within the lookback window, counting save events', async () => {
    const items = await getCurrentLibrarySaves(env.DB, '2026-05-30', 14);
    expect(items).toHaveLength(2); // A + B (C is outside the 14-day window)
    const a = items.find((x) => x.show_or_book_title === 'Show A');
    expect(a?.saves_in_window).toBe(2);
    expect(a?.last_save_date).toBe('2026-05-29');
    expect(a?.listening_type).toBe('episode_save');
  });

  it('sorts by last_save_date DESC (most recently saved first)', async () => {
    const items = await getCurrentLibrarySaves(env.DB, '2026-05-30', 14);
    expect(items[0]!.show_or_book_title).toBe('Show A');
    expect(items[1]!.show_or_book_title).toBe('Show B');
  });

  it('excludes entries not saved within the lookback window', async () => {
    const items = await getCurrentLibrarySaves(env.DB, '2026-05-30', 14);
    expect(items.find((x) => x.show_or_book_title === 'Book C')).toBeUndefined();
  });

  it('returns empty array when no entries match', async () => {
    const items = await getCurrentLibrarySaves(env.DB, '2026-06-30', 14);
    expect(items).toEqual([]);
  });
});
