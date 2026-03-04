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
      if (nextProgress !== null) {
        setDragProgress(nextProgress);
      }
    },
    onPanResponderMove: (event) => {
      const nextProgress = progressWithPosition(event.nativeEvent.locationX);
      if (nextProgress !== null) {
        setDragProgress(nextProgress);
      }
    },
    onPanResponderRelease: (event) => {
      const nextProgress = progressWithPosition(event.nativeEvent.locationX);
      if (nextProgress !== null) {
        onSeek(nextProgress);
      }
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
        <View style={[styles.filledTrack, { width: `${displayedProgress * 100}%` }]} />
        <View style={[styles.knob, { left: knobLeft - 7 }]} />
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
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  text: {
    color: '#E0E0E0',
    fontSize: 11,
  },
  track: {
    height: 16,
    justifyContent: 'center',
    position: 'relative',
  },
  filledTrack: {
    position: 'absolute',
    left: 0,
    top: 7,
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  knob: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
});
