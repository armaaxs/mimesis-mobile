import ChunkSeeker from '@/components/ChunkSeeker.component';
import DownloadOverlay from '@/components/DownloadOverlay.component';
import Screenheader from '@/components/Screenheader.component';
import { useTTSQueuePlayer } from '@/hooks/use-tts-queue-player';
import { Book } from '@/models/Book';
import { getBookById, getBookByUri } from '@/utils/bookRepository';
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
    uri?: string 
  }>();

  const [bookData, setBookData] = useState<any>(null);
  const [persistedBook, setPersistedBook] = useState<Book | null>(null);
  const [hasResolvedPersistedBook, setHasResolvedPersistedBook] = useState(false);
  const [currentChapterNo, setCurrentChapterNo] = useState(1);
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [currentHtml, setCurrentHtml] = useState<string>('');
  const [isTextMode, setIsTextMode] = useState(false);
  const modeProgress = useRef(new Animated.Value(0)).current;
  const chapterScrollRef = useRef<ScrollView>(null);
  const chunkLayoutMapRef = useRef<Record<number, { y: number; height: number }>>({});
  const scrollMetricsRef = useRef({ yOffset: 0, viewportHeight: 0, contentHeight: 0 });

  // Bottom Sheet Ref and Snap Points
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['1%', '80%'], []);

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

  useEffect(() => {
    const fetchText = async () => {
      if (persistedBook) {
        const chapter = persistedBook.chapters[currentChapterNo];
        setCurrentHtml(chapter?.html || '');
        return;
      }

      if (zipInstance && bookData && bookData.chapters[currentChapterNo]) {
        const fullPath = bookData.basePath + bookData.chapters[currentChapterNo].href;
        const text = await getChapterText(zipInstance, fullPath);
        setCurrentHtml(text);
      }
    };
    void fetchText();
  }, [bookData, currentChapterNo, persistedBook, zipInstance]);

  const handleIndexOpen = () => {
    bottomSheetRef.current?.expand(); // Open the sheet instead of navigating
  };

  const menuChapters = useMemo(() => {
    const sourceChapters = (persistedBook?.chapters || bookData?.chapters || []) as ReaderChapter[];

    return sourceChapters.map((chapter, index) => ({
      ...chapter,
      title: buildFallbackChapterTitle(chapter, index),
    }));
  }, [bookData?.chapters, persistedBook?.chapters]);

  const rawChapterText = useMemo(() => extractRawText(currentHtml), [currentHtml]);

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
    chunkSize: 200,
    playbackPrefetchAheadChunks: 40,
    playbackKeepBehindChunks: 20,
    queueTargetMemoryMB: 96,
  });

  const controlsDisabled = !!isDownloading;
  const seekerProgress = totalChunks <= 1 ? 0 : currentChunkIndex / (totalChunks - 1);

  const styledBlocks = useMemo(
    () => htmlToStyledBlocks(currentHtml, chunkTexts),
    [currentHtml, chunkTexts],
  );

  const currentChapterTitle = useMemo(() => {
    return menuChapters[currentChapterNo]?.title || `Chapter ${currentChapterNo + 1}`;
  }, [currentChapterNo, menuChapters]);

  const ensureChunkInView = useCallback((chunkIndex: number, forceCenter: boolean = false) => {
    if (chunkTexts.length === 0) {
      return;
    }

    const clampedIndex = Math.max(0, Math.min(chunkIndex, chunkTexts.length - 1));
    const layout = chunkLayoutMapRef.current[clampedIndex];

    if (!layout) {
      return;
    }

    const { yOffset, viewportHeight, contentHeight } = scrollMetricsRef.current;

    if (viewportHeight <= 0) {
      return;
    }

    const topKeepMargin = 90;
    const bottomKeepMargin = 210;
    const visibleTop = yOffset + topKeepMargin;
    const visibleBottom = yOffset + viewportHeight - bottomKeepMargin;
    const chunkTop = layout.y;
    const chunkBottom = layout.y + layout.height;
    const chunkFullyVisible = chunkTop >= visibleTop && chunkBottom <= visibleBottom;

    if (chunkFullyVisible && !forceCenter) {
      return;
    }

    const desiredCenterOffset = chunkTop - Math.max(0, (viewportHeight - layout.height) / 2);
    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    const targetOffset = Math.max(0, Math.min(desiredCenterOffset, maxOffset));

    chapterScrollRef.current?.scrollTo({ y: targetOffset, animated: true });
  }, [chunkTexts.length]);

  const handleSeek = useCallback((progress: number) => {
    if (controlsDisabled || totalChunks <= 0) {
      return;
    }

    const nextChunkIndex = Math.round(progress * Math.max(totalChunks - 1, 0));
    ensureChunkInView(nextChunkIndex, true);
    void seekToChunk(nextChunkIndex);
  }, [controlsDisabled, ensureChunkInView, seekToChunk, totalChunks]);

  const handleChunkPress = useCallback((index: number) => {
    if (controlsDisabled) {
      return;
    }

    ensureChunkInView(index, true);
    void seekToChunk(index);
  }, [controlsDisabled, ensureChunkInView, seekToChunk]);

  useEffect(() => {
    chunkLayoutMapRef.current = {};
  }, [chunkTexts]);

  useEffect(() => {
    ensureChunkInView(currentChunkIndex);
  }, [currentChunkIndex, ensureChunkInView]);

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
                    }}
                    onContentSizeChange={(_, contentHeight) => {
                      scrollMetricsRef.current.contentHeight = contentHeight;
                    }}
                  >
                    <View style={styles.blockList}>
                      {styledBlocks.map((block, blockIndex) => {
                        const blockChunkIndices = [...new Set(block.runs.map((r) => r.chunkIndex))];
                        return (
                          <View
                            key={blockIndex}
                            style={block.type !== 'p' ? styles.headingBlock : styles.paragraphBlock}
                            onLayout={(event) => {
                              const { y, height } = event.nativeEvent.layout;
                              blockChunkIndices.forEach((ci) => {
                                if (!chunkLayoutMapRef.current[ci]) {
                                  chunkLayoutMapRef.current[ci] = { y, height };
                                }
                              });
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
            <TouchableOpacity 
              onPress={downloadCurrentTextWithPicker} 
              disabled={controlsDisabled} 
              style={[styles.iconButton, controlsDisabled && styles.disabled]}
            >
              <Ionicons name={isDownloading ? 'sync' : 'download'} size={24} color="#fff" />
            </TouchableOpacity>

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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  coverChapterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
    paddingBottom: '25%', 
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