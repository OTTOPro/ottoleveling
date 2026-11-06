import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

describe('Markdown.svelte sanitization', () => {
  it('strips <script> tags from rendered markdown', () => {
    const malicious = 'Hello\n\n<script>alert(1)</script>\n\nWorld';
    const html = marked.parse(malicious) as string;
    const sanitized = DOMPurify.sanitize(html);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('alert(1)');
    // Plain text content should survive
    expect(sanitized).toContain('Hello');
    expect(sanitized).toContain('World');
  });

  it('strips inline event handlers from raw HTML passed through marked', () => {
    // marked passes raw HTML blocks through; DOMPurify should strip the handler
    const malicious = '<img src="x" onerror="alert(1)">';
    const html = marked.parse(malicious) as string;
    const sanitized = DOMPurify.sanitize(html);
    expect(sanitized).not.toContain('onerror');
  });

  it('preserves safe markdown (headings, links, code, tables)', () => {
    const safe =
      '## Heading\n\n[link](https://example.com)\n\n`code`\n\n| a | b |\n|---|---|\n| 1 | 2 |';
    const html = marked.parse(safe) as string;
    const sanitized = DOMPurify.sanitize(html);
    expect(sanitized).toContain('<h2');
    expect(sanitized).toContain('<a');
    expect(sanitized).toContain('href="https://example.com"');
    expect(sanitized).toContain('<code');
    expect(sanitized).toContain('<table');
  });
});
