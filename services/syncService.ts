import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BookDTO, BookReadingProgressDTO } from '@/models/Book';
import { isSupabaseConfigured, supabase } from '@/services/supabaseAuth';
import { getBookById, saveBookReadingProgress } from '@/utils/bookRepository';

const SYNC_QUEUE_KEY = 'mimesis.sync.queue.v1';

type SyncOperation =
  | {
      id: string;
      dedupeKey: string;
      createdAt: number;
      type: 'upsert_book';
      payload: {
        id: string;
        title: string;
        author: string | null;
        language: string | null;
        summary: string | null;
        cover_url: string | null;
        source: string;
        source_updated_at: string;
      };
    }
  | {
      id: string;
      dedupeKey: string;
      createdAt: number;
      type: 'upsert_user_book';
      payload: {
        bookId: string;
        isSaved: boolean;
        lastChapterIndex: number | null;
        lastChunkIndex: number | null;
        lastChapterHref: string | null;
        progressPercent: number | null;
        lastReadAt: string | null;
      };
    }
  | {
      id: string;
      dedupeKey: string;
      createdAt: number;
      type: 'delete_user_book';
      payload: {
        bookId: string;
      };
    }
  | {
      id: string;
      dedupeKey: string;
      createdAt: number;
      type: 'upsert_user_settings';
      payload: {
        amoledDark: boolean;
        wifiOnlyDownloads: boolean;
        fontScale: number;
      };
    };

let activeFlushPromise: Promise<void> | null = null;
let activePullPromise: Promise<void> | null = null;

export type RemoteUserSettings = {
  amoledDark: boolean;
  wifiOnlyDownloads: boolean;
  fontScale: number;
};

const makeOperationId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const readQueue = async (): Promise<SyncOperation[]> => {
  const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as SyncOperation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = async (items: SyncOperation[]) => {
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(items));
};

const upsertOperation = async (operation: SyncOperation) => {
  const queue = await readQueue();
  const filtered = queue.filter((item) => item.dedupeKey !== operation.dedupeKey);
  filtered.push(operation);
  filtered.sort((a, b) => a.createdAt - b.createdAt);
  await writeQueue(filtered);
};

const mapProgressPercent = (progress: BookReadingProgressDTO | null | undefined): number | null => {
  if (!progress) {
    return null;
  }

  if (progress.lastChapterIndex < 0) {
    return null;
  }

  return Number((Math.min(100, Math.max(0, (progress.lastChapterIndex + 1) * 5))).toFixed(2));
};

export const enqueueBookSync = async (book: BookDTO) => {
  const metadata = book.metadata ?? null;
  const sourceId = metadata?.sourceId;
  const isGutendex = Number.isFinite(sourceId ?? NaN);

  const operation: SyncOperation = {
    id: makeOperationId(),
    dedupeKey: `book:${book.id}`,
    createdAt: Date.now(),
    type: 'upsert_book',
    payload: {
      id: book.id,
      title: book.title,
      author: book.author || null,
      language: metadata?.language || null,
      summary: metadata?.summary || null,
      cover_url: book.cover || null,
      source: isGutendex ? 'gutendex' : 'local_import',
      source_updated_at: new Date().toISOString(),
    },
  };

  await upsertOperation(operation);
  void flushSyncQueue();
};

export const enqueueUserBookSync = async (params: {
  bookId: string;
  progress?: BookReadingProgressDTO | null;
  isSaved: boolean;
}) => {
  const progress = params.progress ?? null;

  const operation: SyncOperation = {
    id: makeOperationId(),
    dedupeKey: `user_book:${params.bookId}`,
    createdAt: Date.now(),
    type: 'upsert_user_book',
    payload: {
      bookId: params.bookId,
      isSaved: params.isSaved,
      lastChapterIndex: progress?.lastChapterIndex ?? null,
      lastChunkIndex: progress?.lastChunkIndex ?? null,
      lastChapterHref: progress?.lastChapterHref ?? null,
      progressPercent: mapProgressPercent(progress),
      lastReadAt: progress ? new Date(progress.lastReadAt).toISOString() : null,
    },
  };

  await upsertOperation(operation);
  void flushSyncQueue();
};

