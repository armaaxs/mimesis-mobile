import React, { useCallback, useMemo, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

type ChunkSeekerProps = {
  progress: number;
  currentChunk: number;
  totalChunks: number;
  disabled?: boolean;
  onSeek: (progress: number) => void;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Constants for easy adjustment
const TRACK_HEIGHT = 20; // Taller area for easier finger grabbing
const BAR_HEIGHT = 4;    // The actual visible line thickness
const KNOB_SIZE = 14;

export default function ChunkSeeker({
  progress,
  currentChunk,
  totalChunks,
  disabled = false,
  onSeek,
}: ChunkSeekerProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const normalizedProgress = clamp(progress, 0, 1);
  const displayedProgress = dragProgress ?? normalizedProgress;

  const progressWithPosition = useCallback((xPosition: number) => {
    if (disabled || trackWidth <= 0) {
      return null;
    }
    return clamp(xPosition / trackWidth, 0, 1);
  }, [disabled, trackWidth]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (event) => {
      const nextProgress = progressWithPosition(event.nativeEvent.locationX);
      if (nextProgress !== null) setDragProgress(nextProgress);
    },
    onPanResponderMove: (event) => {
      const nextProgress = progressWithPosition(event.nativeEvent.locationX);
      if (nextProgress !== null) setDragProgress(nextProgress);
    },
    onPanResponderRelease: (event) => {
      const nextProgress = progressWithPosition(event.nativeEvent.locationX);
      if (nextProgress !== null) onSeek(nextProgress);
      setDragProgress(null);
    },
    onPanResponderTerminate: () => {
      setDragProgress(null);
    },
  }), [disabled, onSeek, progressWithPosition]);

  const knobLeft = trackWidth * displayedProgress;

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.row}>
        <Text style={styles.text}>{totalChunks > 0 ? `${currentChunk + 1}` : '0'}</Text>
        <Text style={styles.text}>{totalChunks}</Text>
      </View>

      <View
        style={styles.track}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        {/* Unfilled Background Line */}
        <View style={styles.unfilledTrack} />

        {/* Filled Progress Line */}
        <View style={[styles.filledTrack, { width: `${displayedProgress * 100}%` }]} />

        {/* Interaction Knob */}
        <View 
          style={[
            styles.knob, 
            { left: knobLeft - KNOB_SIZE / 2 }
          ]} 
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  disabled: {
    opacity: 0.45,
  },
  row: {
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  text: {
    color: '#E0E0E0',
    fontSize: 11,
  },
  track: {
    height: TRACK_HEIGHT,
    justifyContent: 'center', // This handles vertical centering of all absolute children
    position: 'relative',
    width: '100%',
  },
  unfilledTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BAR_HEIGHT / 2,
  },
  filledTrack: {
    position: 'absolute',
    left: 0,
    height: BAR_HEIGHT,
    backgroundColor: '#0099a1',
    borderRadius: BAR_HEIGHT / 2,
    zIndex: 1, // Ensure it stays above unfilled
  },
  knob: {
    position: 'absolute',
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: '#0099a1',
    zIndex: 2, // Ensure it stays above filled track
    // Shadow for depth (optional but recommended for sleekness)
    shadowColor: '#ff4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
});