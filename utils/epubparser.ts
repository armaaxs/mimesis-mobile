import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { extractRawText, stripProjectGutenbergPhrases } from './extractRawText';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "", 
});

export interface EpubStructure {
  title: string;
  author: string;
  chapters: { id: string; href: string; title?: string }[];
  basePath: string;
}

export interface ImportedEpubChapter {
  id: string;
  href: string;
  title?: string;
  html: string;
  plainText: string;
}

export interface ImportedEpubPayload {
  title: string;
  author: string;
  cover: string | null;
  basePath: string;
  chapters: ImportedEpubChapter[];
}

const looksLikeGutenbergLicenseChapter = (chapter: {
  href?: string;
  title?: string;
  plainText?: string;
}): boolean => {
  const href = (chapter.href || '').toLowerCase();
  const title = (chapter.title || '').toLowerCase();
  const plainText = (chapter.plainText || '').toLowerCase();

  const titleOrHrefSignals =
    href.includes('license') ||
    href.includes('gutenberg') ||
    title.includes('project gutenberg license') ||
    title.includes('gutenberg license') ||
    title === 'license' ||
    title.endsWith(' license');

  const textSignals =
    plainText.includes('this ebook is for the use of anyone anywhere') ||
    plainText.includes('at no cost and with almost no restrictions whatsoever') ||
    plainText.includes('before using this ebook');

  return titleOrHrefSignals || textSignals;
};

const pruneTrailingGutenbergLicenseChapters = <T extends { href?: string; title?: string; plainText?: string }>(
  chapters: T[]
): T[] => {
  const pruned = [...chapters];

  while (pruned.length > 0 && looksLikeGutenbergLicenseChapter(pruned[pruned.length - 1])) {
    pruned.pop();
  }

  return pruned;
};

const looksLikeCoverChapter = (chapter: {
  href?: string;
  title?: string;
  plainText?: string;
}): boolean => {
  const href = (chapter.href || '').toLowerCase();
  const title = (chapter.title || '').toLowerCase().trim();
  const plainText = (chapter.plainText || '').toLowerCase();

  const normalizedTitle = title.replace(/["'“”‘’]/g, '').trim();

  const titleSignals =
    normalizedTitle === 'cover' ||
    normalizedTitle === 'book cover' ||
    normalizedTitle === 'front cover';

  const hrefSignals =
    /(^|\/)(cover|coverpage|titlepage)(\.[a-z0-9]+)?$/i.test(href) ||
    href.includes('cover.xhtml') ||
    href.includes('cover.html') ||
    href.includes('titlepage.xhtml') ||
    href.includes('titlepage.html');

  const textSignals =
    plainText.trim() === 'cover' ||
    plainText.trim() === 'book cover';

  return titleSignals || hrefSignals || textSignals;
};

const stripCoverChapters = <T extends { href?: string; title?: string; plainText?: string }>(
  chapters: T[]
): T[] => chapters.filter((chapter) => !looksLikeCoverChapter(chapter));

const resolveEpubPath = (basePath: string, href: string): string => {
  if (!href) return '';
  if (href.startsWith('/')) return href.slice(1);
  if (href.startsWith(basePath) || !basePath) return href;
  return `${basePath}${href}`;
};

const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const dirname = (path: string): string => {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.slice(0, lastSlash + 1) : '';
};

const normalizePathSegments = (path: string): string => {
  const cleanPath = path.replace(/\\/g, '/').replace(/^\//, '');
  const segments = cleanPath.split('/');
  const normalized: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }

  return normalized.join('/');
};

const stripHrefFragment = (href: string): string => {
  const hashIndex = href.indexOf('#');
  return hashIndex >= 0 ? href.slice(0, hashIndex) : href;
};

const normalizeComparableHref = (href: string): string => {
  const stripped = stripHrefFragment(href).trim();
  if (!stripped) return '';

  try {
    return normalizePathSegments(decodeURIComponent(stripped)).toLowerCase();
  } catch {
    return normalizePathSegments(stripped).toLowerCase();
  }
};

const resolveRelativePath = (baseDir: string, href: string): string => {
  const cleanHref = stripHrefFragment(href).trim();
  if (!cleanHref) return '';

  if (/^(https?:|mailto:|tel:)/i.test(cleanHref)) {
    return '';
  }

  if (cleanHref.startsWith('/')) {
    return normalizePathSegments(cleanHref);
  }

  return normalizePathSegments(`${baseDir}${cleanHref}`);
};

const getVal = (val: unknown): string | null => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    return getVal(val[0]);
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const text = obj['#text'];
    if (typeof text === 'string') return text;
    const firstValue = Object.values(obj)[0];
    return getVal(firstValue);
  }
  return null;
};

