export interface BookChapterDTO {
  id: string;
  href: string;
  title?: string;
  html: string;
  plainText: string;
}

export interface BookDTO {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  uri: string;
  basePath: string;
  chapters: BookChapterDTO[];
  createdAt: number;
}

export interface LibraryBookItem {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  uri: string;
}

interface CreateBookInput {
  title: string;
  author: string;
  cover: string | null;
  uri: string;
  basePath: string;
  chapters: BookChapterDTO[];
}

export class Book {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly cover: string | null;
  readonly uri: string;
  readonly basePath: string;
  readonly chapters: BookChapterDTO[];
  readonly createdAt: number;

  constructor(dto: BookDTO) {
    this.id = dto.id;
    this.title = dto.title;
    this.author = dto.author;
    this.cover = dto.cover;
    this.uri = dto.uri;
    this.basePath = dto.basePath;
    this.chapters = dto.chapters;
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
    };
  }
}
