import { getCachedTopic, setCachedTopic } from '@/utils/exploreCache';

export type GutendexCategory = {
  id: string;
  title: string;
  subtitle: string;
  topic: string;
  accent: string;
};

type GutendexAuthor = {
  name?: string;
};

type GutendexBook = {
  id: number;
  title: string;
  authors?: GutendexAuthor[];
  formats: Record<string, string>;
};

type GutendexResponse = {
  count: number;
  next: string | null;
  results: GutendexBook[];
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHED_ITEMS = 120;

export const GUTENDEX_CATEGORIES: GutendexCategory[] = [
  { id: 'classics', title: 'Classics', subtitle: 'Timeless novels and plays', topic: 'classic', accent: '#B88B54' },
  { id: 'mystery', title: 'Mystery', subtitle: 'Crime, puzzles, and suspense', topic: 'mystery', accent: '#5B7F8C' },
  { id: 'science-fiction', title: 'Science Fiction', subtitle: 'Future worlds and big ideas', topic: 'science fiction', accent: '#6A80B9' },
  { id: 'romance', title: 'Romance', subtitle: 'Emotional and character-led stories', topic: 'romance', accent: '#B86F78' },
  { id: 'philosophy', title: 'Philosophy', subtitle: 'Thinkers, essays, and ideas', topic: 'philosophy', accent: '#3D6A60' },
  { id: 'history', title: 'History', subtitle: 'Civilizations, eras, and real lives', topic: 'history', accent: '#9C7154' },
  { id: 'adventure', title: 'Adventure', subtitle: 'Journeys with momentum', topic: 'adventure', accent: '#49786A' },
  { id: 'poetry', title: 'Poetry', subtitle: 'Short-form, lyrical, reflective', topic: 'poetry', accent: '#8C6987' },
];

export const DEFAULT_GUTENDEX_CATEGORY_IDS = [
  'classics',
  'mystery',
  'science-fiction',
  'romance',
  'history',
  'adventure',
];

export const getGutendexCategoryById = (categoryId: string): GutendexCategory | undefined => {
  return GUTENDEX_CATEGORIES.find((category) => category.id === categoryId);
};

export const sanitizeGutendexCategoryIds = (categoryIds: unknown, fallback: string[] = DEFAULT_GUTENDEX_CATEGORY_IDS.slice(0, 3)) => {
  if (!Array.isArray(categoryIds)) {
    return fallback;
  }

  const seen = new Set<string>();
  const resolved = categoryIds
    .filter((value): value is string => typeof value === 'string')
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return Boolean(getGutendexCategoryById(value));
    });

  return resolved.length > 0 ? resolved : fallback;
};

export const resolveGutendexCategories = (categoryIds: string[]): GutendexCategory[] => {
  return sanitizeGutendexCategoryIds(categoryIds, [])
    .map((categoryId) => getGutendexCategoryById(categoryId))
    .filter((category): category is GutendexCategory => Boolean(category));
};

export const resolveExploreCategories = (selectedCategoryIds: string[], totalCount: number = 6): GutendexCategory[] => {
  const preferred = resolveGutendexCategories(selectedCategoryIds);
  const selectedIds = new Set(preferred.map((category) => category.id));
  const fallback = DEFAULT_GUTENDEX_CATEGORY_IDS
    .map((categoryId) => getGutendexCategoryById(categoryId))
    .filter((category): category is GutendexCategory => Boolean(category))
    .filter((category) => !selectedIds.has(category.id));

  return [...preferred, ...fallback].slice(0, totalCount);
};

export const buildGutendexTopicUrl = (topic: string, page?: number) => {
  const params = new URLSearchParams();
  params.set('topic', topic);

  if (typeof page === 'number' && Number.isFinite(page) && page > 1) {
    params.set('page', String(Math.floor(page)));
  }

  return `https://gutendex.com/books?${params.toString()}`;
};

const mapGutendexBook = (book: GutendexBook) => {
  const rawAuthor = book.authors?.[0]?.name || 'Unknown Author';
  const displayAuthor = rawAuthor.includes(',')
    ? rawAuthor.split(',').reverse().join(' ').trim()
    : rawAuthor;

  return {
    ...book,
    displayAuthor,
  };
};

export const fetchGutendexCatalogSummary = async () => {
  const response = await fetch('https://gutendex.com/books');
  if (!response.ok) {
    throw new Error(`Gutendex summary request failed (${response.status})`);
  }

  const data: GutendexResponse = await response.json();

  return {
    count: data.count,
  };
};

export const fetchGutendexTopicFeed = async (requestUrl: string) => {
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`Gutendex request failed (${response.status})`);
  }

  const data: GutendexResponse = await response.json();

  return {
    books: data.results.map(mapGutendexBook),
    nextUrl: data.next,
  };
};

export const prefetchGutendexCategories = async (categoryIds: string[]) => {
  const categories = resolveExploreCategories(categoryIds, 4);

  await Promise.allSettled(
    categories.map(async (category) => {
      const cached = await getCachedTopic(category.topic, CACHE_TTL_MS);
      if (cached) {
        return;
      }

      const result = await fetchGutendexTopicFeed(buildGutendexTopicUrl(category.topic));
      await setCachedTopic(
        category.topic,
        {
          books: result.books,
          nextUrl: result.nextUrl,
          fetchedAt: Date.now(),
        },
        MAX_CACHED_ITEMS,
      );
    }),
  );
};
