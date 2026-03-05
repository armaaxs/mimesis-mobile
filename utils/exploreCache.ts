import { Directory, File, Paths } from 'expo-file-system';

const cacheDirectory = new Directory(Paths.document, 'explore-cache');

const ensureCacheDir = () => {
  if (!cacheDirectory.exists) {
    cacheDirectory.create({ intermediates: true, idempotent: true });
  }
};

const fileForTopic = (topic: string) => new File(cacheDirectory, `${encodeURIComponent(topic)}.json`);

export type CachedTopic = {
  books: any[];
  nextUrl: string | null;
  fetchedAt: number;
};

export async function getCachedTopic(topic: string, ttlMs = 15 * 60 * 1000): Promise<CachedTopic | null> {
  try {
    ensureCacheDir();
    const cacheFile = fileForTopic(topic);
    if (!cacheFile.exists) {
      return null;
    }

    const raw = await cacheFile.text();
    if (!raw.trim()) {
      return null;
    }

    const parsed: CachedTopic = JSON.parse(raw);
    if (!parsed.fetchedAt) return null;
    if (ttlMs > 0 && Date.now() - parsed.fetchedAt > ttlMs) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('exploreCache.getCachedTopic error', error);
    return null;
  }
}

export async function setCachedTopic(topic: string, payload: { books: any[]; nextUrl: string | null; fetchedAt?: number }, maxItems = 200): Promise<void> {
  try {
    ensureCacheDir();
    const cacheFile = fileForTopic(topic);
    const data: CachedTopic = {
      books: payload.books ? payload.books.slice(0, maxItems) : [],
      nextUrl: payload.nextUrl ?? null,
      fetchedAt: payload.fetchedAt ?? Date.now(),
    };

    if (!cacheFile.exists) {
      cacheFile.create({ intermediates: true, overwrite: true });
    }

    cacheFile.write(JSON.stringify(data), { encoding: 'utf8' });
  } catch (error) {
    console.warn('exploreCache.setCachedTopic error', error);
  }
}

export async function clearCachedTopic(topic: string): Promise<void> {
  try {
    const cacheFile = fileForTopic(topic);
    if (cacheFile.exists) {
      cacheFile.delete();
    }
  } catch (error) {
    console.warn('exploreCache.clearCachedTopic error', error);
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    if (cacheDirectory.exists) {
      cacheDirectory.delete();
    }
  } catch (error) {
    console.warn('exploreCache.clearAllCache error', error);
  }
}

export default {
  getCachedTopic,
  setCachedTopic,
  clearCachedTopic,
  clearAllCache,
};
