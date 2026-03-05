import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'dark'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.tint,
        tabBarInactiveTintColor: '#666666', // Darkened the inactive state a bit
        headerShown: false,
        tabBarButton: HapticTab,
        
        // 1. The Darkened Floating Glass Background
        tabBarBackground: () => (
          <View style={styles.glassContainer}>
            <BlurView
              tint="dark"
              intensity={100} // Maxed out the blur
              style={StyleSheet.absoluteFill}
            />
            {/* This extra layer explicitly darkens the glass further */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
          </View>
        ),

        // 2. The Floating Dimensions & Shadows
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 30 : 20, // Lifts it off the bottom screen edge
          left: 20,  // Pinches it in from the left
          right: 20, // Pinches it in from the right
          height: 64, // Slightly shorter for a sleek pill look
          borderRadius: 32, // Creates the perfect rounded pill shape
          backgroundColor: 'transparent', 
          borderTopWidth: 0,
          elevation: 10, // Shadow for Android
          shadowColor: '#000000', // Shadow for iOS
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.8,
          shadowRadius: 15,
        },
        
        tabBarLabelStyle: {
          fontWeight: '600',
          fontSize: 11,
          paddingBottom: 14, // Adjusts text position in the shorter bar
        },
        tabBarItemStyle: {
          paddingVertical: 8, // Centers the icon/text combo
        }
      }}>
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="magnifyingglass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

// 3. We need this style so the BlurView respects the border radius of the pill
const styles = StyleSheet.create({
  glassContainer: {
    flex: 1,
    borderRadius: 64,
    overflow: 'hidden', // This forces the blur to stay inside the rounded corners
  }
});