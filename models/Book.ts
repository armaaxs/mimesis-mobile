export interface BookChapterDTO {
  id: string;
  href: string;
  title?: string;
  html: string;
  plainText: string;
}

export interface BookMetadataDTO {
  summary: string | null;
  downloadCount: number | null;
  language: string | null;
  subjects: string[];
  sourceId: number | null;
}

export interface BookReadingProgressDTO {
  lastChapterIndex: number;
  lastChunkIndex: number;
  lastChapterHref: string | null;
  lastReadAt: number;
}

export interface BookDTO {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  uri: string;
  basePath: string;
  chapters: BookChapterDTO[];
  metadata: BookMetadataDTO | null;
  readingProgress: BookReadingProgressDTO | null;
  createdAt: number;
}

export interface LibraryBookItem {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  uri: string;
  metadata?: BookMetadataDTO | null;
  readingProgress?: BookReadingProgressDTO | null;
}

interface CreateBookInput {
  title: string;
  author: string;
  cover: string | null;
  uri: string;
  basePath: string;
  chapters: BookChapterDTO[];
  metadata?: BookMetadataDTO | null;
  readingProgress?: BookReadingProgressDTO | null;
}

export class Book {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly cover: string | null;
  readonly uri: string;
  readonly basePath: string;
  readonly chapters: BookChapterDTO[];
  readonly metadata: BookMetadataDTO | null;
  readonly readingProgress: BookReadingProgressDTO | null;
  readonly createdAt: number;

  constructor(dto: BookDTO) {
    this.id = dto.id;
    this.title = dto.title;
    this.author = dto.author;
    this.cover = dto.cover;
    this.uri = dto.uri;
    this.basePath = dto.basePath;
    this.chapters = dto.chapters;
    this.metadata = dto.metadata ?? null;
    this.readingProgress = dto.readingProgress ?? null;
    this.createdAt = dto.createdAt;
  }

  static fromImport(input: CreateBookInput): Book {
    const now = Date.now();
    const random = Math.random().toString(36).slice(2, 10);

    return new Book({
      id: `book_${now}_${random}`,
      title: input.title,
      author: input.author,
      cover: input.cover,
      uri: input.uri,
      basePath: input.basePath,
      chapters: input.chapters,
      metadata: input.metadata ?? null,
      readingProgress: input.readingProgress ?? null,
      createdAt: now,
    });
  }

  static fromDTO(dto: BookDTO): Book {
    return new Book(dto);
  }

  toDTO(): BookDTO {
    return {
      id: this.id,
      title: this.title,
      author: this.author,
      cover: this.cover,
      uri: this.uri,
      basePath: this.basePath,
      chapters: this.chapters,
      metadata: this.metadata,
      readingProgress: this.readingProgress,
      createdAt: this.createdAt,
    };
  }

  toLibraryItem(): LibraryBookItem {
    return {
      id: this.id,
      title: this.title,
      author: this.author,
      cover: this.cover,
      uri: this.uri,
      metadata: this.metadata,
      readingProgress: this.readingProgress,
    };
  }
}
