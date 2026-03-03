import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';

interface Chapter {
  title?: string;
  href: string;
}

interface ChapterIndexProps {
  chapters: Chapter[];
  currentChapterNo: number;
  onSelectChapter: (index: number) => void;
}

const ChapterIndex = ({ chapters, currentChapterNo, onSelectChapter }: ChapterIndexProps) => {
  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Chapters</Text>
      <BottomSheetFlatList
        data={chapters || []}
        // FIX: Added string type for index and Chapter for _ (item)
        keyExtractor={(_: Chapter, index: number) => index.toString()} 
        
        // FIX: Explicitly typed the renderItem parameters
        renderItem={({ item, index }: { item: Chapter; index: number }) => {
          const isActive = currentChapterNo === index;
          return (
            <TouchableOpacity 
              style={[styles.item, isActive && styles.activeItem]} 
              onPress={() => onSelectChapter(index)}
            >
              <Text style={[styles.itemText, isActive && styles.activeText]}>
                {item.title || `Chapter ${index + 1}`}
              </Text>
              {isActive && (
                <View style={styles.activeIndicator} />
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listPadding}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 10,
  },
  listPadding: {
    paddingBottom: 40,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  activeItem: {
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginHorizontal: -10,
  },
  itemText: {
    color: '#B3B3B3',
    fontSize: 16,
  },
  activeText: {
    color: '#1DB954', // Spotify Green
    fontWeight: 'bold',
  },
  activeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1DB954',
  },
});

export default ChapterIndex;