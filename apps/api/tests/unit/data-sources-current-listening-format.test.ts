import { describe, it, expect } from 'vitest';
import { formatCurrentListeningSnapshot } from '../../src/do/generation-context';
import type { LibrarySaveSummary } from '../../src/lib/data-sources/library-save-events';

const ep = (over: Partial<LibrarySaveSummary> = {}): LibrarySaveSummary => ({
  show_or_book_title: 'Long Conversations',
  show_or_book_author: 'Avery Lane',
  show_or_book_spotify_uri: 'spotify:show:lex',
  listening_type: 'episode_save',
  saves_in_window: 1,
  last_save_date: '2026-05-29',
  ...over,
});

const ab = (over: Partial<LibrarySaveSummary> = {}): LibrarySaveSummary => ({
  show_or_book_title: 'A Short History of Tools',
  show_or_book_author: 'Morgan Ellis',
  show_or_book_spotify_uri: 'spotify:audiobook:toolshistory',
  listening_type: 'audiobook_save',
  saves_in_window: 1,
  last_save_date: '2026-05-29',
  ...over,
});

describe('formatCurrentListeningSnapshot - library-save activity', () => {
  it('Case 1: zero items → empty-state line', () => {
    const out = formatCurrentListeningSnapshot([]);
    expect(out).toContain('no podcast/audiobook library activity today');
  });

  it('Case 2: 1 episode save → renders single episode line with show name + (saved ≠ listened) disclaimer', () => {
    const out = formatCurrentListeningSnapshot([ep()]);
    expect(out).toContain('"Long Conversations"');
    expect(out).toContain('saved 1 new episode(s) today');
    expect(out).toContain('(saved ≠ listened)');
  });

  it('Case 3: mixed (2 episode saves + 1 audiobook save) → renders all 3 with type-specific format', () => {
    const out = formatCurrentListeningSnapshot([
      ep({ saves_in_window: 2 }),
      ep({ show_or_book_title: 'Habits Lab', saves_in_window: 1 }),
      ab(),
    ]);
    const lines = out.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(out).toContain('"Long Conversations"');
    expect(out).toContain('"Habits Lab"');
    expect(out).toContain('"A Short History of Tools" by Morgan Ellis · saved to library today');
  });

  it('Case 4: 4+ episode saves → truncates to top 3 by saves_in_window (drops least-saved)', () => {
    const items: LibrarySaveSummary[] = [
      ep({ show_or_book_title: 'Big', saves_in_window: 10 }),
      ep({ show_or_book_title: 'Medium', saves_in_window: 5 }),
      ep({ show_or_book_title: 'Small', saves_in_window: 2 }),
      ep({ show_or_book_title: 'Tiny', saves_in_window: 1 }),
    ];
    const out = formatCurrentListeningSnapshot(items);
    expect(out).toContain('"Big"');
    expect(out).toContain('"Medium"');
    expect(out).toContain('"Small"');
    expect(out).not.toContain('"Tiny"');
  });

  it('Case 5: weekly aggregate footer when multiple entries (≥2 of either type)', () => {
    const out = formatCurrentListeningSnapshot([
      ep({ show_or_book_title: 'Show 1', saves_in_window: 3 }),
      ep({ show_or_book_title: 'Show 2', saves_in_window: 1 }),
      ab({ show_or_book_title: 'Book A', saves_in_window: 1 }),
    ]);
    expect(out).toMatch(/Library activity:.*podcast episode.*audiobook/);
  });

  it('Case 6: long-title truncation preserves the (saved ≠ listened) disclaimer', () => {
    const longTitle = 'X'.repeat(120);
    const out = formatCurrentListeningSnapshot([ep({ show_or_book_title: longTitle })]);
    expect(out).toContain('(saved ≠ listened)');
  });

  it('Case 7: audiobook line format - "{title}" by {Author} · saved to library today', () => {
    const out = formatCurrentListeningSnapshot([ab()]);
    expect(out).toMatch(/^- "A Short History of Tools" by Morgan Ellis · saved to library today/);
  });

  it('Case 8: NEVER outputs a minutes-listened number - assertion on every rendered case', () => {
    const cases: LibrarySaveSummary[][] = [
      [],
      [ep()],
      [ep(), ab()],
      [
        ep({ saves_in_window: 5 }),
        ep({ show_or_book_title: 'X', saves_in_window: 3 }),
        ab(),
        ab({ show_or_book_title: 'Y' }),
      ],
      [ep({ show_or_book_title: 'A'.repeat(200), saves_in_window: 99 })],
    ];
    for (const c of cases) {
      const out = formatCurrentListeningSnapshot(c);
      expect(out).not.toMatch(/\d+\s*min today/);
      expect(out).not.toMatch(/\d+\s*minutes? listened/);
    }
  });
});
