import { Book, BookDTO, BookReadingProgressDTO, LibraryBookItem } from '@/models/Book';
import { enqueueBookSync, enqueueUserBookDelete, enqueueUserBookSync } from '@/services/syncService';
import { Directory, File, Paths } from 'expo-file-system';

const STORE_DIR_NAME = 'mimesis-books';
const CATALOG_FILE_NAME = 'catalog.json';

interface BookCatalogItem extends LibraryBookItem {
  createdAt: number;
}

const storeDirectory = new Directory(Paths.document, STORE_DIR_NAME);
const catalogFile = new File(storeDirectory, CATALOG_FILE_NAME);

const ensureStore = () => {
  if (!storeDirectory.exists) {
    storeDirectory.create({ intermediates: true, idempotent: true });
  }
};

const getBookFile = (bookId: string) => new File(storeDirectory, `${bookId}.json`);

const readJSON = async <T>(file: File, fallback: T): Promise<T> => {
  if (!file.exists) {
    return fallback;
  }

  try {
    const content = await file.text();
    if (!content.trim()) {
      return fallback;
    }

    return JSON.parse(content) as T;
  } catch (error) {
    console.warn('Failed to parse persisted JSON:', error);
    return fallback;
  }
};

const writeJSON = (file: File, data: unknown) => {
  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }

  file.write(JSON.stringify(data), { encoding: 'utf8' });
};

const sortCatalog = (catalog: BookCatalogItem[]) =>
  [...catalog].sort((a, b) => b.createdAt - a.createdAt);

export const saveBook = async (
  book: Book,
  options?: {
    skipSyncEnqueue?: boolean;
  },
): Promise<void> => {
  ensureStore();

  const dto = book.toDTO();
  const bookFile = getBookFile(book.id);
  writeJSON(bookFile, dto);

  const currentCatalog = await readJSON<BookCatalogItem[]>(catalogFile, []);
  const nextCatalog = sortCatalog([
    ...currentCatalog.filter((item) => item.id !== book.id),
    {
      id: book.id,
      title: book.title,
      author: book.author,
      cover: book.cover,
      uri: book.uri,
      metadata: book.metadata,
      readingProgress: book.readingProgress,
      createdAt: book.createdAt,
    },
  ]);

  writeJSON(catalogFile, nextCatalog);

  if (!options?.skipSyncEnqueue) {
    try {
      await enqueueBookSync(dto);
      await enqueueUserBookSync({
        bookId: dto.id,
        progress: dto.readingProgress,
        isSaved: true,
      });
    } catch (error) {
      console.warn('Failed to enqueue book sync operation:', error);
    }
  }
};

export const getBookById = async (bookId: string): Promise<Book | null> => {
  ensureStore();

  const bookFile = getBookFile(bookId);
  if (!bookFile.exists) {
    return null;
  }

  const dto = await readJSON<BookDTO | null>(bookFile, null);
  if (!dto) {
    return null;
  }

  return Book.fromDTO({
    ...dto,
    metadata: dto.metadata ?? null,
    readingProgress: dto.readingProgress ?? null,
  });
};

export const saveBookReadingProgress = async (
  bookId: string,
  progress: BookReadingProgressDTO,
  options?: {
    skipSyncEnqueue?: boolean;
  },
): Promise<void> => {
  ensureStore();

  const bookFile = getBookFile(bookId);
  if (!bookFile.exists) {
    return;
  }

  const dto = await readJSON<BookDTO | null>(bookFile, null);
  if (!dto) {
    return;
  }

  const nextDto: BookDTO = {
    ...dto,
    metadata: dto.metadata ?? null,
    readingProgress: progress,
  };
  writeJSON(bookFile, nextDto);

  const currentCatalog = await readJSON<BookCatalogItem[]>(catalogFile, []);
  const existing = currentCatalog.find((item) => item.id === bookId);
  const nextCatalog = sortCatalog([
    ...currentCatalog.filter((item) => item.id !== bookId),
    {
      id: bookId,
      title: existing?.title ?? nextDto.title,
      author: existing?.author ?? nextDto.author,
      cover: existing?.cover ?? nextDto.cover,
      uri: existing?.uri ?? nextDto.uri,
      metadata: existing?.metadata ?? nextDto.metadata,
      readingProgress: progress,
      createdAt: existing?.createdAt ?? nextDto.createdAt,
    },
  ]);

  writeJSON(catalogFile, nextCatalog);

  if (!options?.skipSyncEnqueue) {
    try {
      await enqueueUserBookSync({
        bookId,
        progress,
        isSaved: true,
      });
    } catch (error) {
      console.warn('Failed to enqueue progress sync operation:', error);
    }
  }
};

export const getBookByUri = async (uri: string): Promise<Book | null> => {
  const catalog = await listBookCatalog();
  const found = catalog.find((item) => item.uri === uri);

  if (!found) {
    return null;
  }

  return getBookById(found.id);
};

export const listBookCatalog = async (): Promise<LibraryBookItem[]> => {
  ensureStore();

  const catalog = await readJSON<BookCatalogItem[]>(catalogFile, []);
  return sortCatalog(catalog).map((item) => ({
    id: item.id,
    title: item.title,
    author: item.author,
    cover: item.cover,
    uri: item.uri,
    metadata: item.metadata,
    readingProgress: item.readingProgress ?? null,
  }));
};

export const deleteBook = async (
  bookId: string,
  options?: {
    skipSyncEnqueue?: boolean;
  }
): Promise<void> => {
  ensureStore();

  const bookFile = getBookFile(bookId);
  if (bookFile.exists) {
    bookFile.delete();
  }

  const currentCatalog = await readJSON<BookCatalogItem[]>(catalogFile, []);
  const nextCatalog = currentCatalog.filter((item) => item.id !== bookId);
  writeJSON(catalogFile, nextCatalog);

  if (!options?.skipSyncEnqueue) {
    try {
      await enqueueUserBookDelete(bookId);
    } catch (error) {
      console.warn('Failed to enqueue user_books delete operation:', error);
    }
  }
};

export const clearLocalLibrary = async (): Promise<void> => {
  if (storeDirectory.exists) {
    storeDirectory.delete();
  }
};
