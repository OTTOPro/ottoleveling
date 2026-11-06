/**
 * Post-generation validator.
 *
 * The prompt tells the LLM what is forbidden, but a prompt is a request, not a
 * guarantee. This module rereads every generated quest before it is written
 * to D1 and rejects any quest whose title or description matches a forbidden
 * pattern. Rejected quests are replaced by the medically inert fallback quest
 * of the same pillar.
 *
 * Patterns come from two places:
 *   - the player profile (PLAYER_PROFILE): the "Forbidden:" list, plus any
 *     "(no X)" aside such as "(no crypto)";
 *   - quest templates: metadata.contraindicated, e.g. "loaded_spinal_flexion".
 *
 * Matching is lexical, not semantic. A pattern matches when its words appear
 * consecutively in the quest text; a pattern word of 4+ letters also matches
 * any word it prefixes, so "deadlift" catches "deadlifts" and "plyo" catches
 * "plyometric". Pattern words longer than 4 letters lose a final "s", so
 * "plyometrics" in a profile also catches "plyometric". A paraphrase that avoids every listed word will pass. This is
 * a safety net under the prompt rules, not a replacement for them.
 */

export type ForbiddenSource = 'profile' | 'template';

export interface ForbiddenPattern {
  phrase: string;
  tokens: string[];
  source: ForbiddenSource;
  templateId?: number;
}

export interface ValidatableQuest {
  pillar_id: string;
  title: string;
  description?: string | null;
}

export interface RejectedQuest {
  index: number;
  pillar_id: string;
  title: string;
  pattern: string;
  source: ForbiddenSource;
  templateId?: number;
}

export interface ValidationResult<Q> {
  quests: Q[];
  rejected: RejectedQuest[];
}

const MIN_PREFIX_LENGTH = 4;

function stem(token: string): string {
  return token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token;
}

/** Lowercase words, split on anything that is not a letter or a digit. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

function toPattern(
  phrase: string,
  source: ForbiddenSource,
  templateId?: number,
): ForbiddenPattern | null {
  const clean = phrase.replace(/[_-]+/g, ' ').trim();
  const tokens = tokenize(clean).map(stem);
  if (tokens.length === 0) return null;
  return templateId === undefined
    ? { phrase: clean.toLowerCase(), tokens, source }
    : { phrase: clean.toLowerCase(), tokens, source, templateId };
}

/**
 * Extracts forbidden patterns from a free-text profile.
 *
 * Reads the text after "Forbidden:" up to the first "Prioritize:", blank line
 * or sentence end, split on commas, semicolons and "and". Also reads asides
 * of the form "(no X)".
 */
export function forbiddenPatternsFromProfile(profile: string): ForbiddenPattern[] {
  const patterns: ForbiddenPattern[] = [];
  const forbiddenRe = /forbidden\s*:\s*([\s\S]*?)(?=prioriti[sz]e\s*:|\n\s*\n|\.(?:\s|$)|$)/gi;
  for (const m of profile.matchAll(forbiddenRe)) {
    const list = (m[1] ?? '').replace(/\s+/g, ' ');
    for (const item of list.split(/,|;|\band\b/i)) {
      const p = toPattern(item, 'profile');
      if (p) patterns.push(p);
    }
  }
  for (const m of profile.matchAll(/\(\s*no\s+([^)]+)\)/gi)) {
    const p = toPattern(m[1] ?? '', 'profile');
    if (p) patterns.push(p);
  }
  return dedupe(patterns);
}

/** Extracts metadata.contraindicated entries from template rows. */
export function forbiddenPatternsFromTemplates(
  templates: { id: number; metadata: string | null }[],
): ForbiddenPattern[] {
  const patterns: ForbiddenPattern[] = [];
  for (const t of templates) {
    if (!t.metadata) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(t.metadata);
    } catch {
      continue;
    }
    const list = (parsed as { contraindicated?: unknown }).contraindicated;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const p = toPattern(item, 'template', t.id);
      if (p) patterns.push(p);
    }
  }
  return dedupe(patterns);
}

function dedupe(patterns: ForbiddenPattern[]): ForbiddenPattern[] {
  const seen = new Set<string>();
  return patterns.filter((p) => {
    if (seen.has(p.phrase)) return false;
    seen.add(p.phrase);
    return true;
  });
}

function tokenMatches(textToken: string, patternToken: string): boolean {
  if (patternToken.length >= MIN_PREFIX_LENGTH) return textToken.startsWith(patternToken);
  return textToken === patternToken;
}

/** True when the pattern's tokens appear consecutively in the text tokens. */
export function matchesPattern(textTokens: string[], pattern: ForbiddenPattern): boolean {
  const n = pattern.tokens.length;
  for (let i = 0; i + n <= textTokens.length; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (!tokenMatches(textTokens[i + j]!, pattern.tokens[j]!)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function findViolation(
  quest: ValidatableQuest,
  patterns: ForbiddenPattern[],
): ForbiddenPattern | null {
  const tokens = tokenize(`${quest.title} ${quest.description ?? ''}`);
  for (const p of patterns) {
    if (matchesPattern(tokens, p)) return p;
  }
  return null;
}

/**
 * Replaces every quest that matches a forbidden pattern with the fallback
 * quest of the same pillar. A pillar's fallback is used at most once per
 * batch; further rejections in that pillar are dropped instead of duplicated.
 */
export function validateQuests<Q extends ValidatableQuest>(
  quests: Q[],
  patterns: ForbiddenPattern[],
  fallbackFor: (pillarId: string) => Q | null,
): ValidationResult<Q> {
  const out: Q[] = [];
  const rejected: RejectedQuest[] = [];
  const usedFallback = new Set<string>();

  quests.forEach((q, index) => {
    const hit = findViolation(q, patterns);
    if (!hit) {
      out.push(q);
      return;
    }
    rejected.push({
      index,
      pillar_id: q.pillar_id,
      title: q.title,
      pattern: hit.phrase,
      source: hit.source,
      ...(hit.templateId !== undefined ? { templateId: hit.templateId } : {}),
    });
    if (usedFallback.has(q.pillar_id)) return;
    const replacement = fallbackFor(q.pillar_id);
    if (replacement) {
      out.push(replacement);
      usedFallback.add(q.pillar_id);
    }
  });

  return { quests: out, rejected };
}
