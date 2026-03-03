import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native'; // Added Text/ScrollView for basic display
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import Screenheader from '@/components/Screenheader.component';
import { getChapterText, parseEpub } from '@/utils/epubparser';
import JSZip from 'jszip';
import { File } from 'expo-file-system';

export default function Reader() {
  const params = useLocalSearchParams<{ 
    title?: string; 
    id?: string; 
    author?: string; 
    cover?: string; 
    uri?: string 
  }>();

  const [bookData, setBookData] = useState<any>(null);
  const [currentChapterNo, setCurrentChapterNo] = useState(0);
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null); // Initialized to null
  const [currentHtml, setCurrentHtml] = useState<string>(''); // Added state to hold the text

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
          <Text style={{ color: 'white' }}>
            {/* Display the state variable, not the function call */}
            {currentHtml || "Loading chapter..."}
          </Text>
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