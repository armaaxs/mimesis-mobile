/**
 * Splits text into chunks of up to maxChars, preferring natural punctuation boundaries
 * and avoiding word cuts unless absolutely necessary.
 * @param text The input text to chunk.
 * @param maxChars Maximum characters per chunk.
 * @returns Array of chunked strings.
 */
export function chunkText(text: string, maxChars: number): string[] {
  if (!text || maxChars <= 0) {
    return [];
  }

  const normalizedText = text
    .replace(/[\t\r]+/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();

  if (!normalizedText) {
    return [];
  }

  const abbreviationRegex = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|e\.g|i\.e|u\.s|etc|no)\.$/i;
  const lookaheadLimit = Math.max(24, Math.floor(maxChars * 0.25));

  const findPunctuationBoundary = (startIndex: number, preferredEnd: number) => {
    const searchEnd = Math.min(normalizedText.length - 1, preferredEnd);
    let bestPeriod = -1;
    let bestComma = -1;
    let bestColon = -1;

    for (let index = searchEnd; index >= startIndex; index -= 1) {
      const char = normalizedText[index];

      if (char === '.' && bestPeriod < 0) {
        const candidatePrefix = normalizedText.slice(Math.max(startIndex, index - 16), index + 1);
        if (!abbreviationRegex.test(candidatePrefix)) {
          bestPeriod = index;
        }
        continue;
      }

      if (char === ',' && bestComma < 0) {
        bestComma = index;
        continue;
      }

      if (char === ':' && bestColon < 0) {
        bestColon = index;
      }
    }

    return bestPeriod >= 0 ? bestPeriod : bestComma >= 0 ? bestComma : bestColon;
  };

  const findWhitespaceBoundary = (startIndex: number, preferredEnd: number) => {
    for (let index = preferredEnd; index >= startIndex; index -= 1) {
      if (/\s/.test(normalizedText[index])) {
        return index;
      }
    }

    return -1;
  };

  const findForwardBoundary = (searchFrom: number, searchTo: number) => {
    for (let index = searchFrom; index <= searchTo; index += 1) {
      const char = normalizedText[index];
      if (char === '.' || char === ',' || char === ':' || /\s/.test(char)) {
        return index;
      }
    }

    return -1;
  };

  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < normalizedText.length) {
    const preferredEnd = Math.min(normalizedText.length - 1, currentIndex + maxChars - 1);

    if (preferredEnd >= normalizedText.length - 1) {
      chunks.push(normalizedText.substring(currentIndex).trim());
      break;
    }

    let splitIndex = findPunctuationBoundary(currentIndex, preferredEnd);

    if (splitIndex < 0) {
      splitIndex = findWhitespaceBoundary(currentIndex, preferredEnd);
    }

    if (splitIndex < 0) {
      const lookaheadEnd = Math.min(normalizedText.length - 1, preferredEnd + lookaheadLimit);
      splitIndex = findForwardBoundary(preferredEnd + 1, lookaheadEnd);
    }

    if (splitIndex < 0 || splitIndex < currentIndex) {
      splitIndex = preferredEnd;
    }

    const nextChunk = normalizedText.substring(currentIndex, splitIndex + 1).trim();

    if (nextChunk.length > 0) {
      chunks.push(nextChunk);
    }

    currentIndex = splitIndex + 1;
    while (currentIndex < normalizedText.length && /\s/.test(normalizedText[currentIndex])) {
      currentIndex += 1;
    }
  }

  return chunks;
}