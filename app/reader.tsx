import React, { useEffect, useState, useMemo, useRef } from 'react'; // Added useRef
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import Screenheader from '@/components/Screenheader.component';
import { getChapterText, parseEpub } from '@/utils/epubparser';
import JSZip from 'jszip';
import { File } from 'expo-file-system';
import RenderHTML from 'react-native-render-html';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet'; // New Import
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // New Import
import ChapterIndex from './bookIndex'; // Importing the ChapterIndex component
const { width } = Dimensions.get('window');

export default function Reader() {
  const router = useRouter();
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

  const loadBook = async () => {
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
  };

  useEffect(() => { loadBook(); }, [params.uri]);

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
          <View style={styles.topRow}>
            <TouchableOpacity onPress={() => {}}>
              <Ionicons name="play-back" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleIndexOpen}>
              <Ionicons name="menu" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <View style={styles.bottomRow}>
            <TouchableOpacity style={styles.playButton} onPress={() => {}}>
              <Ionicons name="pause-circle" size={50} color="#fff" />
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
    height: '15%',
    backgroundColor: '#050505cb',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 15,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#414141', width: '100%', marginBottom: -20 },
  bottomRow: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  playButton: { marginTop: -5 },
});