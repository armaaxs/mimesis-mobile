import { StyleSheet, Text, View, TouchableOpacity } from 'react-native'
import React from 'react'
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';    



interface ScreenHeaderProps {
  title?: string; // The '?' means it is optional
}

const Screenheader: React.FC<ScreenHeaderProps> = ({ title }) => {
    const params = useLocalSearchParams<{ title?: string;}>();
    const router = useRouter();
  return (
          <View style={styles.customHeader}>
            <TouchableOpacity 
              onPress={() => router.back()} // This "pops" the screen
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
    
            <View style={styles.titleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {title || params.title}
              </Text>
            </View>
          </View>
  )
}
export default Screenheader;

const styles = StyleSheet.create({
      customHeader: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1A1A1A', // Very subtle Medium-style divider
  },
  backButton: {
    padding: 8,
    marginLeft: -8, // Align arrow perfectly with content
  },
  titleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    color: '#888', // Dimmed out title like Medium
    fontSize: 14,
    fontFamily: 'System', // UI uses Sans
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
})