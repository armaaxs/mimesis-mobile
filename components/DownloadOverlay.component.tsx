import React from 'react';
import { 
  ActivityIndicator, 
  Modal, 
  StyleSheet, 
  Text, 
  View, 
  Platform, 
  TouchableWithoutFeedback 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

type Props = {
  visible: boolean;
  message?: string;
  onClose: () => void; // This must be a function that sets your state to false
};

export default function DownloadOverlay({ visible, message = 'Processing...', onClose }: Props) {
  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="fade" 
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* 1. This covers the entire screen and catches the background tap */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          
          {/* 2. This inner view stops the tap from closing the modal when 
              clicking the card itself. Important: Don't use TouchableWithoutFeedback 
              on the card unless you want it to close. */}
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.cardContainer}>
              <BlurView 
                intensity={Platform.OS === 'ios' ? 40 : 80} 
                tint="dark" 
                style={styles.glassCard}
              >
                <View style={styles.content}>
                  <View style={styles.iconContainer}>
                    <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
                    <Ionicons name="cloud-download-outline" size={32} color="#fff" />
                  </View>
                  
                  <Text style={styles.title}>Saving</Text>
                  <Text style={styles.message}>{message}</Text>
                </View>
              </BlurView>
            </View>
          </TouchableWithoutFeedback>

        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', 
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: 200,
    borderRadius: 28,
    overflow: 'hidden',
  },
  glassCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)', 
    padding: 24,
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinner: {
    position: 'absolute',
    transform: [{ scale: 1.8 }],
    opacity: 0.5,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  message: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    textAlign: 'center',
  },
});