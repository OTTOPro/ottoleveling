import { describe, it, expect } from 'vitest';
import { DevSampleProvider, DEV_SAMPLE_GENERATION } from '../../src/lib/llm/dev-sample';
import { GenerationResponseSchema } from '../../src/schemas/llm-response';
import { forbiddenPatternsFromProfile, findViolation } from '../../src/lib/quest-validator';
import { EXAMPLE_PLAYER_PROFILE } from '../fixtures/player-profile';

describe('DevSampleProvider', () => {
  it('returns a batch that passes the generation schema', async () => {
    const raw = await new DevSampleProvider().complete([{ role: 'system', content: '# IDENTITY' }]);
    expect(() => GenerationResponseSchema.parse(JSON.parse(raw))).not.toThrow();
  });

  it('returns a batch the validator accepts for the example profile', () => {
    const patterns = forbiddenPatternsFromProfile(EXAMPLE_PLAYER_PROFILE);
    for (const q of DEV_SAMPLE_GENERATION.quests) {
      expect(findViolation(q, patterns), q.title).toBeNull();
    }
  });

  it('refuses report prompts so reports use their deterministic fallback', async () => {
    await expect(
      new DevSampleProvider().complete([{ role: 'system', content: '# REPORT ROLE' }]),
    ).rejects.toThrow();
  });
});
