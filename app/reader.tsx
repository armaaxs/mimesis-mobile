import ChunkSeeker from '@/components/ChunkSeeker.component';
import DownloadOverlay from '@/components/DownloadOverlay.component';
import Screenheader from '@/components/Screenheader.component';
import { useBackgroundMediaSession } from '@/hooks/use-background-media-session';
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
import { Stack, useLocalSearchParams } from 'expo-router';
import JSZip from 'jszip';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'; // Added useRef
import { ActivityIndicator, Animated, Image, NativeSyntheticEvent, NativeScrollEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // New Import
import { SafeAreaView } from 'react-native-safe-area-context';
import ChapterIndex from './bookIndex'; // Importing the ChapterIndex component

type ReaderChapter = {
  href: string;
  title?: string;
  html?: string;
  plainText?: string;
};

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
    chunkSize: 200,
    playbackPrefetchAheadChunks: 40,
    playbackKeepBehindChunks: 20,
    queueTargetMemoryMB: 96,
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
  const BOTTOM_PANEL_HEIGHT = 240;
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

  const handleRemotePlay = useCallback(() => {
    if (!isPlaying) {
      void togglePlayPause();
    }
  }, [isPlaying, togglePlayPause]);

  const handleRemotePause = useCallback(() => {
    if (isPlaying) {
      void togglePlayPause();
    }
  }, [isPlaying, togglePlayPause]);

  useBackgroundMediaSession({
    title: persistedBook?.title || params.title || 'Reader',
    artist: persistedBook?.author || params.author || 'Audiobook',
    artwork: persistedBook?.cover || params.cover || undefined,
    isPlaying,
    position: currentChunkIndex,
    duration: Math.max(totalChunks - 1, 1),
    onPlay: handleRemotePlay,
    onPause: handleRemotePause,
  });

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

  


return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.mainWrapper}>
        <Stack.Screen options={{ title: persistedBook?.title || params.title || 'Reader', headerShown: false }} />
        
        <SafeAreaView style={styles.safeAreaTop}>
           <Screenheader title={persistedBook?.title || params.title} />
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
                  <View style={styles.coverContainer}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => setIsTextMode(true)} style={styles.coverCard}>
                      {(persistedBook?.cover || params.cover) ? (
                        <Image source={{ uri: persistedBook?.cover || params.cover }} style={styles.coverImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.coverPlaceholder}>
                          <Text style={styles.coverPlaceholderText}>
                            {(persistedBook?.title || params.title || 'Book').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.coverChapterOverlay}>
                        <Text style={styles.coverChapterText} numberOfLines={1}>
                          {currentChapterTitle}
                        </Text>
                        <TouchableOpacity
                          onPress={handleDownloadPress}
                          disabled={controlsDisabled}
                          style={[styles.coverDownloadButton, controlsDisabled && styles.disabled]}
                        >
                          <Ionicons name={isDownloading ? 'sync' : 'download'} size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
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
                  <TouchableOpacity style={styles.readerBackButton} onPress={() => setIsTextMode(false)}>
                    <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                    <Text style={styles.readerBackText}>Cover</Text>
                  </TouchableOpacity>
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

                        // Pre-compute each chunk's character-offset ratio within
                        // this block so onLayout can place them proportionally
                        // instead of pinning every chunk to the block's top edge.
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
                              // y is relative to blockList; add SCROLL_PADDING_TOP
                              // for content-container coordinates used by scrollTo.
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
                </Animated.View>
              </View>
           </View>
        </SafeAreaView>

        <View style={styles.staticTab}>
          <ChunkSeeker
            progress={seekerProgress}
            currentChunk={currentChunkIndex}
            totalChunks={totalChunks}
            disabled={controlsDisabled || totalChunks === 0}
            onSeek={handleSeek}
          />

          {/* REWRITTEN BUTTON SECTION: One Line, No Dividers */}
          <View style={styles.controlsRow}>
            <View style={styles.leftControlsRow}>
              <View style={styles.sleepTimerContainer}>
                <TouchableOpacity
                  onPress={() => setIsSleepMenuOpen((previous) => !previous)}
                  disabled={controlsDisabled}
                  style={[styles.iconButton, controlsDisabled && styles.disabled]}
                >
                  <Ionicons name="moon" size={22} color={sleepTimerRemainingMs ? '#00d8b4' : '#fff'} />
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
                <ActivityIndicator size="large" color="#ffffff" />
              ) : (
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={50} color="#fff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleIndexOpen} 
              disabled={controlsDisabled} 
              style={[styles.iconButton, controlsDisabled && styles.disabled]}
            >
              <Ionicons name="menu" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View> 

        <BottomSheet
          ref={bottomSheetRef}
          index={0}
          snapPoints={snapPoints}
          enablePanDownToClose={true}
          backgroundStyle={{ backgroundColor: '#1A1A1A' }}
          handleIndicatorStyle={{ backgroundColor: '#fff' }}
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
  // --- LAYOUT ---
  mainWrapper: { 
    flex: 1, 
    backgroundColor: '#121212' 
  },
  safeAreaTop: { 
    flex: 1 
  },
  content: { 
    flex: 1 
  },
  contentStage: {
    flex: 1,
    position: 'relative',
  },
  animatedPane: {
    ...StyleSheet.absoluteFillObject,
  },

  // --- COVER CARD ---
  coverContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 150,
  },
  coverCard: {
    width: '82%',
    maxWidth: 340,
    aspectRatio: 0.7,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252525',
  },
  coverPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 82,
    fontWeight: '700',
  },
  coverTapHint: {
    marginTop: 14,
    color: '#A7A7A7',
    fontSize: 14,
  },
  coverChapterOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  coverChapterText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  coverDownloadButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginLeft: 10,
  },

  // --- NAVIGATION ---
  readerBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 12,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  readerBackText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginLeft: 2,
  },

  // --- STYLED BLOCK RENDERING ---
  scrollPadding: { 
    // Large bottom padding ensures the last chunk can scroll up
    // to the upper-third pin position above the 240px bottom panel.
    paddingBottom: 500, 
    paddingHorizontal: 20, 
    paddingTop: 12 
  },
  blockList: {},
  paragraphBlock: {
    marginBottom: 16,
  },
  headingBlock: {
    marginTop: 20,
    marginBottom: 10,
  },
  blockText: {
    color: '#C8C8C8',
    fontSize: 18,
    lineHeight: 30,
    fontFamily: 'Georgia',
  },
  h1Text: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 32,
  },
  h2Text: {
    fontSize: 20,
    fontWeight: '600',
    color: '#EEEEEE',
    lineHeight: 30,
  },
  h3Text: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E0E0E0',
    lineHeight: 28,
  },
  boldRun: {
    fontWeight: '700',
    color: '#E8E8E8',
  },
  italicRun: {
    fontStyle: 'italic',
  },
  activeRun: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 216, 180, 0.22)',
  },
  emptyChunkText: {
    color: '#515151',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 20,
  },

  // --- GLASSY BOTTOM PANEL ---
  staticTab: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 240,
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 38,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 20,
  },

  // --- UNIFIED CONTROL ROW (No Dividers) ---
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    marginTop: 24,
    width: '100%',
  },
  leftControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sleepTimerContainer: {
    position: 'relative',
  },
  sleepMenu: {
    position: 'absolute',
    bottom: 58,
    left: -12,
    minWidth: 108,
    backgroundColor: 'rgba(20, 20, 20, 0.98)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 40,
  },
  sleepOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sleepOptionText: {
    color: '#F3F3F3',
    fontSize: 13,
    fontWeight: '600',
  },
  sleepCancelText: {
    color: '#ff8f8f',
  },
  sleepBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#00bca3',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sleepBadgeText: {
    color: '#00110f',
    fontSize: 10,
    fontWeight: '800',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    // Depth for the main action
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  disabled: { 
    opacity: 0.4 
  },
});