import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

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
  let book: BookData | null = null;
  try {
    if (!rawBook) {
      book = null;
    } else if (typeof rawBook === 'string') {
      book = JSON.parse(rawBook) as BookData;
    } else {
      book = rawBook as BookData;
    }
  } catch (e) {
    console.warn('Failed to parse book route param', e);
    book = null;
  }

  console.log('[BookDescription] received book param ->', book ? { id: book.id, title: book.title } : null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  // If no book data is passed (for testing/safety)
  if (!book) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={{ padding: 20 }}>
          <Text style={{ color: '#fff' }}>No book data provided.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Data Cleaning ---
  const coverUrl = book.formats['image/jpeg'];
  const rawAuthor = book.authors[0]?.name || 'Unknown Author';
  const displayAuthor = rawAuthor.includes(',') 
    ? rawAuthor.split(',').reverse().join(' ').trim() 
    : rawAuthor;

  // Clean up the Gutenberg auto-generated text warning
  const cleanSummary = book.summaries[0]?.replace(
    /\(This is an automatically generated summary\.\)/g, 
    ''
  ).trim() || "No summary available for this title.";

  const formatNumber = (num: number) => num.toLocaleString('en-US');
  
  // Take only the first 4 subjects for a clean UI
  const displayTags = book.subjects.slice(0, 4).map(sub => sub.split(' -- ')[0]);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />
      
      {/* Top Navigation */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="bookmark-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Hero Section: Cover, Title, Author */}
        <View style={styles.heroSection}>
          <View style={styles.coverShadow}>
            <Image source={{ uri: coverUrl }} style={styles.coverImage} />
          </View>
          <Text style={styles.title}>{book.title}</Text>
          <Text style={styles.author}>{displayAuthor}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatNumber(book.download_count)}</Text>
            <Text style={styles.statLabel}>Downloads</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{book.languages[0]?.toUpperCase()}</Text>
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
          <TouchableOpacity style={styles.primaryButton}>
            <Ionicons name="book" size={20} color="#000" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Read Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton}>
            <Ionicons name="download-outline" size={24} color="#FFF" />
          </TouchableOpacity>
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
            {displayTags.map((tag, index) => (
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
    backgroundColor: '#0F0F0F',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 10,
  },
  coverShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
    marginBottom: 24,
  },
  coverImage: {
    width: width * 0.55,
    height: (width * 0.55) * 1.5, // Standard book aspect ratio
    borderRadius: 12,
    backgroundColor: '#222',
  },
  title: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  author: {
    color: '#00d8b4', // Brand accent color
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
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 30,
    gap: 12, // Requires RN 0.71+
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#00d8b4', // High contrast accent
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
  },
  primaryButtonText: {
    color: '#000', // Dark text on bright button
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
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryText: {
    color: '#CCC',
    fontSize: 15,
    lineHeight: 24,
  },
  readMoreText: {
    color: '#00d8b4',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tagText: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '500',
  },
});