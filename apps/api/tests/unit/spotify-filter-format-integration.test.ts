/**
 * Unit tests for formatCurrentListeningSnapshot filter integration.
 * Locks the filter behavior + the no-min-today sentinel.
 */
import { describe, it, expect } from 'vitest';
import { formatCurrentListeningSnapshot } from '../../src/do/generation-context';
import type { LibrarySaveSummary } from '../../src/lib/data-sources/library-save-events';

const sample = (over: Partial<LibrarySaveSummary> = {}): LibrarySaveSummary => ({
  show_or_book_title: 'Test Show',
  show_or_book_author: null,
  show_or_book_spotify_uri: 'spotify:show:test',
  listening_type: 'episode_save',
  saves_in_window: 1,
  last_save_date: '2026-06-01',
  ...over,
});

describe('formatCurrentListeningSnapshot - PATCH A Spotify filter integration', () => {
  it('excludes items whose URI is in the excludedShowUris set', () => {
    const items: LibrarySaveSummary[] = [
      sample({
        show_or_book_title: 'Included Show',
        show_or_book_spotify_uri: 'spotify:show:included',
      }),
      sample({
        show_or_book_title: 'Excluded Show',
        show_or_book_spotify_uri: 'spotify:show:excluded',
      }),
    ];
    const excluded = new Set(['spotify:show:excluded']);
    const out = formatCurrentListeningSnapshot(items, excluded);
    expect(out).toContain('Included Show');
    expect(out).not.toContain('Excluded Show');
  });

  it('renders empty-state when all items are excluded', () => {
    const items: LibrarySaveSummary[] = [
      sample({ show_or_book_spotify_uri: 'spotify:show:a' }),
      sample({ show_or_book_spotify_uri: 'spotify:show:b' }),
    ];
    const excluded = new Set(['spotify:show:a', 'spotify:show:b']);
    const out = formatCurrentListeningSnapshot(items, excluded);
    expect(out).toContain('no podcast/audiobook library activity');
  });

  it('NEVER outputs a "min today" string (PODCAST_LISTENING_SEMANTICS sentinel)', () => {
    const items: LibrarySaveSummary[] = [sample({ saves_in_window: 99 })];
    const out = formatCurrentListeningSnapshot(items, new Set());
    expect(out).not.toMatch(/\d+\s*min today/);
  });

  it('behaves identically when excludedShowUris is empty set (no filtering)', () => {
    const items: LibrarySaveSummary[] = [
      sample({ show_or_book_title: 'Show A', show_or_book_spotify_uri: 'spotify:show:a' }),
      sample({ show_or_book_title: 'Show B', show_or_book_spotify_uri: 'spotify:show:b' }),
    ];
    const withEmpty = formatCurrentListeningSnapshot(items, new Set());
    const withUndefined = formatCurrentListeningSnapshot(items, undefined);
    expect(withEmpty).toBe(withUndefined);
  });

  it('partial exclusion: only excluded items are dropped, included items remain', () => {
    const items: LibrarySaveSummary[] = [
      sample({
        show_or_book_title: 'Finance Pod',
        show_or_book_spotify_uri: 'spotify:show:finance',
      }),
      sample({ show_or_book_title: 'Dev Pod', show_or_book_spotify_uri: 'spotify:show:dev' }),
      sample({
        show_or_book_title: 'Entertainment Pod',
        show_or_book_spotify_uri: 'spotify:show:ent',
      }),
    ];
    const excluded = new Set(['spotify:show:ent']);
    const out = formatCurrentListeningSnapshot(items, excluded);
    expect(out).toContain('Finance Pod');
    expect(out).toContain('Dev Pod');
    expect(out).not.toContain('Entertainment Pod');
  });
});