export const enqueueUserSettingsSync = async (settings: {
  amoledDark: boolean;
  wifiOnlyDownloads: boolean;
  fontScale: number;
}) => {
  const operation: SyncOperation = {
    id: makeOperationId(),
    dedupeKey: 'user_settings:current',
    createdAt: Date.now(),
    type: 'upsert_user_settings',
    payload: {
      amoledDark: settings.amoledDark,
      wifiOnlyDownloads: settings.wifiOnlyDownloads,
      fontScale: settings.fontScale,
    },
  };

  await upsertOperation(operation);
  void flushSyncQueue();
};

export const enqueueUserBookDelete = async (bookId: string) => {
  const operation: SyncOperation = {
    id: makeOperationId(),
    dedupeKey: `user_book:${bookId}`,
    createdAt: Date.now(),
    type: 'delete_user_book',
    payload: {
      bookId,
    },
  };

  await upsertOperation(operation);
  void flushSyncQueue();
};

const applyOperation = async (operation: SyncOperation, userId: string) => {
  if (operation.type === 'upsert_book') {
    const { error } = await supabase.from('books').upsert(operation.payload, {
      onConflict: 'id',
    });

    if (error) {
      throw error;
    }

    return;
  }

  if (operation.type === 'upsert_user_book') {
    const localBook = await getBookById(operation.payload.bookId);
    const fallbackBookPayload = {
      id: operation.payload.bookId,
      title: localBook?.title || `Book ${operation.payload.bookId}`,
      author: localBook?.author || null,
      language: localBook?.metadata?.language || null,
      summary: localBook?.metadata?.summary || null,
      cover_url: localBook?.cover || null,
      source: localBook?.metadata?.sourceId ? 'gutendex' : 'local_import',
      source_updated_at: new Date().toISOString(),
    };

    const { error: bookEnsureError } = await supabase.from('books').upsert(fallbackBookPayload, {
      onConflict: 'id',
    });

    if (bookEnsureError) {
      throw new Error(
        `book upsert failed before user_books write (${bookEnsureError.code ?? 'unknown'}): ${bookEnsureError.message}`
      );
    }

    const { error } = await supabase.from('user_books').upsert(
      {
        user_id: userId,
        book_id: operation.payload.bookId,
        is_saved: operation.payload.isSaved,
        last_chapter_index: operation.payload.lastChapterIndex,
        last_chunk_index: operation.payload.lastChunkIndex,
        last_chapter_href: operation.payload.lastChapterHref,
        progress_percent: operation.payload.progressPercent,
        last_read_at: operation.payload.lastReadAt,
      },
      {
        onConflict: 'user_id,book_id',
      }
    );

    if (error) {
      throw new Error(`user_books upsert failed (${error.code ?? 'unknown'}): ${error.message}`);
    }

    return;
  }

  if (operation.type === 'delete_user_book') {
    const { error } = await supabase
      .from('user_books')
      .delete()
      .eq('user_id', userId)
      .eq('book_id', operation.payload.bookId);

    if (error) {
      throw new Error(`user_books delete failed (${error.code ?? 'unknown'}): ${error.message}`);
    }

    return;
  }

  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: userId,
      amoled_dark: operation.payload.amoledDark,
      wifi_only_downloads: operation.payload.wifiOnlyDownloads,
      font_scale: operation.payload.fontScale,
    },
    {
      onConflict: 'user_id',
    }
  );

  if (error) {
    throw error;
  }
};

