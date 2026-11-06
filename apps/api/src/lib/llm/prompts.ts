// In the Cloudflare Workers build (wrangler), the [[rules]] text import handles *.md as a string.
// In Vitest (Vite), assetsInclude: ['**/*.md'] in vitest.config.ts makes bare *.md imports work.
import rawQuestPrompt from '../../../../../prompts/quest-generation.md';
import rawBilanPrompt from '../../../../../prompts/bilan.md';

/**
 * The raw imported `.md` file has metadata + a horizontal rule + a fenced
 * code block with the actual prompt. Extract the fenced section.
 *
 * Handles both LF and CRLF line endings (Windows git checkout may convert
 * LF → CRLF in the working copy; the regex must tolerate either).
 */
function extractFencedSection(rawMarkdown: string): string {
  // Normalize CRLF to LF before matching so the regex works cross-platform.
  const normalized = rawMarkdown.replace(/\r\n/g, '\n');
  const match = normalized.match(/```\n([\s\S]*?)\n```/);
  if (!match || !match[1]) {
    throw new Error('extractFencedSection: no fenced ``` block found in template');
  }
  return match[1];
}

/**
 * Substitute `{KEY}` placeholders with values from `vars`. Missing keys are
 * left as-is (`{KEY}` survives in the output) so the LLM can complain about
 * incomplete context - better than silently passing empty strings.
 */
export function renderPrompt(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

export const QUEST_GENERATION_PROMPT = extractFencedSection(rawQuestPrompt);
export const BILAN_PROMPT = extractFencedSection(rawBilanPrompt);
