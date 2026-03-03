import React, { useRef } from 'react';
import { Button, TouchableOpacity, View } from 'react-native';
import {
  useTextToSpeech,
  KOKORO_MEDIUM,
  KOKORO_VOICE_AM_MICHAEL,
} from 'react-native-executorch';
import { AudioContext } from 'react-native-audio-api';
import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Chunks text into segments of up to maxChars.
 * Prioritizes breaking at sentence endings to maintain AI voice naturalness.
 */
function chunkText(text: string, maxChars: number = 500): string[] {
  // Clean up redundant whitespace and newlines
  const sanitizedText = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  
  let currentIndex = 0;

  while (currentIndex < sanitizedText.length) {
    // Determine the boundary for the current search
    let end = currentIndex + maxChars;

    // If we are at the end of the text, take the rest
    if (end >= sanitizedText.length) {
      chunks.push(sanitizedText.substring(currentIndex).trim());
      break;
    }

    // Attempt to find the best punctuation to break at, within the limit
    const segment = sanitizedText.substring(currentIndex, end);
    let splitIndex = -1;

    // Hierarchy of break points: Sentence > Clause > Phrase > Word
    const punctuationMarks = [". ", "? ", "! ", "; ", ": ", ", ", " "];

    for (const mark of punctuationMarks) {
      const lastOccur = segment.lastIndexOf(mark);
      if (lastOccur !== -1) {
        // Move splitIndex past the punctuation (except for space-only)
        splitIndex = lastOccur + (mark === " " ? 0 : 1);
        break;
      }
    }

    // If no punctuation/space found (rare), force split at maxChars
    if (splitIndex <= 0) {
      splitIndex = maxChars;
    }

    const finalChunk = sanitizedText.substring(currentIndex, currentIndex + splitIndex).trim();
    if (finalChunk.length > 0) {
      chunks.push(finalChunk);
    }

    // Advance the pointer
    currentIndex += splitIndex;
  }

  return chunks;
}

// --- Usage Example for Mimesis ---




export default function TTSButton({ text }: { text: string }) {
  const tts = useTextToSpeech({
    model: KOKORO_MEDIUM,
    voice: KOKORO_VOICE_AM_MICHAEL,
  });
  const contextRef = useRef(new AudioContext({ sampleRate: 24000 }));
  const generateStream = async (text:string) => {
    const ctx = contextRef.current;
    await tts.stream({
      text:text,
      onNext: async (chunk) => {
        return new Promise((resolve) => {
          const buffer = ctx.createBuffer(1, chunk.length, 24000);
          buffer.getChannelData(0).set(chunk);

          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.onEnded = () => resolve();
          source.start();
        });
      },
    });
  };
  return (
    <TouchableOpacity onPress={
      async () => {
const segments = chunkText(text, 500);
    for (const chunk of segments) {
        console.log(`${chunk.slice(0, 20)}...`);
        // This will now WAIT until the stream is 'done' before moving to the next
        await generateStream(chunk); 
    }
    console.log("Book finished!");
}}>
      <Ionicons name="play" size={24} color="#fff" />
    </TouchableOpacity>
  );
}


