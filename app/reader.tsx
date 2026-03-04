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
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // New Import
import RenderHTML from 'react-native-render-html';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChapterIndex from './bookIndex'; // Importing the ChapterIndex component

const { width } = Dimensions.get('window');
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

  // Bottom Sheet Ref and Snap Points
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['1%', '80%'], []);

  const tagsStyles = useMemo(() => ({
    body: { color: '#E0E0E0', fontSize: 18, lineHeight: 26, fontFamily: 'Georgia' },
    h1: { color: '#FFFFFF', marginBottom: 20 },
    h5: { color: '#FFFFFF', marginBottom: 20 },
    p: { marginBottom: 15 }
  }), []);

  const classesStyles = {
    calibre: { paddingHorizontal: 5 },
    calibre1: { color: '#3498db', textDecorationLine: 'underline' },
    calibre3: { fontStyle: 'italic' },
    calibre4: { fontWeight: 'bold' },
    p: { textAlign: 'justify', fontSize: 18, lineHeight: 26, marginBottom: 10 },
    p3: { textAlign: 'center', marginBottom: 10 },
    p6: { fontWeight: 'bold', textAlign: 'justify' },
    t: { fontSize: 18 },
    t2: { fontSize: 24, fontWeight: 'bold' },
    t4: { fontSize: 28, fontWeight: 'bold', fontFamily: 'Georgia' },
    t12: { fontSize: 12 },
    t14: { fontWeight: 'bold' },
  } as const;

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
    currentChunkIndex,
    totalChunks,
    seekToChunk,
    downloadCurrentTextWithPicker,
    togglePlayPause,
  } = useTTSQueuePlayer({
    text: rawChapterText,
    chunkSize: 200,
  });

  const controlsDisabled = !!isDownloading;
  const seekerProgress = totalChunks <= 1 ? 0 : currentChunkIndex / (totalChunks - 1);

  const handleSeek = useCallback((progress: number) => {
    if (controlsDisabled || totalChunks <= 0) {
      return;
    }

    const nextChunkIndex = Math.round(progress * Math.max(totalChunks - 1, 0));
    void seekToChunk(nextChunkIndex);
  }, [controlsDisabled, seekToChunk, totalChunks]);

  


return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.mainWrapper}>
        <Stack.Screen options={{ title: params.title || 'Reader', headerShown: false }} />
        
        <SafeAreaView style={styles.safeAreaTop}>
           <Screenheader title={params.title} />
           <View style={styles.content}>
              <ScrollView contentContainerStyle={styles.scrollPadding}>
                <RenderHTML
                  contentWidth={width}
                  source={{ html: currentHtml }}
                  classesStyles={classesStyles}
                  tagsStyles={tagsStyles}
                />
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
  scrollPadding: { paddingBottom: '25%' },
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