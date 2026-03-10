import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Buffer } from 'buffer';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { Book, LibraryBookItem, BookDTO, BookMetadataDTO, BookReadingProgressDTO } from '@/models/Book';
import { AppPalette } from '@/constants/theme';
import { getBookByUri, saveBook, getBookById } from '@/utils/bookRepository';
import { extractEpubImportPayload } from '@/utils/epubparser';
import { getTransientDto, setTransientDto, deleteTransientDto } from '@/utils/transientDtoMap';

// Types based on your JSON
type Author = { name: string; birth_year: number; death_year: number };
type BookData = {
  id: number;
  title: string;
  authors: Author[];
  summaries: string[];
  subjects: string[];
  languages: string[];
  formats: Record<string, string>;
  download_count: number;
};

const { width } = Dimensions.get('window');

export default function BookDetailScreen() {
  const params = useLocalSearchParams<{ book?: string | string[] }>();
  const router = useRouter();

  // Normalize book param (expo-router passes search params)
  const rawBook = Array.isArray(params.book) ? params.book[0] : params.book;
  const routeBookId = (params as any).bookId as string | undefined;
  const rawRouteMetadata = Array.isArray((params as any).metadata)
    ? (params as any).metadata[0]
    : ((params as any).metadata as string | undefined);
  const rawRouteProgress = Array.isArray((params as any).progress)
    ? (params as any).progress[0]
    : ((params as any).progress as string | undefined);

  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isPreparingBook, setIsPreparingBook] = useState(false);
  const [preparedLibraryBook, setPreparedLibraryBook] = useState<LibraryBookItem | null>(null);
  const [bookDTO, setBookDTO] = useState<BookDTO | null>(null);
  const [gutendexBook, setGutendexBook] = useState<BookData | null>(null);

  const routeMetadata = useMemo<BookMetadataDTO | null>(() => {
    if (!rawRouteMetadata) return null;
    try {
      return JSON.parse(rawRouteMetadata) as BookMetadataDTO;
    } catch {
      return null;
    }
  }, [rawRouteMetadata]);

  const routeProgress = useMemo<BookReadingProgressDTO | null>(() => {
    if (!rawRouteProgress) return null;
    try {
      return JSON.parse(rawRouteProgress) as BookReadingProgressDTO;
    } catch {
      return null;
    }
  }, [rawRouteProgress]);

  useEffect(() => {
    // Normalize incoming params: rawBook may be a Gutendex JSON string, routeBookId may reference a transient or persisted book
    if (rawBook) {
      try {
        const parsed = JSON.parse(rawBook) as BookData;
        setGutendexBook(parsed);
        setBookDTO(null);
        setPreparedLibraryBook(null);
      } catch (e) {
        console.warn('Failed to parse book route param', e);
      }
    } else if (routeBookId) {
      setGutendexBook(null);
      // check transient DTO map first
      const transient = getTransientDto<BookDTO>(routeBookId);
      if (transient) {
        setBookDTO(transient);
        setPreparedLibraryBook({
          id: transient.id,
          title: transient.title,
          author: transient.author,
          cover: transient.cover,
          uri: transient.uri,
          metadata: transient.metadata,
          readingProgress: transient.readingProgress,
        });
      } else {
        // try persisted storage
        (async () => {
          const persisted = await getBookById(routeBookId);
          if (persisted) {
            const dto = persisted.toDTO();
            setBookDTO(dto);
            setPreparedLibraryBook(persisted.toLibraryItem());
          }
        })();
      }
    }
  }, [rawBook, routeBookId]);

  const displayAuthor = useMemo(() => {
    if (gutendexBook) {
      const rawAuthor = gutendexBook.authors[0]?.name || 'Unknown Author';
      return rawAuthor.includes(',') ? rawAuthor.split(',').reverse().join(' ').trim() : rawAuthor;
    }
    if (bookDTO) return bookDTO.author || 'Unknown Author';
    return 'Unknown Author';
  }, [gutendexBook, bookDTO]);

  const epubUrl = useMemo(() => {
    if (gutendexBook) {
      return gutendexBook.formats['application/epub+zip'] || gutendexBook.formats['application/octet-stream'] || null;
    }
    return null;
  }, [gutendexBook]);

  const hasBookData = Boolean(gutendexBook || bookDTO);

  // --- Data Cleaning ---
  const coverUrl = (gutendexBook && gutendexBook.formats['image/jpeg']) || bookDTO?.cover || null;
  const displayTitle = gutendexBook?.title || bookDTO?.title || 'Unknown Title';
  const displayDownloadCount = gutendexBook?.download_count ?? bookDTO?.metadata?.downloadCount ?? routeMetadata?.downloadCount ?? 0;
  const displayLanguage = gutendexBook?.languages?.[0]?.toUpperCase() || bookDTO?.metadata?.language?.toUpperCase() || routeMetadata?.language?.toUpperCase() || 'N/A';

  // Clean up the Gutenberg auto-generated text warning
  const cleanSummary = (() => {
    const dtoSummary = bookDTO?.chapters?.[0]?.plainText?.slice(0, 300) || '';
    return (gutendexBook?.summaries?.[0] || bookDTO?.metadata?.summary || routeMetadata?.summary || dtoSummary || '')
      .replace(/\(This is an automatically generated summary\.\)/g, '')
      .trim() || 'No summary available for this title.';
  })();

  const formatNumber = (num: number) => num.toLocaleString('en-US');
  
  // Take only the first 4 subjects for a clean UI
  const displayTags: string[] = (gutendexBook?.subjects || bookDTO?.metadata?.subjects || routeMetadata?.subjects || [])
    .slice(0, 4)
    .map((sub: string) => sub.split(' -- ')[0]);

  const ensureBookPrepared = useCallback(async (): Promise<LibraryBookItem | null> => {
    if (preparedLibraryBook) return preparedLibraryBook;

    // If we already have a persisted DTO, use it
    if (bookDTO) {
      const persisted = await getBookById(bookDTO.id);
      if (persisted) {
        setPreparedLibraryBook(persisted.toLibraryItem());
        return persisted.toLibraryItem();
      }
      // not persisted yet — prepare transiently
      const lib = {
        id: bookDTO.id,
        title: bookDTO.title,
        author: bookDTO.author,
        cover: bookDTO.cover,
        uri: bookDTO.uri,
        metadata: bookDTO.metadata,
        readingProgress: bookDTO.readingProgress,
      };
      setPreparedLibraryBook(lib);
      return lib;
    }

    if (!epubUrl || !gutendexBook) {
      console.warn('[BookDescription] No EPUB URL available for this book');
      return null;
    }

    const storeDirectory = new Directory(Paths.document, 'mimesis-books');
    if (!storeDirectory.exists) {
      storeDirectory.create({ intermediates: true, idempotent: true });
    }

    const safeId = String(gutendexBook.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const destinationFile = new File(storeDirectory, `gutendex-${safeId}.epub`);
    const localUri = destinationFile.uri;

    const existing = await getBookByUri(localUri);
    if (existing) {
      setPreparedLibraryBook(existing.toLibraryItem());
      setIsSaved(true);
      return existing.toLibraryItem();
    }

    if (!destinationFile.exists) {
      const response = await fetch(epubUrl);
      if (!response.ok) {
        throw new Error(`EPUB download failed (${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      destinationFile.create({ intermediates: true, overwrite: true });
      destinationFile.write(base64, { encoding: 'base64' });
    }

    const base64Data = await destinationFile.base64();
    const loadedZip = await JSZip.loadAsync(base64Data, { base64: true });
    const importedPayload = await extractEpubImportPayload(loadedZip);

    const importedBook = Book.fromImport({
      title: importedPayload.title || gutendexBook.title,
      author: importedPayload.author || displayAuthor,
      cover: importedPayload.cover || coverUrl || null,
      uri: localUri,
      basePath: importedPayload.basePath,
      chapters: importedPayload.chapters,
      metadata: {
        summary: gutendexBook.summaries?.[0] || null,
        downloadCount: gutendexBook.download_count ?? null,
        language: gutendexBook.languages?.[0] || null,
        subjects: gutendexBook.subjects || [],
        sourceId: gutendexBook.id,
      },
    });

    // Do not persist here; store DTO transiently and present prepared library item
    setTransientDto(importedBook.id, importedBook.toDTO());
    const libraryBook = importedBook.toLibraryItem();
    setBookDTO(importedBook.toDTO());
    setPreparedLibraryBook(libraryBook);
    return libraryBook;
  }, [bookDTO, epubUrl, gutendexBook, preparedLibraryBook, displayAuthor, coverUrl]);

  // Removed automatic prepare-on-mount. Book will only be prepared when
  // the user taps Save (bookmark) or Read Now.

  const handleSave = useCallback(async () => {
    try {
      setIsPreparingBook(true);
      const libraryBook = preparedLibraryBook ?? (await ensureBookPrepared());
      if (!libraryBook) return;

      let bookInstance: Book | null = null;
      if (bookDTO) {
        bookInstance = Book.fromDTO(bookDTO);
      } else {
        const transient = getTransientDto<BookDTO>(libraryBook.id);
        if (transient) bookInstance = Book.fromDTO(transient);
        else {
          const persisted = await getBookById(libraryBook.id);
          if (persisted) bookInstance = persisted;
        }
      }

      if (bookInstance) {
        await saveBook(bookInstance);
        // persisted — reflect saved state
        setPreparedLibraryBook(bookInstance.toLibraryItem());
        setBookDTO(bookInstance.toDTO());
        deleteTransientDto(bookInstance.id);
      }
    } catch (error) {
      console.warn('[BookDescription] Save failed:', error);
    } finally {
      setIsPreparingBook(false);
    }
  }, [ensureBookPrepared, preparedLibraryBook, bookDTO]);

  const handleReadNow = useCallback(async () => {
    try {
      setIsPreparingBook(true);
      const libraryBook = preparedLibraryBook ?? (await ensureBookPrepared());
      if (!libraryBook) return;

      let bookInstance: Book | null = null;
      if (bookDTO) {
        bookInstance = Book.fromDTO(bookDTO);
      } else {
        const transient = getTransientDto<BookDTO>(libraryBook.id);
        if (transient) bookInstance = Book.fromDTO(transient);
        else {
          const persisted = await getBookById(libraryBook.id);
          if (persisted) bookInstance = persisted;
        }
      }

      if (bookInstance) {
        await saveBook(bookInstance);
        deleteTransientDto(bookInstance.id);
      }

      const resumeProgress =
        bookInstance?.readingProgress ||
        bookDTO?.readingProgress ||
        routeProgress ||
        null;

      router.push({
        pathname: '/reader',
        params: {
          id: libraryBook.id,
          title: libraryBook.title,
          author: libraryBook.author,
          cover: libraryBook.cover || undefined,
          uri: libraryBook.uri,
          resumeChapterIndex:
            resumeProgress && Number.isFinite(resumeProgress.lastChapterIndex)
              ? String(resumeProgress.lastChapterIndex)
              : undefined,
          resumeChunkIndex:
            resumeProgress && Number.isFinite(resumeProgress.lastChunkIndex)
              ? String(resumeProgress.lastChunkIndex)
              : undefined,
          resumeChapterHref: resumeProgress?.lastChapterHref || undefined,
        },
      });
    } catch (error) {
      console.warn('[BookDescription] Read now failed:', error);
    } finally {
      setIsPreparingBook(false);
    }
  }, [ensureBookPrepared, preparedLibraryBook, bookDTO, routeProgress, router]);

  const hasResumeProgress = useMemo(() => {
    const progress = bookDTO?.readingProgress || routeProgress || null;
    if (!progress) return false;
    return progress.lastChapterIndex >= 0 && progress.lastChunkIndex >= 0;
  }, [bookDTO?.readingProgress, routeProgress]);

  if (!hasBookData) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={{ padding: 20 }}>
          <Text style={{ color: AppPalette.text }}>No book data provided.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" />
      
      {/* Top Navigation */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={AppPalette.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.iconButton}
          disabled={isPreparingBook}
        >
          <Ionicons
            name={preparedLibraryBook ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={AppPalette.text}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Hero Section: Cover, Title, Author */}
        <View style={styles.heroSection}>
          <View style={styles.heroBackdrop}>
            <View style={[styles.heroBackdropBook, styles.heroBackdropBookLeft]} />
            <View style={[styles.heroBackdropBook, styles.heroBackdropBookRight]} />
            <View style={styles.heroBackdropSeal}>
              <Ionicons name="bookmarks-outline" size={16} color={AppPalette.surface} />
            </View>
          </View>
          <View style={styles.coverShadow}>
            <Image source={{ uri: coverUrl || undefined }} style={styles.coverImage} />
          </View>
          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.author}>{displayAuthor}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatNumber(displayDownloadCount)}</Text>
            <Text style={styles.statLabel}>Downloads</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{displayLanguage}</Text>
            <Text style={styles.statLabel}>Language</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>Text</Text>
            <Text style={styles.statLabel}>Format</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleReadNow} disabled={isPreparingBook}>
            {isPreparingBook ? (
              <ActivityIndicator color={AppPalette.surface} />
            ) : (
              <>
                <Ionicons name="book" size={20} color={AppPalette.surface} style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>{hasResumeProgress ? 'Continue Reading' : 'Read Now'}</Text>
              </>
            )}
          </TouchableOpacity>
          {/* <TouchableOpacity style={styles.secondaryButton}>
            <Ionicons name="download-outline" size={24} color="#FFF" />
          </TouchableOpacity> */}
        </View>

        {/* Synopsis Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synopsis</Text>
          <Text 
            style={styles.summaryText} 
            numberOfLines={isSummaryExpanded ? undefined : 4}
          >
            {cleanSummary}
          </Text>
          <TouchableOpacity onPress={() => setIsSummaryExpanded(!isSummaryExpanded)}>
            <Text style={styles.readMoreText}>
              {isSummaryExpanded ? 'Show Less' : 'Read More'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tags / Subjects */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Genres & Tags</Text>
          <View style={styles.tagsContainer}>
            {displayTags.map((tag: string, index: number) => (
              <View key={index} style={styles.tagBadge}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppPalette.background,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppPalette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
  },
  scrollContent: {
    paddingBottom: 56,
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 10,
  },
  heroBackdrop: {
    position: 'absolute',
    top: 10,
    width: '100%',
    height: 188,
    alignItems: 'center',
  },
  heroBackdropBook: {
    position: 'absolute',
    top: 24,
    width: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.18)',
  },
  heroBackdropBookLeft: {
    left: 36,
    height: 120,
    backgroundColor: AppPalette.accentSoft,
  },
  heroBackdropBookRight: {
    right: 36,
    height: 108,
    backgroundColor: AppPalette.backgroundMuted,
  },
  heroBackdropSeal: {
    position: 'absolute',
    top: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: AppPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverShadow: {
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
    marginBottom: 24,
  },
  coverImage: {
    width: width * 0.55,
    height: (width * 0.55) * 1.5, // Standard book aspect ratio
    borderRadius: 18,
    backgroundColor: AppPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
  },
  title: {
    color: AppPalette.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  author: {
    color: AppPalette.accent,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
    marginHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: AppPalette.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: AppPalette.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    color: AppPalette.textSubtle,
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: AppPalette.border,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 30,
    gap: 12, // Requires RN 0.71+
  },
  primaryButton: {
    flex: 1,
    backgroundColor: AppPalette.accent,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
  },
  primaryButtonText: {
    color: AppPalette.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    width: 54,
    height: 54,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: 30,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: AppPalette.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryText: {
    color: AppPalette.textMuted,
    fontSize: 15,
    lineHeight: 24,
  },
  readMoreText: {
    color: AppPalette.accent,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tagBadge: {
    backgroundColor: AppPalette.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
  },
  tagText: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: '500',
  },
});
