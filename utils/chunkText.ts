/**
 * Splits text into chunks of up to maxChars, breaking at sentence boundaries if possible.
 * @param text The input text to chunk.
 * @param maxChars Maximum characters per chunk.
 * @returns Array of chunked strings.
 */
export function chunkText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const end = currentIndex + maxChars;

    if (end >= text.length) {
      chunks.push(text.substring(currentIndex).trim());
      break;
    }

    const segment = text.substring(currentIndex, end);
    const lastSentenceBreak = segment.lastIndexOf('. ');
    const splitIndex = lastSentenceBreak > 0 ? lastSentenceBreak + 1 : maxChars;
    const nextChunk = text.substring(currentIndex, currentIndex + splitIndex).trim();

    if (nextChunk.length > 0) {
      chunks.push(nextChunk);
    }

    currentIndex += splitIndex;
  }

  return chunks;
}