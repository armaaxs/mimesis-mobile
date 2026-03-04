import ChunkSeeker from '@/components/ChunkSeeker.component';
import DownloadOverlay from '@/components/DownloadOverlay.component';
import Screenheader from '@/components/Screenheader.component';
import { useTTSQueuePlayer } from '@/hooks/use-tts-queue-player';
import { getChapterText, parseEpub } from '@/utils/epubparser';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet'; // New Import
import { File } from 'expo-file-system';
import { Stack, useLocalSearchParams } from 'expo-router';
import JSZip from 'jszip';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'; // Added useRef
import { ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // New Import
import { SafeAreaView } from 'react-native-safe-area-context';
import ChapterIndex from './bookIndex'; // Importing the ChapterIndex component

const extractRawText = (html: string): string => {
  if (!html) return "";

  return html
    // 1. Remove script and style elements and their content
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    // 2. Replace common block-level tags with newlines to preserve spacing
    .replace(/<(p|br|h1|h2|h3|h4|h5|h6|div|li)[^>]*>/gi, "\n")
    // 3. Strip all remaining HTML tags
    .replace(/<[^>]+>/g, " ")
    // 4. Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "—")
    // 5. Clean up whitespace (remove double spaces and excessive newlines)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
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
  const [currentChapterNo, setCurrentChapterNo] = useState(1);
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [currentHtml, setCurrentHtml] = useState<string>('');
  const chapterScrollRef = useRef<ScrollView>(null);
  const chunkLayoutMapRef = useRef<Record<number, { y: number; height: number }>>({});
  const scrollMetricsRef = useRef({ yOffset: 0, viewportHeight: 0, contentHeight: 0 });

  // Bottom Sheet Ref and Snap Points
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['1%', '80%'], []);

  useEffect(() => {
    return () => console.log('Reader component destroyed');
  }, []);

  const loadBook = useCallback(async () => {
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
  }, [params.uri]);

  useEffect(() => {
    void loadBook();
  }, [loadBook]);

  useEffect(() => {
    const fetchText = async () => {
      if (zipInstance && bookData && bookData.chapters[currentChapterNo]) {
        const fullPath = bookData.basePath + bookData.chapters[currentChapterNo].href;
        const text = await getChapterText(zipInstance, fullPath);
        setCurrentHtml(text);
      }
    };
    fetchText();
  }, [bookData, zipInstance, currentChapterNo]);

  const handleIndexOpen = () => {
    bottomSheetRef.current?.expand(); // Open the sheet instead of navigating
  };

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

  const handleSeek = useCallback((progress: number) => {
    if (controlsDisabled || totalChunks <= 0) {
      return;
    }

    const nextChunkIndex = Math.round(progress * Math.max(totalChunks - 1, 0));
    ensureChunkInView(nextChunkIndex, true);
    void seekToChunk(nextChunkIndex);
  }, [controlsDisabled, ensureChunkInView, seekToChunk, totalChunks]);

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

  


return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.mainWrapper}>
        <Stack.Screen options={{ title: params.title || 'Reader', headerShown: false }} />
        
        <SafeAreaView style={styles.safeAreaTop}>
           <Screenheader title={params.title} />
           <View style={styles.content}>
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
                <View style={styles.chunkList}>
                  {chunkTexts.map((chunkValue, index) => {
                    const isActiveChunk = index === Math.max(0, Math.min(currentChunkIndex, chunkTexts.length - 1));

                    return (
                      <TouchableOpacity
                        key={`${index}-${chunkValue.slice(0, 24)}`}
                        activeOpacity={0.85}
                        disabled={controlsDisabled}
                        onPress={() => handleChunkPress(index)}
                        onLayout={(event) => {
                          chunkLayoutMapRef.current[index] = {
                            y: event.nativeEvent.layout.y,
                            height: event.nativeEvent.layout.height,
                          };

                          if (index === Math.max(0, Math.min(currentChunkIndex, chunkTexts.length - 1))) {
                            ensureChunkInView(index);
                          }
                        }}
                        style={[styles.chunkRow, isActiveChunk && styles.chunkRowActive]}
                      >
                        <View style={[styles.chunkAccent, isActiveChunk && styles.chunkAccentActive]} />
                        <Text style={[styles.chunkText, isActiveChunk && styles.chunkTextActive]}>
                          {chunkValue}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {chunkTexts.length === 0 && (
                    <Text style={styles.emptyChunkText}>No readable content found for this chapter.</Text>
                  )}
                </View>
              </ScrollView>
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
          <View style={styles.topRow}>
            <TouchableOpacity onPress={downloadCurrentTextWithPicker} disabled={controlsDisabled} style={[styles.iconButton, controlsDisabled && styles.disabled]}>
              <Ionicons name={isDownloading ? 'sync' : 'download'} size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleIndexOpen} disabled={controlsDisabled} style={[styles.iconButton, controlsDisabled && styles.disabled]}>
              <Ionicons name="menu" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <View style={styles.bottomRow}>
            <TouchableOpacity style={[styles.playButton, controlsDisabled && styles.disabled]} onPress={togglePlayPause} disabled={controlsDisabled}>
              {isDownloading ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={50} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View> 

        {/* REFACTORED BOTTOM SHEET SECTION */}
        <BottomSheet
          ref={bottomSheetRef}
          index={0}
          snapPoints={snapPoints}
          enablePanDownToClose={true}
          backgroundStyle={{ backgroundColor: '#1A1A1A' }}
          handleIndicatorStyle={{ backgroundColor: '#fff' }}
        >
          <ChapterIndex 
            chapters={bookData?.chapters}
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
  mainWrapper: { flex: 1, backgroundColor: '#121212' },
  safeAreaTop: { flex: 1 },
  content: { flex: 1 },
  scrollPadding: { paddingBottom: '25%', paddingHorizontal: 16, paddingTop: 12 },
  chunkList: { gap: 8 },
  chunkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
  },
  chunkRowActive: {
    backgroundColor: '#1D1D1D',
  },
  chunkAccent: {
    width: 3,
    borderRadius: 2,
    marginRight: 10,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  chunkAccentActive: {
    backgroundColor: '#FFFFFF',
  },
  chunkText: {
    flex: 1,
    color: '#BDBDBD',
    fontSize: 18,
    lineHeight: 28,
    fontFamily: 'Georgia',
  },
  chunkTextActive: {
    color: '#FFFFFF',
  },
  emptyChunkText: {
    color: '#8F8F8F',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 20,
  },
  staticTab: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
    backgroundColor: '#050505cb',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#414141', width: '100%', marginBottom: -20 },
  bottomRow: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  playButton: { marginTop: -5 },
  iconButton: { padding: 8 },
  disabled: { opacity: 0.45 },
  
});