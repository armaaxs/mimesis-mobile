import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle, TextStyle } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system'; // SDK 54 Object-based API
import { Ionicons } from '@expo/vector-icons';
import { AppPalette } from '@/constants/theme';


interface AddBookCardProps {
  onBookAdded: (bookPath: string, fileName: string) => void;
}

export const AddBookCard: React.FC<AddBookCardProps> = ({ onBookAdded }) => {
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/epub+zip',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        
        // Use SDK 54 File API to move to permanent Documents folder
        const sourceFile = new File(asset.uri);
        const destFile = new File(Paths.document, asset.name);

        if (destFile.exists) await destFile.delete();
        await sourceFile.copy(destFile);
        await sourceFile.delete();
        onBookAdded(destFile.uri, asset.name);
      }
    } catch (err) {
      console.error('Error picking document:', err);
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={pickDocument} activeOpacity={0.6}>
      <View style={styles.dashedBox}>
        <Ionicons name="add" size={32} color={AppPalette.accent} />
        <Text style={styles.label}>Add Book</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 132,
    marginBottom: 32,
  } as ViewStyle,
  dashedBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderStyle: 'dashed',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AppPalette.surface,
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  } as ViewStyle,
  label: {
    fontFamily: 'Georgia',
    fontSize: 14,
    fontWeight: '700',
    color: AppPalette.text,
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  } as TextStyle,
});
