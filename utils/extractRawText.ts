export const stripProjectGutenbergPhrases = (text: string): string => {
  if (!text) return '';

  return text
    .replace(/\bthe\s+project\s+gutenberg\s+ebook\s+of\b/gi, ' ')
    .replace(/\bproject\s+gutenberg(?:['’]s)?\b/gi, ' ')
    .replace(/\b(?:https?:\/\/)?(?:www\.)?gutenberg\.org\b/gi, ' ')
    .replace(/\bgutenberg\b/gi, ' ');
};

export const extractRawText = (html: string): string => {
  if (!html) return '';

  const cleaned = stripProjectGutenbergPhrases(
    html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(p|br|h1|h2|h3|h4|h5|h6|div|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
  );

  return cleaned
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
};
