import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';
import { upsertLibrarySaveEvent } from '../../src/lib/data-sources/library-save-events';

describe('CURRENT_LISTENING in daily generation prompt', () => {
  it('renders empty-state line when no library_save_events seeded', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-30');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toContain('## Library activity');
    expect(systemMsg.content).toContain('no podcast/audiobook library activity today');
    expect(systemMsg.content).not.toMatch(/\d+\s*min today/);
  });

  it('renders per-entry save lines when library_save_events has rows (episode case)', async () => {
    await upsertLibrarySaveEvent(env.DB, {
      date: '2026-05-29',
      show_or_book_title: 'Long Conversations',
      show_or_book_author: 'Avery Lane',
      show_or_book_spotify_uri: 'spotify:show:longconv',
      listening_type: 'episode_save',
    });
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-30');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toContain('## Library activity');
    expect(systemMsg.content).toContain('Long Conversations');
    expect(systemMsg.content).toContain('(saved ≠ listened)');
    expect(systemMsg.content).not.toMatch(/\d+\s*min today/);
  });

  it('excludes entries not saved within the 14-day lookback', async () => {
    await upsertLibrarySaveEvent(env.DB, {
      date: '2026-05-10',
      show_or_book_title: 'Stale Show',
      show_or_book_author: null,
      show_or_book_spotify_uri: 'spotify:show:stale',
      listening_type: 'episode_save',
    });
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-30');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).not.toContain('Stale Show');
    expect(systemMsg.content).toContain('no podcast/audiobook library activity today');
  });
});
