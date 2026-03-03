import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle, TextStyle } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system'; // SDK 54 Object-based API
import { Ionicons } from '@expo/vector-icons';


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
        <Ionicons name="add" size={32} color="#444" />
        <Text style={styles.label}>Add Book</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 100,
    marginBottom: 32,
  } as ViewStyle,
  dashedBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  } as ViewStyle,
  label: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  } as TextStyle,
});