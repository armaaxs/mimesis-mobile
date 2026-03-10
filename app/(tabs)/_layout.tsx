import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AppPalette, Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'dark'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.tint,
        tabBarInactiveTintColor: AppPalette.textSubtle,
        headerShown: false,
        tabBarButton: HapticTab,
        
        tabBarBackground: () => (
          <View style={styles.glassContainer}>
            <BlurView
              tint="light"
              intensity={55}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.overlay} />
          </View>
        ),

        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 30 : 20,
          left: 20,
          right: 20,
          height: 64,
          borderRadius: 32,
          backgroundColor: 'transparent', 
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: AppPalette.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.22,
          shadowRadius: 18,
          borderWidth: 1,
          borderColor: 'rgba(180, 157, 123, 0.32)',
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

const styles = StyleSheet.create({
  glassContainer: {
    flex: 1,
    borderRadius: 64,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(251, 248, 241, 0.88)',
  },
});
