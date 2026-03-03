import React, { useEffect, useState , useMemo} from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native'; // Added Text/ScrollView for basic display
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import Screenheader from '@/components/Screenheader.component';
import { getChapterText, parseEpub } from '@/utils/epubparser';
import JSZip from 'jszip';
import { File } from 'expo-file-system';
import RenderHTML from 'react-native-render-html';
import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
export default function Reader() {
  const params = useLocalSearchParams<{ 
    title?: string; 
    id?: string; 
    author?: string; 
    cover?: string; 
    uri?: string 
  }>();

  const [bookData, setBookData] = useState<any>(null);
  const [currentChapterNo, setCurrentChapterNo] = useState(20);
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null); // Initialized to null
  const [currentHtml, setCurrentHtml] = useState<string>(''); // Added state to hold the text
  const tagsStyles = useMemo(() => ({
    body: {
      color: '#E0E0E0',
      fontSize: 18,
      lineHeight: 26,
      fontFamily: 'Georgia',
    },
    h1: {
      color: '#FFFFFF',
      marginBottom: 20,
    },
       h5: {
      color: '#FFFFFF',
      marginBottom: 20,
    },
    p: {
      marginBottom: 15,
    }
  }), []);
  const classesStyles = {
  // Main container style
  calibre: {
    paddingHorizontal: 5,
  },
  // Links/Interactions
  calibre1: {
    color: '#3498db',
    textDecorationLine: 'underline',
  },
  calibre3: {
    fontStyle: 'italic',
  },
  calibre4: {
    fontWeight: 'bold',
  },
  // Paragraph variants (The 'p' classes)
  p: {
    textAlign: 'justify',
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 10,
  },
  p3: {
    textAlign: 'center',
    marginBottom: 10,
  },
  p6: {
    fontWeight: 'bold',
    textAlign: 'justify',
  },
  // Text size/weight spans (The 't' classes)
  t: { fontSize: 18 },
  t2: { fontSize: 24, fontWeight: 'bold' },
  t4: { fontSize: 28, fontWeight: 'bold', fontFamily: 'Georgia' },
  t12: { fontSize: 12 },
  t14: { fontWeight: 'bold' },
} as const;
  // 1. Handle Lifecycle (Mount/Unmount)
  useEffect(() => {
    console.log('Reader opened with Params:', params);
    return () => {
      console.log('Reader component destroyed (unmounted)');
    };
  }, []);

  // 2. Define loadBook logic
  const loadBook = async () => {
    if (params.uri) {
      try {
        const file = new File(params.uri);
        const base64Data = await file.base64();
        const loadedZip = await JSZip.loadAsync(base64Data, { base64: true });
        setZipInstance(loadedZip); 
        const structuredBook = await parseEpub(loadedZip);
        setBookData(structuredBook);
        console.log('Successfully parsed book:', structuredBook);
      } catch (err) {
        console.error("Failed to parse in Reader:", err);
      }
    }
  };

  // 3. Trigger loadBook on URI change
  useEffect(() => {
    loadBook();
  }, [params.uri]);

  // FIX: Fetch the actual text when bookData or chapter index changes
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

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: params.title || 'Reader', 
          headerShown: false 
        }} 
      />
      
      <Screenheader title={params.title} />

      <View style={styles.content} >
        <ScrollView>
          <RenderHTML
            contentWidth={width}
            source={{ html: currentHtml }}
            classesStyles={classesStyles}
            tagsStyles={tagsStyles}

            // This is key for your audiobook: it ignores 
            // the hardcoded styles from the EPUB file
            // enableCSSInlineProcessing={false} 
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c0c',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
});