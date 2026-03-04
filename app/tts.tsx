import { useTTSQueuePlayer } from '@/hooks/use-tts-queue-player';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { TouchableOpacity } from 'react-native';

export default function TTSButton({ text }: { text: string }) {
    const { isPlaying, isPaused, downloadCurrentTextToMemory } = useTTSQueuePlayer({
    text,
    chunkSize: 200,
  });

  return (
    <TouchableOpacity onPress={downloadCurrentTextToMemory}>
      <Ionicons name={isPlaying && !isPaused ? 'pause' : 'play'} size={24} color="#fff" />
    </TouchableOpacity>
  );
}