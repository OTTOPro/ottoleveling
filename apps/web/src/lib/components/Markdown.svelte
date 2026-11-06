<!--
  apps/web/src/lib/components/Markdown.svelte

  Renders trusted markdown from `marked`, then sanitizes through DOMPurify
  before injecting via {@html}. Hardening: even
  though the bilan narrative comes from our own length-capped LLM (Zod
  min(100).max(8000)), defense in depth: sanitize on the client. If a future
  surface ever reuses this component for user-typed markdown, the sanitizer
  keeps it safe.
-->
<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  interface Props {
    markdown: string;
  }
  let { markdown }: Props = $props();

  marked.setOptions({ gfm: true, breaks: false });

  const html = $derived(DOMPurify.sanitize(marked.parse(markdown) as string));
</script>

<div class="narrative">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- html is sanitized by DOMPurify in the $derived above -->
  {@html html}
</div>
