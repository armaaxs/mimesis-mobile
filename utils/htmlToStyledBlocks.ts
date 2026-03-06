import { stripProjectGutenbergPhrases } from './extractRawText';

/**
 * Converts chapter HTML into styled blocks (paragraphs, headings) with inline runs
 * (bold, italic, plain text) mapped to TTS chunk indices for per-run highlighting.
 *
 * Design:
 *  1. Parse HTML → blocks (p / h1-h3) → inline runs (text + bold/italic flags)
 *  2. Build canonical text by joining all run texts → normalize identically to chunkText()
 *  3. Build char-to-chunk map from the canonical text against the provided chunks array
 *  4. Split each run at chunk boundaries and annotate with chunkIndex
 */

export type BlockType = 'p' | 'h1' | 'h2' | 'h3';

export interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
  chunkIndex: number;
}

export interface StyledBlock {
  type: BlockType;
  runs: InlineRun[];
}

type CanonicalRun = {
  blockIndex: number;
  bold: boolean;
  italic: boolean;
  text: string;
  start: number;
  end: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    );
}

function normalizeSpace(text: string): string {
  return text.replace(/[\t\r\n ]+/g, ' ');
}

// ---------------------------------------------------------------------------
// HTML → Raw Blocks / Runs
// ---------------------------------------------------------------------------

type RawRun = { text: string; bold: boolean; italic: boolean };
type RawBlock = { type: BlockType; runs: RawRun[] };

/**
 * Recursively extract inline text runs from a fragment of inner HTML,
 * propagating bold/italic context through nested tags.
 */
function extractInlineRuns(innerHtml: string, bold = false, italic = false): RawRun[] {
  const runs: RawRun[] = [];
  // Treat <br> as a space
  const html = innerHtml.replace(/<br\s*\/?>/gi, ' ');

  // Match: known inline wrappers | plain text nodes | any other tag (skip)
  const tokenRegex =
    /<(strong|em|b|i|span)([^>]*)>([\s\S]*?)<\/\1>|([^<]+)|<[^>]+>/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[4] !== undefined) {
      // Plain text node — strip Gutenberg phrases so text aligns with TTS chunks
      const text = normalizeSpace(stripProjectGutenbergPhrases(decodeEntities(match[4])));
      if (text.length > 0) {
        runs.push({ text, bold, italic });
      }
    } else if (match[1]) {
      const tag = match[1].toLowerCase();
      const newBold = bold || tag === 'strong' || tag === 'b';
      const newItalic = italic || tag === 'em' || tag === 'i';
      // Recurse – handles nested <em><strong>…</strong></em>
      runs.push(...extractInlineRuns(match[3], newBold, newItalic));
    }
    // Unknown/void tags are skipped
  }

  return runs;
}

/**
 * Split HTML into block-level elements, extracting their inner HTML and type.
 */
function extractBlocks(html: string): RawBlock[] {
  // Remove script / style noise
  const cleaned = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  const blockRegex =
    /<(p|h[1-6]|div|li|blockquote)([^>]*)>([\s\S]*?)<\/\1>/gi;
  const blocks: RawBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(cleaned)) !== null) {
    const tag = match[1].toLowerCase();
    let type: BlockType = 'p';
    if (tag === 'h1') type = 'h1';
    else if (tag === 'h2') type = 'h2';
    else if (tag === 'h3') type = 'h3';

    const runs = extractInlineRuns(match[3]);
    if (runs.some((r) => r.text.trim().length > 0)) {
      blocks.push({ type, runs });
    }
  }

  // Fallback: if no block tags were found, treat entire HTML as one paragraph
  if (blocks.length === 0 && cleaned.trim()) {
    const runs = extractInlineRuns(cleaned);
    if (runs.length > 0) {
      blocks.push({ type: 'p', runs });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Chunk Mapping
// ---------------------------------------------------------------------------

/**
 * Build an array where charToChunk[i] = chunk index covering character i
 * in the given normalised text.  Unmatched positions are -1.
 */
function buildCharToChunkMap(text: string, chunks: string[]): number[] {
  const map = new Array<number>(text.length).fill(-1);
  let searchFrom = 0;

  for (let ci = 0; ci < chunks.length; ci++) {
    const idx = text.indexOf(chunks[ci], searchFrom);
    if (idx >= 0) {
      for (let j = idx; j < idx + chunks[ci].length; j++) {
        map[j] = ci;
      }
      searchFrom = idx + chunks[ci].length;
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert chapter HTML to styled blocks whose inline runs are annotated
 * with the TTS chunk index they belong to.
 *
 * @param html      Raw chapter HTML
 * @param chunks    TTS chunk strings produced by chunkText() on the same chapter
 * @param rawText   The exact plain-text string that was fed to chunkText().
 *                  This is the single source of truth — chunks are guaranteed
 *                  substrings of rawText after the same normalization chunkText uses.
 */
export function htmlToStyledBlocks(html: string, chunks: string[], rawText: string): StyledBlock[] {
  if (!html || chunks.length === 0) return [];

  const rawBlocks = extractBlocks(html);
  if (rawBlocks.length === 0) return [];

  // Build a canonical text stream directly from extracted runs so each run
  // gets deterministic start/end offsets and does not rely on brittle indexOf drift.
  const canonicalRuns: CanonicalRun[] = [];
  let canonicalText = '';

  const appendRunToCanonical = (runText: string, meta: Omit<CanonicalRun, 'text' | 'start' | 'end'>) => {
    if (runText.length === 0) {
      return;
    }

    // Collapse block/tag boundaries to one space, matching chunkText normalization.
    if (canonicalText.length > 0 && canonicalText[canonicalText.length - 1] !== ' ') {
      canonicalText += ' ';
    }

    const start = canonicalText.length;
    canonicalText += runText;
    const end = canonicalText.length;

    canonicalRuns.push({
      ...meta,
      text: runText,
      start,
      end,
    });
  };

  rawBlocks.forEach((block, blockIndex) => {
    for (const run of block.runs) {
      const runText = run.text.replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim();
      appendRunToCanonical(runText, {
        blockIndex,
        bold: run.bold,
        italic: run.italic,
      });
    }
  });

  if (canonicalText.length === 0) {
    return [];
  }

  const charToChunk = buildCharToChunkMap(canonicalText, chunks);
  const result: StyledBlock[] = rawBlocks.map((block) => ({ type: block.type, runs: [] }));

  for (const run of canonicalRuns) {
    let currentChunk = -1;
    for (let i = run.start; i < run.end; i += 1) {
      if (charToChunk[i] >= 0) {
        currentChunk = charToChunk[i];
        break;
      }
    }

    if (currentChunk < 0) {
      // At chapter start, unmatched spans should map to the first chunk, not the last.
      currentChunk = 0;
    }

    let segStart = 0;
    for (let i = run.start; i < run.end; i += 1) {
      const ci = charToChunk[i] >= 0 ? charToChunk[i] : currentChunk;
      if (ci !== currentChunk) {
        const localOffset = i - run.start;
        const segText = run.text.slice(segStart, localOffset);
        if (segText.length > 0) {
          result[run.blockIndex].runs.push({
            text: segText,
            bold: run.bold,
            italic: run.italic,
            chunkIndex: currentChunk,
          });
        }
        segStart = localOffset;
        currentChunk = ci;
      }
    }

    const trailing = run.text.slice(segStart);
    if (trailing.length > 0) {
      result[run.blockIndex].runs.push({
        text: trailing,
        bold: run.bold,
        italic: run.italic,
        chunkIndex: currentChunk,
      });
    }
  }

  return result.filter((block) => block.runs.length > 0);
}
