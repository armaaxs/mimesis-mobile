import ChunkSeeker from '@/components/ChunkSeeker.component';
import DownloadOverlay from '@/components/DownloadOverlay.component';
import { useTTSQueuePlayer } from '@/hooks/use-tts-queue-player';
import { Book, BookReadingProgressDTO } from '@/models/Book';
import { pullUserBookProgressForBook } from '@/services/syncService';
import { getBookById, getBookByUri, saveBookReadingProgress } from '@/utils/bookRepository';
import { extractRawText } from '@/utils/extractRawText';
import { htmlToStyledBlocks } from '@/utils/htmlToStyledBlocks';
import { getChapterText, parseEpub } from '@/utils/epubparser';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet'; // New Import
import { File } from 'expo-file-system';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import JSZip from 'jszip';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'; // Added useRef
import { ActivityIndicator, Animated, Image, NativeSyntheticEvent, NativeScrollEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // New Import
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ChapterIndex from './bookIndex'; // Importing the ChapterIndex component

type ReaderChapter = {
  href: string;
  title?: string;
  html?: string;
  plainText?: string;
};

const READER_DOCK_BASE_HEIGHT = 150;
const READER_DOCK_GAP = 1;

const isSkippableChapter = (chapter: ReaderChapter): boolean => {
  const normalizedTitle = (chapter.title || '')
    .toLowerCase()
    .replace(/["'“”‘’]/g, '')
    .trim();
  const normalizedHref = (chapter.href || '').toLowerCase();

  return (
    normalizedTitle === 'cover' ||
    normalizedTitle === 'book cover' ||
    normalizedTitle === 'front cover' ||
    normalizedHref.includes('cover.xhtml') ||
    normalizedHref.includes('cover.html') ||
    normalizedHref.endsWith('/cover')
  );
};

const buildFallbackChapterTitle = (chapter: ReaderChapter, index: number): string => {
  const trimmedTitle = chapter.title?.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  const candidateText = (chapter.plainText || extractRawText(chapter.html || ''))
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (candidateText) {
    return candidateText.slice(0, 90);
  }

  const hrefName = chapter.href
    ?.split('/')
    .pop()
    ?.replace(/\.[^.]+$/, '')
    ?.replace(/[-_]+/g, ' ')
    ?.trim();

  if (hrefName) {
    return hrefName;
  }

  return `Chapter ${index + 1}`;
};



export default function Reader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ 
    title?: string; 
    id?: string; 
    author?: string; 
    cover?: string; 
    uri?: string;
    resumeChapterIndex?: string | string[];
    resumeChunkIndex?: string | string[];
    resumeChapterHref?: string | string[];
  }>();

  console.log('[Reader] params received:', JSON.stringify(params, null, 2));

  const [bookData, setBookData] = useState<any>(null);
  const [persistedBook, setPersistedBook] = useState<Book | null>(null);
  const [hasResolvedPersistedBook, setHasResolvedPersistedBook] = useState(false);
  const [currentChapterNo, setCurrentChapterNo] = useState(0);
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [currentHtml, setCurrentHtml] = useState<string>('');
  const [isTextMode, setIsTextMode] = useState(false);
  const modeProgress = useRef(new Animated.Value(0)).current;
  const chapterScrollRef = useRef<ScrollView>(null);
  const chunkLayoutMapRef = useRef<Record<number, { y: number; height: number }>>({});
  const scrollMetricsRef = useRef({ yOffset: 0, viewportHeight: 0, contentHeight: 0 });
  const pendingAutoScrollChunkRef = useRef<number | null>(null);
  const [isResumeBootstrapDone, setIsResumeBootstrapDone] = useState(false);
  const progressPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSleepMenuOpen, setIsSleepMenuOpen] = useState(false);
  const [sleepTimerRemainingMs, setSleepTimerRemainingMs] = useState<number | null>(null);

  // Bottom Sheet Ref and Snap Points
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['1%', '80%'], []);

  const parseParamNumber = useCallback((value?: string | string[]) => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, []);

  const parseParamString = useCallback((value?: string | string[]) => {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw || null;
  }, []);

  const routeResumeChapterIndex = useMemo(() => parseParamNumber(params.resumeChapterIndex), [params.resumeChapterIndex, parseParamNumber]);
  const routeResumeChunkIndex = useMemo(() => parseParamNumber(params.resumeChunkIndex), [params.resumeChunkIndex, parseParamNumber]);
  const routeResumeChapterHref = useMemo(() => parseParamString(params.resumeChapterHref), [params.resumeChapterHref, parseParamString]);

  useEffect(() => {
    return () => console.log('Reader component destroyed');
  }, []);

  useEffect(() => {
    Animated.spring(modeProgress, {
      toValue: isTextMode ? 1 : 0,
      damping: 18,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [isTextMode, modeProgress]);

  useEffect(() => {
    let active = true;

    const hydratePersistedBook = async () => {
      if (!params.id && !params.uri) {
        if (active) {
          setHasResolvedPersistedBook(true);
        }
        return;
      }

      try {
        let savedBook: Book | null = null;

        if (params.id) {
          savedBook = await getBookById(params.id);
        }

        if (!savedBook && params.uri) {
          savedBook = await getBookByUri(params.uri);
        }

        if (active) {
          setPersistedBook(savedBook);
        }

        if (savedBook?.id) {
          void (async () => {
            await pullUserBookProgressForBook(savedBook!.id);
            const refreshedBook = await getBookById(savedBook!.id);
            if (!active || !refreshedBook) {
              return;
            }

            setPersistedBook((previous) => {
              if (!previous || previous.id !== refreshedBook.id) {
                return previous;
              }

              const previousReadAt = previous.readingProgress?.lastReadAt ?? 0;
              const refreshedReadAt = refreshedBook.readingProgress?.lastReadAt ?? 0;
              return refreshedReadAt > previousReadAt ? refreshedBook : previous;
            });
          })();
        }
      } catch (error) {
        console.warn('Reader persisted book lookup failed:', error);
      } finally {
        if (active) {
          setHasResolvedPersistedBook(true);
        }
      }
    };

    void hydratePersistedBook();

    return () => {
      active = false;
    };
  }, [params.id, params.uri]);

  const loadBook = useCallback(async () => {
    if (!hasResolvedPersistedBook || persistedBook || !params.uri) {
      return;
    }

    if (params.uri) {
      try {
        const file = new File(params.uri);
        const base64Data = await file.base64();
        const loadedZip = await JSZip.loadAsync(base64Data, { base64: true });
        setZipInstance(loadedZip); 
        const structuredBook = await parseEpub(loadedZip);
        setBookData(structuredBook);
      } catch (err) {
        console.error("Failed to parse in Reader:", err);
      }
    }
  }, [hasResolvedPersistedBook, params.uri, persistedBook]);

  useEffect(() => {
    void loadBook();
  }, [loadBook]);

  const isApiFetchedBook = useMemo(() => {
    const persistedUri = (persistedBook?.uri || '').toLowerCase();
    const routeUri = (params.uri || '').toLowerCase();

    return (
      persistedUri.includes('gutendex-') ||
      routeUri.includes('gutendex-') ||
      routeUri.includes('gutenberg.org')
    );
  }, [params.uri, persistedBook?.uri]);

  const menuChapters = useMemo(() => {
    const sourceChapters = (persistedBook?.chapters || bookData?.chapters || []) as ReaderChapter[];

    const normalized = sourceChapters.map((chapter, index) => ({
      ...chapter,
      title: buildFallbackChapterTitle(chapter, index),
    }));

    const withoutCover = normalized.filter((chapter) => !isSkippableChapter(chapter));
    return isApiFetchedBook ? withoutCover.slice(1) : withoutCover;
  }, [bookData?.chapters, isApiFetchedBook, persistedBook?.chapters]);

  const resolvedResumeProgress = useMemo<BookReadingProgressDTO | null>(() => {
    if (persistedBook?.readingProgress) {
      return persistedBook.readingProgress;
    }

    if (routeResumeChapterIndex === null && routeResumeChunkIndex === null && !routeResumeChapterHref) {
      return null;
    }

    return {
      lastChapterIndex: Math.max(0, routeResumeChapterIndex ?? 0),
      lastChunkIndex: Math.max(0, routeResumeChunkIndex ?? 0),
      lastChapterHref: routeResumeChapterHref,
      lastReadAt: Date.now(),
    };
  }, [persistedBook?.readingProgress, routeResumeChapterIndex, routeResumeChunkIndex, routeResumeChapterHref]);

  const initialResumeAppliedRef = useRef(false);
  const initialResumeChunkAppliedRef = useRef(false);
  const resumeTargetChapterRef = useRef<number>(0);
  const progressWriteInFlightRef = useRef(false);
  const pendingProgressRef = useRef<BookReadingProgressDTO | null>(null);

  const flushPendingProgress = useCallback(async () => {
    const bookId = persistedBook?.id;
    if (!bookId || !pendingProgressRef.current || progressWriteInFlightRef.current) {
      return;
    }

    progressWriteInFlightRef.current = true;

    try {
      const nextProgress = pendingProgressRef.current;
      pendingProgressRef.current = null;

      await saveBookReadingProgress(bookId, nextProgress);
    } catch (error) {
      console.warn('Failed to persist reading progress:', error);
    } finally {
      progressWriteInFlightRef.current = false;
      if (pendingProgressRef.current) {
        void flushPendingProgress();
      }
    }
  }, [persistedBook?.id]);

  useEffect(() => {
    initialResumeAppliedRef.current = false;
    initialResumeChunkAppliedRef.current = false;
    resumeTargetChapterRef.current = 0;
    setIsResumeBootstrapDone(false);

    pendingProgressRef.current = null;
    if (progressPersistTimerRef.current) {
      clearTimeout(progressPersistTimerRef.current);
      progressPersistTimerRef.current = null;
    }
  }, [persistedBook?.id]);

  useEffect(() => {
    if (initialResumeAppliedRef.current) {
      return;
    }

    if (menuChapters.length === 0) {
      return;
    }

    if (!resolvedResumeProgress) {
      initialResumeAppliedRef.current = true;
      initialResumeChunkAppliedRef.current = true;
      setIsResumeBootstrapDone(true);
      return;
    }

    let targetChapter = Math.max(0, Math.min(resolvedResumeProgress.lastChapterIndex, menuChapters.length - 1));
    if (resolvedResumeProgress.lastChapterHref) {
      const foundByHref = menuChapters.findIndex((chapter) => chapter.href === resolvedResumeProgress.lastChapterHref);
      if (foundByHref >= 0) {
        targetChapter = foundByHref;
      }
    }

    resumeTargetChapterRef.current = targetChapter;
    initialResumeAppliedRef.current = true;

    if (currentChapterNo !== targetChapter) {
      setCurrentChapterNo(targetChapter);
      return;
    }

    if ((resolvedResumeProgress.lastChunkIndex ?? 0) <= 0) {
      initialResumeChunkAppliedRef.current = true;
      setIsResumeBootstrapDone(true);
    }
  }, [currentChapterNo, menuChapters, resolvedResumeProgress]);

  useEffect(() => {
    const fetchText = async () => {
      const selectedChapter = menuChapters[currentChapterNo];
      if (!selectedChapter) {
        setCurrentHtml('');
        return;
      }

      if (persistedBook) {
        setCurrentHtml(selectedChapter.html || '');
        return;
      }

      if (zipInstance && bookData && selectedChapter.href) {
        const fullPath = bookData.basePath + selectedChapter.href;
        const text = await getChapterText(zipInstance, fullPath);
        setCurrentHtml(text);
      }
    };
    void fetchText();
  }, [bookData, currentChapterNo, menuChapters, persistedBook, zipInstance]);

  useEffect(() => {
    if (menuChapters.length === 0) {
      if (currentChapterNo !== 0) {
        setCurrentChapterNo(0);
      }
      return;
    }

    if (currentChapterNo >= menuChapters.length) {
      setCurrentChapterNo(menuChapters.length - 1);
    }
  }, [currentChapterNo, menuChapters.length]);

  const handleIndexOpen = () => {
    bottomSheetRef.current?.expand(); // Open the sheet instead of navigating
  };

  const rawChapterText = useMemo(() => extractRawText(currentHtml), [currentHtml]);
  const downloadFileBaseName = useMemo(() => {
    const bookTitle = (persistedBook?.title || params.title || 'book').trim();
    const chapterTitle = (menuChapters[currentChapterNo]?.title || `chapter_${currentChapterNo + 1}`).trim();
    return `${bookTitle}_${chapterTitle}`;
  }, [currentChapterNo, menuChapters, params.title, persistedBook?.title]);

  const {
    isPlaying,
    isDownloading,
    chunkTexts,
    currentChunkIndex,
    totalChunks,
    seekToChunk,
    downloadCurrentTextWithPicker,
    togglePlayPause,
  } = useTTSQueuePlayer({
    text: rawChapterText,
    downloadFileBaseName,
    chunkSize: 170,
    chunkPauseMs: 240,
    playbackRate: 0.9,
    playbackPrefetchAheadChunks: 2,
    playbackKeepBehindChunks: 0,
    queueTargetMemoryMB: 32,
  });

  const controlsDisabled = !!isDownloading;
  const seekerProgress = totalChunks <= 1 ? 0 : currentChunkIndex / (totalChunks - 1);

  useEffect(() => {
    if (initialResumeChunkAppliedRef.current) {
      return;
    }

    const progress = resolvedResumeProgress;
    if (!progress) {
      initialResumeChunkAppliedRef.current = true;
      setIsResumeBootstrapDone(true);
      return;
    }

    if (currentChapterNo !== resumeTargetChapterRef.current) {
      return;
    }

    if (chunkTexts.length === 0) {
      return;
    }

    const targetChunk = Math.max(0, Math.min(progress.lastChunkIndex, chunkTexts.length - 1));
    initialResumeChunkAppliedRef.current = true;
    setIsResumeBootstrapDone(true);

    if (targetChunk > 0) {
      void seekToChunk(targetChunk);
    }
  }, [chunkTexts.length, currentChapterNo, resolvedResumeProgress, seekToChunk]);

  const queuePersistReadingProgress = useCallback((
    progress: BookReadingProgressDTO,
    options?: {
      immediate?: boolean;
    },
  ) => {
    const bookId = persistedBook?.id;
    if (!bookId) {
      return;
    }

    pendingProgressRef.current = progress;

    if (options?.immediate) {
      if (progressPersistTimerRef.current) {
        clearTimeout(progressPersistTimerRef.current);
        progressPersistTimerRef.current = null;
      }
      void flushPendingProgress();
      return;
    }

    if (progressPersistTimerRef.current) {
      return;
    }

    progressPersistTimerRef.current = setTimeout(() => {
      progressPersistTimerRef.current = null;
      void flushPendingProgress();
    }, 1200);
  }, [flushPendingProgress, persistedBook?.id]);

  useEffect(() => {
    return () => {
      if (progressPersistTimerRef.current) {
        clearTimeout(progressPersistTimerRef.current);
        progressPersistTimerRef.current = null;
      }
      void flushPendingProgress();
    };
  }, [flushPendingProgress]);

  useEffect(() => {
    if (!isResumeBootstrapDone || !persistedBook?.id || menuChapters.length === 0) {
      return;
    }

    const selectedChapter = menuChapters[currentChapterNo];
    queuePersistReadingProgress({
      lastChapterIndex: currentChapterNo,
      lastChunkIndex: currentChunkIndex,
      lastChapterHref: selectedChapter?.href || null,
      lastReadAt: Date.now(),
    });
  }, [
    currentChapterNo,
    currentChunkIndex,
    isResumeBootstrapDone,
    menuChapters,
    persistedBook?.id,
    queuePersistReadingProgress,
  ]);

  const styledBlocks = useMemo(() => {
    const blocks = htmlToStyledBlocks(currentHtml, chunkTexts, rawChapterText);
    // Filter out any runs that ended up empty after stripping.
    return blocks
      .map((block) => ({
        ...block,
        runs: block.runs.filter((run) => run.text.trim().length > 0),
      }))
      .filter((block) => block.runs.length > 0);
  }, [currentHtml, chunkTexts, rawChapterText]);

  const currentChapterTitle = useMemo(() => {
    return menuChapters[currentChapterNo]?.title || `Chapter ${currentChapterNo + 1}`;
  }, [currentChapterNo, menuChapters]);

  const displayTitle = persistedBook?.title || params.title || 'Reader';
  const displayAuthor = persistedBook?.author || params.author || 'Unknown Author';
  const chapterPositionLabel = `${Math.min(currentChapterNo + 1, Math.max(menuChapters.length, 1))} of ${Math.max(menuChapters.length, 1)}`;
  const chapterProgressPercent = totalChunks > 1
    ? Math.round((currentChunkIndex / (totalChunks - 1)) * 100)
    : 0;
  const canGoToPreviousChapter = currentChapterNo > 0;
  const canGoToNextChapter = currentChapterNo < menuChapters.length - 1;

  const handlePreviousChapter = useCallback(() => {
    if (!canGoToPreviousChapter) {
      return;
    }

    setCurrentChapterNo((previous) => Math.max(0, previous - 1));
  }, [canGoToPreviousChapter]);

  const handleNextChapter = useCallback(() => {
    if (!canGoToNextChapter) {
      return;
    }

    setCurrentChapterNo((previous) => Math.min(menuChapters.length - 1, previous + 1));
  }, [canGoToNextChapter, menuChapters.length]);

  // ────────────────────────────────────────────────────────────────────────
  // SCROLL LOGIC — Kindle-style continuous scroll with pinned active chunk
  // ────────────────────────────────────────────────────────────────────────
  //
  // The staticTab panel overlays the bottom 240px of the ScrollView.
  // The active chunk is pinned at 33% of the *visible* reading area
  // (viewport minus the panel). When TTS advances, the view smoothly
  // scrolls so the new chunk arrives at the pin position. If the user
  // scrolls away, the next chunk change snaps it right back.
  // ────────────────────────────────────────────────────────────────────────
  const BOTTOM_PANEL_HEIGHT = 176;
  const READING_LINE_RATIO = 0.33;
  const SCROLL_PADDING_TOP = 12; // must match scrollPadding.paddingTop in styles
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Core scroll function. Pins `chunkIndex` at the reading-line position.
   * If layout data isn't ready yet, stores the index in pendingAutoScrollChunkRef
   * so it can be retried when measurements arrive.
   */
  const scrollToChunk = useCallback((chunkIndex: number, animated: boolean = true) => {
    if (chunkTexts.length === 0) return;

    const clamped = Math.max(0, Math.min(chunkIndex, chunkTexts.length - 1));
    const layout = chunkLayoutMapRef.current[clamped];

    if (!layout) {
      // Layout not measured yet — queue and wait for onLayout / onContentSizeChange.
      pendingAutoScrollChunkRef.current = clamped;
      return;
    }

    const { viewportHeight } = scrollMetricsRef.current;
    if (viewportHeight <= 0) {
      pendingAutoScrollChunkRef.current = clamped;
      return;
    }

    // Visible reading area = full scroll viewport minus the overlaid bottom panel.
    const visibleHeight = Math.max(viewportHeight - BOTTOM_PANEL_HEIGHT, 200);
    // Pin the chunk's top edge at 33% from the top of the visible area.
    const pinOffset = visibleHeight * READING_LINE_RATIO;
    const targetY = Math.max(0, layout.y - pinOffset);

    pendingAutoScrollChunkRef.current = null;
    chapterScrollRef.current?.scrollTo({ y: targetY, animated });
  }, [chunkTexts.length]);

  /**
   * Debounced flush — called when ScrollView layout or content size becomes
   * available. Coalesces rapid-fire events into a single scroll attempt.
   */
  const schedulePendingFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return; // already scheduled
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      const pending = pendingAutoScrollChunkRef.current;
      if (pending !== null) {
        scrollToChunk(pending);
      }
    }, 0);
  }, [scrollToChunk]);

  const handleSeek = useCallback((progress: number) => {
    if (controlsDisabled || totalChunks <= 0) return;
    const nextChunkIndex = Math.round(progress * Math.max(totalChunks - 1, 0));
    scrollToChunk(nextChunkIndex);
    void seekToChunk(nextChunkIndex);
  }, [controlsDisabled, scrollToChunk, seekToChunk, totalChunks]);

  const handleChunkPress = useCallback((index: number) => {
    if (controlsDisabled) return;
    scrollToChunk(index);
    void seekToChunk(index);
  }, [controlsDisabled, scrollToChunk, seekToChunk]);

  // Temporarily disabled to isolate physical-device TTS session conflicts.
  // Re-enable after confirming stable chunk playback on device.

  // ── Lifecycle effects for scroll ──────────────────────────────────────

  // Track cover→text mode transition for instant-jump on entry.
  const wasInTextModeRef = useRef(false);

  // When chapter HTML changes, reset all layout measurements.
  useEffect(() => {
    chunkLayoutMapRef.current = {};
    // The current chunk will be re-scrolled once block layouts arrive.
    pendingAutoScrollChunkRef.current = 0;
  }, [currentHtml]);

  // TTS advancement: smooth animated re-pin to reading line on every chunk change.
  useEffect(() => {
    scrollToChunk(currentChunkIndex, true);
  }, [currentChunkIndex, scrollToChunk]);

  // Mode transition: instant jump when entering text view from cover.
  useEffect(() => {
    const justEntered = isTextMode && !wasInTextModeRef.current;
    wasInTextModeRef.current = isTextMode;

    if (justEntered) {
      // Small delay so the animated-pane opacity is > 0 before we scroll.
      const t = setTimeout(() => scrollToChunk(currentChunkIndex, false), 50);
      return () => clearTimeout(t);
    }
  }, [isTextMode, currentChunkIndex, scrollToChunk]);

  // Cleanup flush timer on unmount.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (sleepTimerRemainingMs === null) {
      return;
    }

    const interval = setInterval(() => {
      setSleepTimerRemainingMs((previous) => {
        if (previous === null) {
          return null;
        }

        if (previous <= 1000) {
          clearInterval(interval);
          return null;
        }

        return previous - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimerRemainingMs]);

  useEffect(() => {
    return () => {
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
    };
  }, []);

  const clearSleepTimer = useCallback(() => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    setSleepTimerRemainingMs(null);
  }, []);

  const setSleepTimer = useCallback((minutes: number) => {
    clearSleepTimer();

    const durationMs = minutes * 60 * 1000;
    setSleepTimerRemainingMs(durationMs);
    setIsSleepMenuOpen(false);

    sleepTimerRef.current = setTimeout(() => {
      setSleepTimerRemainingMs(null);
      sleepTimerRef.current = null;

      if (isPlaying) {
        void togglePlayPause();
      }
    }, durationMs);
  }, [clearSleepTimer, isPlaying, togglePlayPause]);

  const formatSleepLabel = useMemo(() => {
    if (sleepTimerRemainingMs === null) {
      return null;
    }

    const totalSeconds = Math.max(0, Math.ceil(sleepTimerRemainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, [sleepTimerRemainingMs]);

  const handleDownloadPress = useCallback(() => {
    void downloadCurrentTextWithPicker().catch((error) => {
      console.warn('Reader download failed:', error);
    });
  }, [downloadCurrentTextWithPicker]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollMetricsRef.current.yOffset = event.nativeEvent.contentOffset.y;
  }, []);

  const coverOpacity = modeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const textOpacity = modeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const coverTranslateY = modeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -14],
  });

  const textTranslateY = modeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });

  const compactBottomInset = Math.max(0, insets.bottom - 10);
  const readerDockHeight = READER_DOCK_BASE_HEIGHT + compactBottomInset;
  const readerDockStyle = useMemo(() => ({
    bottom: 6,
    height: readerDockHeight,
    paddingBottom: 10 + compactBottomInset,
  }), [compactBottomInset, readerDockHeight]);

  const readerSurfaceSpacingStyle = useMemo(() => ({
    marginBottom: readerDockHeight + READER_DOCK_GAP,
  }), [readerDockHeight]);

  const coverSceneSpacingStyle = useMemo(() => ({
    paddingTop: 20,
    paddingBottom: readerDockHeight + READER_DOCK_GAP + 10,
  }), [readerDockHeight]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.mainWrapper, isTextMode && styles.mainWrapperReader]}>
        <Stack.Screen options={{ title: displayTitle, headerShown: false }} />

        <SafeAreaView style={styles.safeAreaTop}>
          <View style={[styles.chromeHeader, isTextMode && styles.chromeHeaderReader]}>
            <TouchableOpacity style={styles.headerCircleButton} onPress={() => router.back()} activeOpacity={0.78}>
              <Ionicons name="chevron-back" size={22} color="#f6efe3" />
            </TouchableOpacity>

            <View style={styles.chromeTitleGroup}>
              <Text style={[styles.chromeEyebrow, isTextMode && styles.chromeEyebrowReader]} numberOfLines={1}>
                {isTextMode ? displayAuthor : 'Your reading session'}
              </Text>
              <Text style={[styles.chromeTitle, isTextMode && styles.chromeTitleReader]} numberOfLines={1}>
                {isTextMode ? currentChapterTitle : displayTitle}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.modeToggleButton, isTextMode && styles.modeToggleButtonReader]}
                onPress={() => setIsTextMode((previous) => !previous)}
                activeOpacity={0.82}
              >
                <Ionicons
                  name={isTextMode ? 'albums-outline' : 'book-outline'}
                  size={16}
                  color="#f7efe2"
                />
                <Text style={[styles.modeToggleText, isTextMode && styles.modeToggleTextReader]}>
                  {isTextMode ? 'Cover' : 'Read'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleIndexOpen}
                disabled={controlsDisabled}
                style={[
                  styles.headerCircleButton,
                  isTextMode && styles.headerCircleButtonReader,
                  controlsDisabled && styles.disabled,
                ]}
                activeOpacity={0.78}
              >
                <Ionicons name="list" size={18} color="#f6efe3" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.content}>
            <View style={styles.contentStage}>
              <Animated.View
                pointerEvents={isTextMode ? 'none' : 'auto'}
                style={[
                  styles.animatedPane,
                  {
                    opacity: coverOpacity,
                    transform: [{ translateY: coverTranslateY }],
                  },
                ]}
              >
                <View style={[styles.coverScene, coverSceneSpacingStyle]}>
                  <View style={styles.coverCardFrame}>
                    <TouchableOpacity activeOpacity={0.9} onPress={() => setIsTextMode(true)} style={styles.coverCard}>
                      {(persistedBook?.cover || params.cover) ? (
                        <Image source={{ uri: persistedBook?.cover || params.cover }} style={styles.coverImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.coverPlaceholder}>
                          <Text style={styles.coverPlaceholderText}>
                            {displayTitle.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.coverChapterOverlay}>
                        <Text style={styles.coverChapterEyebrow}>Current chapter</Text>
                        <Text style={styles.coverChapterText} numberOfLines={2}>
                          {currentChapterTitle}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.coverAuthorLine} numberOfLines={1}>
                    {displayAuthor}
                  </Text>

                  <View style={styles.coverActionRow}>
                    <TouchableOpacity
                      style={[styles.coverMiniButton, !canGoToPreviousChapter && styles.disabled]}
                      onPress={handlePreviousChapter}
                      disabled={!canGoToPreviousChapter}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="chevron-back" size={18} color="#f6efe3" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.coverReadButton} onPress={() => setIsTextMode(true)} activeOpacity={0.84}>
                      <Ionicons name="book-outline" size={18} color="#11100d" />
                      <Text style={styles.coverReadButtonText}>Open Reader</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.coverMiniButton, !canGoToNextChapter && styles.disabled]}
                      onPress={handleNextChapter}
                      disabled={!canGoToNextChapter}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="chevron-forward" size={18} color="#f6efe3" />
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>

              <Animated.View
                pointerEvents={isTextMode ? 'auto' : 'none'}
                style={[
                  styles.animatedPane,
                  {
                    opacity: textOpacity,
                    transform: [{ translateY: textTranslateY }],
                  },
                ]}
              >
                <View style={[styles.readerSurface, readerSurfaceSpacingStyle]}>
                  <View style={styles.readerMetaBar}>
                    <View style={styles.readerMetaTextGroup}>
                      <Text style={styles.readerMetaEyebrow} numberOfLines={1}>
                        {displayTitle}
                      </Text>
                      <Text style={styles.readerMetaTitle} numberOfLines={1}>
                        {currentChapterTitle}
                      </Text>
                    </View>

                    <View style={styles.readerMetaChip}>
                      <Text style={styles.readerMetaChipText}>{chapterPositionLabel}</Text>
                    </View>
                  </View>

                  <ScrollView
                    ref={chapterScrollRef}
                    contentContainerStyle={styles.scrollPadding}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                    onLayout={(event) => {
                      scrollMetricsRef.current.viewportHeight = event.nativeEvent.layout.height;
                      schedulePendingFlush();
                    }}
                    onContentSizeChange={(_, contentHeight) => {
                      scrollMetricsRef.current.contentHeight = contentHeight;
                      schedulePendingFlush();
                    }}
                  >
                    <View style={styles.blockList}>
                      {styledBlocks.map((block, blockIndex) => {
                        const blockChunkIndices = [...new Set(block.runs.map((r) => r.chunkIndex))];
                        const totalChars = block.runs.reduce((sum, r) => sum + r.text.length, 0);
                        let charCursor = 0;
                        const chunkStartRatio: Record<number, number> = {};

                        for (const run of block.runs) {
                          if (!(run.chunkIndex in chunkStartRatio)) {
                            chunkStartRatio[run.chunkIndex] = totalChars > 0 ? charCursor / totalChars : 0;
                          }
                          charCursor += run.text.length;
                        }

                        return (
                          <View
                            key={blockIndex}
                            style={block.type !== 'p' ? styles.headingBlock : styles.paragraphBlock}
                            onLayout={(event) => {
                              const { y, height } = event.nativeEvent.layout;
                              const blockY = y + SCROLL_PADDING_TOP;
                              let anyNew = false;

                              for (const ci of blockChunkIndices) {
                                if (!chunkLayoutMapRef.current[ci]) {
                                  const ratio = chunkStartRatio[ci] ?? 0;
                                  chunkLayoutMapRef.current[ci] = {
                                    y: blockY + height * ratio,
                                    height: height / Math.max(blockChunkIndices.length, 1),
                                  };
                                  anyNew = true;
                                }
                              }

                              if (anyNew && pendingAutoScrollChunkRef.current !== null) {
                                schedulePendingFlush();
                              }
                            }}
                          >
                            <Text
                              style={[
                                styles.blockText,
                                block.type === 'h1' && styles.h1Text,
                                block.type === 'h2' && styles.h2Text,
                                block.type === 'h3' && styles.h3Text,
                              ]}
                            >
                              {block.runs.map((run, runIndex) => {
                                const isActive = run.chunkIndex === currentChunkIndex;
                                return (
                                  <Text
                                    key={runIndex}
                                    onPress={controlsDisabled ? undefined : () => handleChunkPress(run.chunkIndex)}
                                    style={[
                                      run.bold && styles.boldRun,
                                      run.italic && styles.italicRun,
                                      isActive && styles.activeRun,
                                    ]}
                                  >
                                    {run.text}
                                  </Text>
                                );
                              })}
                            </Text>
                          </View>
                        );
                      })}

                      {styledBlocks.length === 0 && (
                        <Text style={styles.emptyChunkText}>No readable content found for this chapter.</Text>
                      )}
                    </View>
                  </ScrollView>
                </View>
              </Animated.View>
            </View>
          </View>
        </SafeAreaView>

        <View style={[styles.bottomDock, readerDockStyle]}>
          <View style={styles.dockMetaRow}>
            <View style={styles.dockStatBlock}>
              <Text style={styles.dockStatLabel}>Completed</Text>
              <Text style={styles.dockStatValue}>{chapterProgressPercent}%</Text>
            </View>

            <TouchableOpacity
              onPress={handleIndexOpen}
              disabled={controlsDisabled}
              style={[styles.chapterPill, controlsDisabled && styles.disabled]}
              activeOpacity={0.82}
            >
              <Ionicons name="list" size={14} color="#f6efe3" />
              <Text style={styles.chapterPillText} numberOfLines={1}>
                {currentChapterTitle}
              </Text>
            </TouchableOpacity>

            <View style={styles.dockMetaSpacer} />
          </View>

          <ChunkSeeker
            progress={seekerProgress}
            currentChunk={currentChunkIndex}
            totalChunks={totalChunks}
            disabled={controlsDisabled || totalChunks === 0}
            onSeek={handleSeek}
          />

          <View style={styles.controlsRow}>
            <View style={styles.sideControls}>
              <TouchableOpacity
                onPress={handleDownloadPress}
                disabled={controlsDisabled}
                style={[styles.iconButton, controlsDisabled && styles.disabled]}
              >
                <Ionicons name={isDownloading ? 'sync' : 'download-outline'} size={20} color="#f6efe3" />
              </TouchableOpacity>

              <View style={styles.sleepTimerContainer}>
                <TouchableOpacity
                  onPress={() => setIsSleepMenuOpen((previous) => !previous)}
                  disabled={controlsDisabled}
                  style={[styles.iconButton, controlsDisabled && styles.disabled]}
                >
                  <Ionicons name="moon-outline" size={20} color={sleepTimerRemainingMs ? '#f1cf90' : '#f6efe3'} />
                </TouchableOpacity>

                {isSleepMenuOpen && !controlsDisabled && (
                  <View style={styles.sleepMenu}>
                    <TouchableOpacity style={styles.sleepOption} onPress={() => setSleepTimer(15)}>
                      <Text style={styles.sleepOptionText}>15 min</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sleepOption} onPress={() => setSleepTimer(30)}>
                      <Text style={styles.sleepOptionText}>30 min</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sleepOption} onPress={() => setSleepTimer(45)}>
                      <Text style={styles.sleepOptionText}>45 min</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sleepOption} onPress={() => setSleepTimer(60)}>
                      <Text style={styles.sleepOptionText}>1 hour</Text>
                    </TouchableOpacity>
                    {sleepTimerRemainingMs !== null && (
                      <TouchableOpacity style={styles.sleepOption} onPress={clearSleepTimer}>
                        <Text style={[styles.sleepOptionText, styles.sleepCancelText]}>Cancel timer</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {formatSleepLabel && (
                  <View style={styles.sleepBadge}>
                    <Text style={styles.sleepBadgeText}>{formatSleepLabel}</Text>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.playButton, controlsDisabled && styles.disabled]}
              onPress={togglePlayPause}
              disabled={controlsDisabled}
            >
              {isDownloading ? (
                <ActivityIndicator size="large" color="#17120f" />
              ) : (
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color="#17120f" />
              )}
            </TouchableOpacity>

            <View style={styles.sideControls}>
              <TouchableOpacity
                onPress={handlePreviousChapter}
                disabled={!canGoToPreviousChapter || controlsDisabled}
                style={[styles.iconButton, (!canGoToPreviousChapter || controlsDisabled) && styles.disabled]}
              >
                <Ionicons name="play-skip-back" size={19} color="#f6efe3" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNextChapter}
                disabled={!canGoToNextChapter || controlsDisabled}
                style={[styles.iconButton, (!canGoToNextChapter || controlsDisabled) && styles.disabled]}
              >
                <Ionicons name="play-skip-forward" size={19} color="#f6efe3" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <BottomSheet
          ref={bottomSheetRef}
          index={0}
          snapPoints={snapPoints}
          enablePanDownToClose={true}
          backgroundStyle={{ backgroundColor: '#1a1714' }}
          handleIndicatorStyle={{ backgroundColor: '#c3b39c' }}
        >
          <ChapterIndex
            chapters={menuChapters}
            currentChapterNo={currentChapterNo}
            onSelectChapter={(index) => {
              setCurrentChapterNo(index);
              bottomSheetRef.current?.collapse();
            }}
          />
        </BottomSheet>
        <DownloadOverlay visible={isDownloading} onClose={() => {}} message="Saving to Downloads... Please be patient." />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: '#11100d',
  },
  mainWrapperReader: {
    backgroundColor: '#11100d',
  },
  safeAreaTop: {
    flex: 1,
  },
  chromeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
  },
  chromeHeaderReader: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerCircleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerCircleButtonReader: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chromeTitleGroup: {
    flex: 1,
    marginHorizontal: 14,
  },
  chromeEyebrow: {
    color: '#a99b88',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chromeEyebrowReader: {
    color: '#a99b88',
  },
  chromeTitle: {
    color: '#f6efe3',
    fontSize: 18,
    fontFamily: 'Georgia',
    fontWeight: '700',
    marginTop: 2,
  },
  chromeTitleReader: {
    color: '#f6efe3',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginRight: 8,
  },
  modeToggleButtonReader: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modeToggleText: {
    color: '#f7efe2',
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '700',
  },
  modeToggleTextReader: {
    color: '#f7efe2',
  },
  content: {
    flex: 1,
  },
  contentStage: {
    flex: 1,
    position: 'relative',
  },
  animatedPane: {
    ...StyleSheet.absoluteFillObject,
  },
  coverScene: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  coverCardFrame: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 18,
  },
  coverCard: {
    width: 280,
    maxWidth: '100%',
    aspectRatio: 0.69,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#201b17',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a231d',
  },
  coverPlaceholderText: {
    color: '#f6efe3',
    fontSize: 92,
    fontWeight: '700',
  },
  coverChapterOverlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 12, 9, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  coverChapterEyebrow: {
    color: '#d2c2ae',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  coverChapterText: {
    color: '#fff9f0',
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  coverAuthorLine: {
    color: '#a99b88',
    fontSize: 16,
    marginTop: 18,
    marginBottom: 18,
    fontWeight: '600',
  },
  coverActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 360,
  },
  coverMiniButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  coverReadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: 58,
    borderRadius: 27,
    backgroundColor: '#f2e6cf',
    marginHorizontal: 14,
    paddingHorizontal: 18,
  },
  coverReadButtonText: {
    color: '#17120f',
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 8,
  },
  readerSurface: {
    flex: 1,
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#171310',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  readerMetaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  readerMetaTextGroup: {
    flex: 1,
    marginRight: 14,
  },
  readerMetaEyebrow: {
    color: '#a99b88',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  readerMetaTitle: {
    color: '#f6efe3',
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Georgia',
    fontWeight: '700',
    marginTop: 5,
  },
  readerMetaChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  readerMetaChipText: {
    color: '#d6c5b0',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollPadding: {
    paddingBottom: 440,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  blockList: {},
  paragraphBlock: {
    marginBottom: 18,
  },
  headingBlock: {
    marginTop: 26,
    marginBottom: 12,
  },
  blockText: {
    color: '#ebe1d3',
    fontSize: 21,
    lineHeight: 38,
    fontFamily: 'Georgia',
  },
  h1Text: {
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '700',
    color: '#fff6ea',
  },
  h2Text: {
    fontSize: 25,
    lineHeight: 34,
    fontWeight: '700',
    color: '#f8efe2',
  },
  h3Text: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    color: '#f1e6d8',
  },
  boldRun: {
    fontWeight: '700',
  },
  italicRun: {
    fontStyle: 'italic',
  },
  activeRun: {
    backgroundColor: 'rgba(0, 188, 163, 0.22)',
    color: '#ffffff',
  },
  emptyChunkText: {
    color: '#8d7d6d',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 20,
  },
  bottomDock: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 28,
    backgroundColor: '#100b09',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingTop: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 20,
  },
  dockMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  dockStatBlock: {
    width: 84,
  },
  dockMetaSpacer: {
    width: 84,
  },
  dockStatLabel: {
    color: '#a59584',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dockStatValue: {
    color: '#f8f1e4',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  chapterPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 14,
  },
  chapterPillText: {
    flex: 1,
    color: '#f8f1e4',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 14,
  },
  sideControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sleepTimerContainer: {
    position: 'relative',
    marginLeft: 10,
  },
  sleepMenu: {
    position: 'absolute',
    bottom: 58,
    right: -8,
    minWidth: 112,
    backgroundColor: '#1d1814',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 50,
  },
  sleepOption: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sleepOptionText: {
    color: '#f4ebde',
    fontSize: 13,
    fontWeight: '600',
  },
  sleepCancelText: {
    color: '#e3a7a7',
  },
  sleepBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    borderRadius: 10,
    backgroundColor: '#f1cf90',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sleepBadgeText: {
    color: '#19110b',
    fontSize: 10,
    fontWeight: '800',
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2e6cf',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  disabled: {
    opacity: 0.42,
  },
});
