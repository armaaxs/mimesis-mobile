import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  Switch,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; // <-- Imported Ionicons

export default function Settings() {
  const router = useRouter();
  
  // State for toggleable settings
  const [isAmoledDark, setIsAmoledDark] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(false);

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => console.log('Logged out') }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Profile', 
          headerBackButtonDisplayMode: 'minimal' 
        }} 
      />
      <View style={styles.headerRow}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* ACCOUNT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.groupBlock}>
            <TouchableOpacity style={[styles.itemRow, styles.bottomBorder]}>
              <View style={styles.itemLeft}>
                <Ionicons name="person" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>Profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#666666" />
            </TouchableOpacity>
            
            {/* <TouchableOpacity style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Ionicons name="cloud-upload" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>Sync Library Progress</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#666666" />
            </TouchableOpacity> */}
          </View>
        </View>

        {/* READING EXPERIENCE SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reading Experience</Text>
          <View style={styles.groupBlock}>
            <TouchableOpacity style={[styles.itemRow, styles.bottomBorder]}>
              <View style={styles.itemLeft}>
                <Ionicons name="text" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>Typography & Font Size</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#666666" />
            </TouchableOpacity>

            <View style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Ionicons name="moon" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>True AMOLED Black</Text>
              </View>
              <Switch 
                value={isAmoledDark} 
                onValueChange={setIsAmoledDark}
                trackColor={{ false: '#333333', true: '#00bca3' }}
                thumbColor={'#ffffff'}
              />
            </View>
          </View>
        </View>

        {/* DATA & STORAGE SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Storage</Text>
          <View style={styles.groupBlock}>
            <View style={[styles.itemRow, styles.bottomBorder]}>
              <View style={styles.itemLeft}>
                <Ionicons name="wifi" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>Download over Wi-Fi Only</Text>
              </View>
              <Switch 
                value={wifiOnly} 
                onValueChange={setWifiOnly}
                trackColor={{ false: '#333333', true: '#00bca3' }}
                thumbColor={'#ffffff'}
              />
            </View>

            <TouchableOpacity style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Ionicons name="trash" size={20} color="#00ffb7" style={styles.itemIcon} />
                <Text style={styles.itemText}>Clear Image Cache</Text>
              </View>
              <Text style={styles.itemValue}>142 MB</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ABOUT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.groupBlock}>
            <TouchableOpacity style={[styles.itemRow, styles.bottomBorder]}>
              <View style={styles.itemLeft}>
                <Ionicons name="information-circle" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>App Info</Text>
              </View>
              <Text style={styles.itemValue}>v1.0.0</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.itemRow} onPress={handleLogout}>
              <View style={styles.itemLeft}>
                <Ionicons name="log-out" size={20} color="#666666" style={styles.itemIcon} />
                <Text style={styles.itemText}>Log Out</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerRow: {
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    color: '#ffffff',
    fontFamily: 'Georgia',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 60,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: '#00bca3',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginLeft: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: 'Georgia',
  },
  groupBlock: {
    backgroundColor: '#111111', 
    borderRadius: 16,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  bottomBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222222',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIcon: {
    marginRight: 14,
    width: 24, 
    textAlign: 'center',
  },
  itemText: {
    color: '#F0F0F0',
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
  itemValue: {
    color: '#888888',
    fontSize: 14,
    fontFamily: 'Georgia',
  },
});