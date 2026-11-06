import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { upsertLibrarySaveEvent } from '../../src/lib/data-sources/library-save-events';

const HEADERS = { 'x-dev-token': 'integration-test-token-deadbeef' };

describe('GET /api/data-sources/current-listening', () => {
  it('403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/current-listening');
    expect(res.status).toBe(403);
  });

  it('returns empty items array when no library_save_events exist', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/current-listening', {
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('returns entry summaries for shows/books saved in the 14-day window', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertLibrarySaveEvent(env.DB, {
      date: today,
      show_or_book_title: 'Long Conversations',
      show_or_book_author: 'Avery Lane',
      show_or_book_spotify_uri: 'spotify:show:longconv',
      listening_type: 'episode_save',
    });
    const res = await SELF.fetch('https://x.test/api/data-sources/current-listening', {
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ show_or_book_title: string; saves_in_window: number; listening_type: string }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.show_or_book_title).toBe('Long Conversations');
    expect(body.items[0]!.saves_in_window).toBe(1);
    expect(body.items[0]!.listening_type).toBe('episode_save');
  });
});