export const flushSyncQueue = async () => {
  if (activeFlushPromise) {
    return activeFlushPromise;
  }

  activeFlushPromise = (async () => {
    if (!isSupabaseConfigured) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return;
    }

    const userId = session.user.id;
    const queue = await readQueue();
    if (queue.length === 0) {
      return;
    }

    const remaining: SyncOperation[] = [];

    for (const operation of queue) {
      try {
        await applyOperation(operation, userId);
      } catch (error) {
        console.warn('Sync operation failed, will retry later:', {
          type: operation.type,
          dedupeKey: operation.dedupeKey,
          error,
        });
        remaining.push(operation);
      }
    }

    await writeQueue(remaining);
  })();

  try {
    await activeFlushPromise;
  } finally {
    activeFlushPromise = null;
  }
};

const getSessionUserId = async (): Promise<string | null> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user?.id ?? null;
};

export const pullUserSettingsFromSupabase = async (): Promise<RemoteUserSettings | null> => {
  if (!isSupabaseConfigured) {
    return null;
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from('user_settings')
    .select('amoled_dark,wifi_only_downloads,font_scale')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Failed to pull user settings from Supabase:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    amoledDark: Boolean(data.amoled_dark),
    wifiOnlyDownloads: Boolean(data.wifi_only_downloads),
    fontScale: typeof data.font_scale === 'number' ? data.font_scale : 1,
  };
};

export const pullUserBooksProgressForLocalCatalog = async (bookIds: string[]) => {
  if (!isSupabaseConfigured || bookIds.length === 0) {
    return;
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return;
  }

  const { data, error } = await supabase
    .from('user_books')
    .select('book_id,last_chapter_index,last_chunk_index,last_chapter_href,last_read_at')
    .eq('user_id', userId)
    .in('book_id', bookIds);

  if (error || !data) {
    if (error) {
      console.warn('Failed to pull user books progress from Supabase:', error);
    }
    return;
  }

  for (const row of data) {
    const local = await getBookById(row.book_id);
    if (!local) {
      continue;
    }

    const remoteLastReadAt = row.last_read_at ? Date.parse(row.last_read_at) : NaN;
    if (!Number.isFinite(remoteLastReadAt)) {
      continue;
    }

    const localLastReadAt = local.readingProgress?.lastReadAt ?? 0;
    if (localLastReadAt >= remoteLastReadAt) {
      continue;
    }

    await saveBookReadingProgress(
      row.book_id,
      {
        lastChapterIndex: row.last_chapter_index ?? 0,
        lastChunkIndex: row.last_chunk_index ?? 0,
        lastChapterHref: row.last_chapter_href ?? null,
        lastReadAt: remoteLastReadAt,
      },
      {
        skipSyncEnqueue: true,
      }
    );
  }
};

export const pullUserBookProgressForBook = async (bookId: string) => {
  if (!isSupabaseConfigured || !bookId) {
    return;
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return;
  }

  const { data, error } = await supabase
    .from('user_books')
    .select('book_id,last_chapter_index,last_chunk_index,last_chapter_href,last_read_at')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.warn('Failed to pull reader progress for book from Supabase:', error);
    }
    return;
  }

  const local = await getBookById(data.book_id);
  if (!local) {
    return;
  }

  const remoteLastReadAt = data.last_read_at ? Date.parse(data.last_read_at) : NaN;
  if (!Number.isFinite(remoteLastReadAt)) {
    return;
  }

  const localLastReadAt = local.readingProgress?.lastReadAt ?? 0;
  if (localLastReadAt >= remoteLastReadAt) {
    return;
  }

  await saveBookReadingProgress(
    data.book_id,
    {
      lastChapterIndex: data.last_chapter_index ?? 0,
      lastChunkIndex: data.last_chunk_index ?? 0,
      lastChapterHref: data.last_chapter_href ?? null,
      lastReadAt: remoteLastReadAt,
    },
    {
      skipSyncEnqueue: true,
    }
  );
};

export const reconcileFromSupabase = async (bookIds: string[]) => {
  if (activePullPromise) {
    return activePullPromise;
  }

  activePullPromise = (async () => {
    await flushSyncQueue();
    await pullUserBooksProgressForLocalCatalog(bookIds);
  })();

  try {
    await activePullPromise;
  } finally {
    activePullPromise = null;
  }
};
