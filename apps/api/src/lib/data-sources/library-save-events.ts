import type { LibrarySaveEventRow } from './types';

export interface LibrarySaveEventUpsertInput {
  date: string;
  show_or_book_title: string;
  show_or_book_author: string | null;
  show_or_book_spotify_uri: string | null;
  listening_type: 'episode_save' | 'audiobook_save';
}

/**
 * Idempotent UPSERT on (date, show_or_book_spotify_uri, listening_type). Re-running
 * the same sync for the same date overwrites the row with the latest title/author
 * (in case Spotify ever updates show metadata). The UNIQUE composite key means
 * the same URI can appear once as 'episode_save' and once as 'audiobook_save' on
 * the same day if Spotify ever exposes both forms - separate rows.
 */
export async function upsertLibrarySaveEvent(
  db: D1Database,
  input: LibrarySaveEventUpsertInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO library_save_events
         (date, show_or_book_title, show_or_book_author, show_or_book_spotify_uri, listening_type)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date, show_or_book_spotify_uri, listening_type) DO UPDATE SET
         show_or_book_title = excluded.show_or_book_title,
         show_or_book_author = excluded.show_or_book_author`,
    )
    .bind(
      input.date,
      input.show_or_book_title,
      input.show_or_book_author,
      input.show_or_book_spotify_uri,
      input.listening_type,
    )
    .run();
}

/**
 * Returns library-save events recorded in the last `lookbackDays` days, grouped by
 * (show_or_book_spotify_uri, listening_type). For each entry: counts saves in the
 * window + records the most recent save date.
 *
 * Used by:
 *   - {CURRENT_LISTENING} placeholder in daily generation (lookbackDays = 14)
 *   - /system [ READING ] UI section (lookbackDays = 14)
 *
 * Entries not saved within the lookback window drop off the "recent saves" list.
 */
export async function getCurrentLibrarySaves(
  db: D1Database,
  today: string,
  lookbackDays: number = 14,
): Promise<LibrarySaveSummary[]> {
  const since = new Date(today + 'T00:00:00Z');
  since.setUTCDate(since.getUTCDate() - lookbackDays);
  const sinceIso = since.toISOString().slice(0, 10);

  const { results } = await db
    .prepare(
      `SELECT show_or_book_title,
              listening_type,
              show_or_book_author,
              show_or_book_spotify_uri,
              COUNT(*)  AS saves_in_window,
              MAX(date) AS last_save_date
         FROM library_save_events
        WHERE date >= ? AND date <= ?
        GROUP BY show_or_book_spotify_uri, listening_type
        ORDER BY last_save_date DESC, show_or_book_title ASC`,
    )
    .bind(sinceIso, today)
    .all<{
      show_or_book_title: string;
      listening_type: 'episode_save' | 'audiobook_save';
      show_or_book_author: string | null;
      show_or_book_spotify_uri: string | null;
      saves_in_window: number;
      last_save_date: string;
    }>();

  return results.map((r) => ({
    show_or_book_title: r.show_or_book_title,
    show_or_book_author: r.show_or_book_author,
    show_or_book_spotify_uri: r.show_or_book_spotify_uri,
    listening_type: r.listening_type,
    saves_in_window: r.saves_in_window,
    last_save_date: r.last_save_date,
  }));
}

/**
 * Per-entry summary surfaced via `{CURRENT_LISTENING}` placeholder + `[ READING ]` UI.
 * Note: this is NOT a listening-time summary - `saves_in_window` is the count of
 * library-save events, NOT minutes listened. See the "saved ≠ listened" disclaimer
 * propagated through the format helper + strictness rule PODCAST_LISTENING_SEMANTICS.
 */
export interface LibrarySaveSummary {
  show_or_book_title: string;
  show_or_book_author: string | null;
  show_or_book_spotify_uri: string | null;
  listening_type: 'episode_save' | 'audiobook_save';
  saves_in_window: number;
  last_save_date: string;
}

/** Re-export for callers that want the raw row shape. */
export type { LibrarySaveEventRow };