const inferMimeTypeFromPath = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
};

const extractNcxTocEntries = (ncxRawText: string): Array<{ href: string; title: string }> => {
  const result: Array<{ href: string; title: string }> = [];

  try {
    const parsed = xmlParser.parse(ncxRawText);
    const navMap = parsed?.ncx?.navMap;
    if (!navMap) {
      return result;
    }

    const walkNavPoint = (node: any) => {
      if (!node) return;

      const label = getVal(node?.navLabel?.text) || getVal(node?.navLabel) || '';
      const src = typeof node?.content?.src === 'string' ? node.content.src : '';

      if (src && label.trim()) {
        result.push({ href: src, title: label.trim() });
      }

      const children = toArray(node?.navPoint);
      for (const child of children) {
        walkNavPoint(child);
      }
    };

    const topLevel = toArray(navMap?.navPoint);
    for (const item of topLevel) {
      walkNavPoint(item);
    }
  } catch (error) {
    console.warn('Failed to parse NCX TOC:', error);
  }

  return result;
};

const decodeBasicHtmlEntities = (input: string): string =>
  input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const extractNavDocumentTocEntries = (navRawText: string): Array<{ href: string; title: string }> => {
  const navRegionMatch =
    navRawText.match(/<nav\b[^>]*?(?:epub:type|type)\s*=\s*["'][^"']*toc[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i) ||
    navRawText.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i);

  if (!navRegionMatch) {
    return [];
  }

  const navRegion = navRegionMatch[1];
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const entries: Array<{ href: string; title: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(navRegion)) !== null) {
    const href = (match[1] || '').trim();
    const label = decodeBasicHtmlEntities((match[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

    if (href && label) {
      entries.push({ href, title: label });
    }
  }

  return entries;
};

const buildTocTitleMap = async (
  zip: JSZip,
  manifestArray: Array<{ id?: string; href?: string; ['media-type']?: string; properties?: string }>,
  basePath: string
): Promise<Map<string, string>> => {
  const tocMap = new Map<string, string>();

  const tocItem =
    manifestArray.find((item) => item['media-type'] === 'application/x-dtbncx+xml') ||
    manifestArray.find((item) => item.properties?.split(/\s+/).includes('nav'));

  if (!tocItem?.href) {
    return tocMap;
  }

  const tocPath = resolveEpubPath(basePath, tocItem.href);
  const tocFile = zip.file(tocPath);
  if (!tocFile) {
    return tocMap;
  }

  const tocRawText = await tocFile.async('text');
  const tocEntries = tocItem['media-type'] === 'application/x-dtbncx+xml'
    ? extractNcxTocEntries(tocRawText)
    : extractNavDocumentTocEntries(tocRawText);

  const tocBaseDir = dirname(tocPath);

  for (const entry of tocEntries) {
    const resolved = resolveRelativePath(tocBaseDir, entry.href);
    if (!resolved) continue;

    const relativeToOpf = resolved.startsWith(basePath)
      ? resolved.slice(basePath.length)
      : resolved;

    const normalized = normalizeComparableHref(relativeToOpf);
    if (!normalized) continue;

    if (!tocMap.has(normalized)) {
      tocMap.set(normalized, entry.title);
    }
  }

  return tocMap;
};

const getPackageDescriptor = async (zip: JSZip) => {
  const containerEntry = zip.file('META-INF/container.xml');
  if (!containerEntry) throw new Error('Missing container.xml');

  const containerXml = await containerEntry.async('text');
  const containerData = xmlParser.parse(containerXml);

  const rootfiles = containerData?.container?.rootfiles?.rootfile;
  if (!rootfiles) throw new Error('Invalid container.xml: missing rootfile entry');

  const rootfile = Array.isArray(rootfiles) ? rootfiles[0] : rootfiles;
  const opfPath = rootfile?.['full-path'];
  if (!opfPath) throw new Error('Could not find OPF path');

  const basePath = opfPath.includes('/')
    ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
    : '';

  const opfEntry = zip.file(opfPath);
  if (!opfEntry) throw new Error('OPF file not found in zip at: ' + opfPath);

  const opfXml = await opfEntry.async('text');
  const opfData = xmlParser.parse(opfXml);
  const packageData = opfData?.package;

  if (!packageData) throw new Error('Invalid OPF: missing package node');

  const metadata = packageData.metadata ?? {};
  const manifestArray = toArray<{ id?: string; href?: string; ['media-type']?: string; properties?: string }>(packageData.manifest?.item);
  const spineArray = toArray<{ idref?: string }>(packageData.spine?.itemref);
  const guideArray = toArray<{ type?: string; href?: string }>(packageData.guide?.reference);

  if (manifestArray.length === 0 || spineArray.length === 0) {
    throw new Error('Invalid OPF: missing manifest or spine');
  }

  const manifestById = new Map<string, { id?: string; href?: string; ['media-type']?: string; properties?: string }>(
    manifestArray
      .filter((item) => Boolean(item?.id))
      .map((item) => [item.id as string, item])
  );

  return {
    metadata,
    manifestArray,
    spineArray,
    guideArray,
    manifestById,
    basePath,
  };
};

export const parseEpub = async (zip: JSZip): Promise<EpubStructure> => {
  try {
    const { metadata, spineArray, manifestArray, manifestById, basePath } = await getPackageDescriptor(zip);
    const tocTitleMap = await buildTocTitleMap(zip, manifestArray, basePath);

    const chapters = spineArray
      .map((ref: { idref?: string }) => {
      const idref = ref?.idref;
      if (!idref) {
        return null;
      }

      const item = manifestById.get(idref);
      return {
        id: idref,
        href: item ? item.href : '',
        title: item?.href ? tocTitleMap.get(normalizeComparableHref(item.href)) : undefined,
      };
    })
      .filter((chapter): chapter is { id: string; href: string } => Boolean(chapter?.href));

    const filteredChapters = pruneTrailingGutenbergLicenseChapters(stripCoverChapters(chapters));

    return {
      title: getVal((metadata as Record<string, unknown>)['dc:title']) || 'Unknown Title',
      author: getVal((metadata as Record<string, unknown>)['dc:creator']) || 'Unknown Author',
      chapters: filteredChapters,
      basePath,
    };

  } catch (error) {
    console.error('EPUB Parser Error:', error);
    throw error;
  }
};

export const extractEpubImportPayload = async (zip: JSZip): Promise<ImportedEpubPayload> => {
  const { metadata, manifestArray, spineArray, guideArray, manifestById, basePath } = await getPackageDescriptor(zip);
  const tocTitleMap = await buildTocTitleMap(zip, manifestArray, basePath);

  const coverMetaCandidates = toArray((metadata as Record<string, unknown>)['meta']) as Array<{
    name?: string;
    content?: string;
    property?: string;
    ['#text']?: string;
  }>;

  const coverIdFromMeta =
    coverMetaCandidates.find((item) => item?.name?.toLowerCase() === 'cover')?.content ||
    coverMetaCandidates.find((item) => item?.property?.toLowerCase() === 'cover-image')?.['#text'] ||
    null;

  const manifestCoverItem =
    (coverIdFromMeta ? manifestById.get(coverIdFromMeta) : undefined) ||
    manifestArray.find((item) => item.properties?.includes('cover-image')) ||
    (() => {
      const guideCoverHref = guideArray.find((ref) => ref.type?.toLowerCase().includes('cover'))?.href;
      if (!guideCoverHref) return undefined;
      return manifestArray.find((item) => item.href === guideCoverHref);
    })();

  let cover: string | null = null;
  if (manifestCoverItem?.href) {
    const coverPath = resolveEpubPath(basePath, manifestCoverItem.href);
    const coverFile = zip.file(coverPath);

    if (coverFile) {
      const base64 = await coverFile.async('base64');
      const mime = manifestCoverItem['media-type'] || inferMimeTypeFromPath(coverPath);
      cover = `data:${mime};base64,${base64}`;
    }
  }

  const chapters: ImportedEpubChapter[] = [];
  for (const ref of spineArray) {
    const idref = ref?.idref;
    if (!idref) {
      continue;
    }

    const item = manifestById.get(idref);
    const href = item?.href;
    if (!href) {
      continue;
    }

    const fullPath = resolveEpubPath(basePath, href);
    const html = await getChapterText(zip, fullPath);
    const sanitizedHtml = stripProjectGutenbergPhrases(html);

    chapters.push({
      id: idref,
      href,
      title: tocTitleMap.get(normalizeComparableHref(href)),
      html: sanitizedHtml,
      plainText: extractRawText(sanitizedHtml),
    });
  }

  const filteredChapters = pruneTrailingGutenbergLicenseChapters(stripCoverChapters(chapters));

  return {
    title: getVal((metadata as Record<string, unknown>)['dc:title']) || 'Unknown Title',
    author: getVal((metadata as Record<string, unknown>)['dc:creator']) || 'Unknown Author',
    cover,
    basePath,
    chapters: filteredChapters,
  };
};

export const getChapterText = async (zip: JSZip, href: string) => { // MAKE SURE TO PASS THE BASEPATH+HREF
  const file = zip.file(href); // Look up the file by the path you found
  if (file) {
    const htmlContent = await file.async("text"); // Extract the raw HTML
    return stripProjectGutenbergPhrases(htmlContent);
  }
  return stripProjectGutenbergPhrases("Chapter not found");
};