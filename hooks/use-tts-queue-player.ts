import { Buffer } from 'buffer';
import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioContext } from 'react-native-audio-api';
import { useTextToSpeech } from 'react-native-executorch';
import {
  DEFAULT_EXECUTORCH_TTS_MODEL,
  DEFAULT_EXECUTORCH_TTS_VOICE,
  DEFAULT_TTS_SAMPLE_RATE,
} from '../services/tts/config';
import { chunkText } from '../utils/chunkText';
import { DeepPhonemizer } from 'expo-deep-phonemizer';
type PlaybackResult = 'ended' | 'stopped';

type PlayerState = {
  isPlaying: boolean;
  isPaused: boolean;
};

type RuntimeState = {
  sessionId: number;
  chunkTexts: string[];
  audioQueue: Record<number, Float32Array>;
  generationDone: boolean;
  nextChunkToGenerate: number;
  totalGeneratedSamples: number;
  currentChunkIndex: number;
  currentSource: any;
  isStarting: boolean;
  generationPromise: Promise<void> | null;
  generationPromiseSession: number | null;
  playbackPromise: Promise<void> | null;
  playbackPromiseSession: number | null;
};

export type UseTTSQueuePlayerOptions = {
  text: string;
  downloadFileBaseName?: string;
  chunkSize?: number;
  chunkPauseMs?: number;
  playbackPrefetchAheadChunks?: number;
  playbackKeepBehindChunks?: number;
  queueTargetMemoryMB?: number;
};

export type TTSMemoryStats = {
  queuedChunks: number;
  queuedSamples: number;
  queuedBytes: number;
  queuedSeconds: number;
  generatedSamplesTotal: number;
  generatedBytesTotal: number;
};

export type UseTTSQueuePlayerResult = {
  isPlaying: boolean;
  isPaused: boolean;
  isDownloading: boolean;
  chunkTexts: string[];
  currentChunkIndex: number;
  totalChunks: number;
  memoryStats: TTSMemoryStats;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  togglePlayPause: () => Promise<void>;
  seekToChunk: (chunkIndex: number) => Promise<void>;
  reset: () => Promise<void>;
  downloadCurrentTextToMemory: () => Promise<ChapterAudioDownloadResult>;
  downloadCurrentTextWithPicker: () => Promise<ChapterAudioPickedSaveResult>;
};

export type ChapterAudioDownloadResult = {
  uri: string;
  fileName: string;
  chunkCount: number;
  totalSamples: number;
  sampleRate: number;
  audio?: Float32Array;
};

export type ChapterAudioPickedSaveResult = ChapterAudioDownloadResult & {
  cacheUri: string;
  savedWithPicker: boolean;
};
export function useTTSQueuePlayer({
  text,
  downloadFileBaseName,
  chunkSize = 200,
  chunkPauseMs = 140,
  playbackPrefetchAheadChunks = 6,
  playbackKeepBehindChunks = 2,
  queueTargetMemoryMB = 96,
}: UseTTSQueuePlayerOptions): UseTTSQueuePlayerResult {
  const DOWNLOAD_CHUNK_SIZE_MULTIPLIER = 4;
  const DOWNLOAD_MAX_CONCURRENCY = 2;
  const DOWNLOAD_CACHE_MAX_BYTES = 16 * 1024 * 1024;
  const DOWNLOAD_PARALLEL_BATCH_CHUNKS = 12;

  const tts = useTextToSpeech({
    model: DEFAULT_EXECUTORCH_TTS_MODEL,
    voice: DEFAULT_EXECUTORCH_TTS_VOICE,
  });

  const ttsRef = useRef(tts);
  const audioContextRef = useRef(new AudioContext({ sampleRate: DEFAULT_TTS_SAMPLE_RATE }));
  const previousTextRef = useRef(text);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [chunkTextsState, setChunkTextsState] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [memoryStats, setMemoryStats] = useState<TTSMemoryStats>({
    queuedChunks: 0,
    queuedSamples: 0,
    queuedBytes: 0,
    queuedSeconds: 0,
    generatedSamplesTotal: 0,
    generatedBytesTotal: 0,
  });

  const playerStateRef = useRef<PlayerState>({
    isPlaying: false,
    isPaused: false,
  });

  const runtimeRef = useRef<RuntimeState>({
    sessionId: 0,
    chunkTexts: [],
    audioQueue: {},
    generationDone: true,
    nextChunkToGenerate: 0,
    totalGeneratedSamples: 0,
    currentChunkIndex: 0,
    currentSource: null,
    isStarting: false,
    generationPromise: null,
    generationPromiseSession: null,
    playbackPromise: null,
    playbackPromiseSession: null,
  });
  const downloadChunkAudioCacheRef = useRef<Map<string, Float32Array>>(new Map());
  const downloadChunkAudioCacheBytesRef = useRef(0);
  const downloadRequestIdRef = useRef(0);
  const downloadParallelEnabledRef = useRef(true);

  useEffect(() => {
    ttsRef.current = tts;
  }, [tts]);

  const setPlayerState = useCallback((nextState: PlayerState) => {
    playerStateRef.current = nextState;
    setIsPlaying(nextState.isPlaying);
    setIsPaused(nextState.isPaused);
  }, []);

  const sleep = useCallback((milliseconds: number) => {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }, []);

  const queueTargetBytes = Math.max(8, queueTargetMemoryMB) * 1024 * 1024;

  const normalizeChunks = useCallback((inputText: string) => {
    return chunkText(inputText, chunkSize)
      .map((chunkValue) => chunkValue.trim())
      .filter((chunkValue) => chunkValue.length > 0);
  }, [chunkSize]);

  const normalizeDownloadChunks = useCallback((inputText: string) => {
    // Moderate chunking reduces invocation overhead while avoiding huge allocations.
    const downloadChunkSize = Math.max(320, chunkSize * DOWNLOAD_CHUNK_SIZE_MULTIPLIER);
    return chunkText(inputText, downloadChunkSize)
      .map((chunkValue) => chunkValue.trim())
      .filter((chunkValue) => chunkValue.length > 0);
  }, [chunkSize]);

  const clearDownloadCache = useCallback(() => {
    downloadChunkAudioCacheRef.current.clear();
    downloadChunkAudioCacheBytesRef.current = 0;
  }, []);

  const setCachedDownloadChunk = useCallback((key: string, value: Float32Array) => {
    const existing = downloadChunkAudioCacheRef.current.get(key);
    if (existing) {
      downloadChunkAudioCacheBytesRef.current -= existing.length * Float32Array.BYTES_PER_ELEMENT;
      downloadChunkAudioCacheRef.current.delete(key);
    }

    downloadChunkAudioCacheRef.current.set(key, value);
    downloadChunkAudioCacheBytesRef.current += value.length * Float32Array.BYTES_PER_ELEMENT;

    while (
      downloadChunkAudioCacheBytesRef.current > DOWNLOAD_CACHE_MAX_BYTES
      && downloadChunkAudioCacheRef.current.size > 0
    ) {
      const oldestKey = downloadChunkAudioCacheRef.current.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }

      const oldestValue = downloadChunkAudioCacheRef.current.get(oldestKey);
      if (oldestValue) {
        downloadChunkAudioCacheBytesRef.current -= oldestValue.length * Float32Array.BYTES_PER_ELEMENT;
      }
      downloadChunkAudioCacheRef.current.delete(oldestKey);
    }
  }, []);

  const toSafeFileName = useCallback((value: string) => {
    return value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_')
      .slice(0, 96);
  }, []);

  const setPreparedChunks = useCallback((chunks: string[]) => {
    runtimeRef.current.chunkTexts = chunks;
    setChunkTextsState(chunks);
    setTotalChunks(chunks.length);
  }, []);

  const updateMemoryStats = useCallback(() => {
    const runtime = runtimeRef.current;
    const queuedAudioParts = Object.values(runtime.audioQueue);
    const queuedSamples = queuedAudioParts.reduce((sum, audioChunk) => sum + audioChunk.length, 0);
    const queuedBytes = queuedSamples * Float32Array.BYTES_PER_ELEMENT;

    setMemoryStats({
      queuedChunks: queuedAudioParts.length,
      queuedSamples,
      queuedBytes,
      queuedSeconds: queuedSamples / DEFAULT_TTS_SAMPLE_RATE,
      generatedSamplesTotal: runtime.totalGeneratedSamples,
      generatedBytesTotal: runtime.totalGeneratedSamples * Float32Array.BYTES_PER_ELEMENT,
    });
  }, []);

  const concatAudio = useCallback((audioParts: Float32Array[]) => {
    const totalLength = audioParts.reduce((sum, currentPart) => sum + currentPart.length, 0);
    const mergedAudio = new Float32Array(totalLength);
    let offset = 0;

    for (const currentPart of audioParts) {
      mergedAudio.set(currentPart, offset);
      offset += currentPart.length;
    }

    return mergedAudio;
  }, []);

  const encodeChunksToPcm16 = useCallback((audioChunks: Float32Array[]) => {
    const totalSamples = audioChunks.reduce((sum, chunkAudio) => sum + chunkAudio.length, 0);
    const pcm16 = new Int16Array(totalSamples);
    let sampleOffset = 0;

    for (const audioData of audioChunks) {
      for (let sampleIndex = 0; sampleIndex < audioData.length; sampleIndex += 1) {
        const sample = Math.max(-1, Math.min(1, audioData[sampleIndex]));
        pcm16[sampleOffset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        sampleOffset += 1;
      }
    }

    return pcm16;
  }, []);

  const buildWav16BitFromPcmBatches = useCallback((pcmBatches: Int16Array[], sampleRate: number) => {
    const channelCount = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const byteRate = sampleRate * channelCount * bytesPerSample;
    const blockAlign = channelCount * bytesPerSample;
    const totalSamples = pcmBatches.reduce((sum, batch) => sum + batch.length, 0);
    const dataSize = totalSamples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let dataOffset = 44;
    for (const pcmBatch of pcmBatches) {
      for (let sampleIndex = 0; sampleIndex < pcmBatch.length; sampleIndex += 1) {
        const int16Sample = pcmBatch[sampleIndex];
        view.setInt16(dataOffset, int16Sample, true);
        dataOffset += 2;
      }
    }

    return new Uint8Array(buffer);
  }, []);

  const waitForModelIdle = useCallback(async (timeoutMs: number = 1000) => {
    const startedAt = Date.now();

    while (ttsRef.current.isGenerating && Date.now() - startedAt < timeoutMs) {
      await sleep(40);
    }
  }, [sleep]);

  const waitForModelReady = useCallback(async (timeoutMs: number = 20000) => {
    const startedAt = Date.now();

    while (!ttsRef.current.isReady && Date.now() - startedAt < timeoutMs) {
      await sleep(40);
    }

    if (!ttsRef.current.isReady) {
      throw new Error('TTS model did not become ready in time.');
    }
  }, [sleep]);

  const ensureModelReady = useCallback(async (timeoutMs: number = 20000) => {
    if (ttsRef.current.isReady) {
      return;
    }

    try {
      await waitForModelReady(timeoutMs);
      return;
    } catch {
      // Attempt one soft recovery cycle before surfacing failure.
    }

    try {
      ttsRef.current.streamStop();
    } catch {
      // no-op
    }

    await waitForModelIdle(1800);
    await waitForModelReady(timeoutMs);
  }, [waitForModelIdle, waitForModelReady]);

  const isRetryableSynthesisError = useCallback((error: unknown) => {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? Number((error as { code?: unknown }).code)
        : null;

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';

    return (
      errorCode === 2
      || errorCode === 115
      || /currently generating|forward function did not succeed|failed to execute method forward|error:\s*2|model input is correct|did not become ready in time|preload timeout/i.test(errorMessage)
    );
  }, []);

  const isDownloadCancelled = useCallback((requestId: number) => {
    return requestId !== downloadRequestIdRef.current;
  }, []);

  const assertDownloadActive = useCallback((requestId: number) => {
    if (isDownloadCancelled(requestId)) {
      throw new Error('download-cancelled');
    }
  }, [isDownloadCancelled]);

  const stopCurrentAudio = useCallback(() => {
    const runtime = runtimeRef.current;

    if (!runtime.currentSource) {
      return;
    }

    try {
      runtime.currentSource.stop();
    } catch {
      // no-op
    }

    runtime.currentSource = null;
  }, []);

  const stopGenerationAndWait = useCallback(async () => {
    try {
      ttsRef.current.streamStop();
    } catch {
      // no-op
    }

    await waitForModelIdle(1500);

    const activeGeneration = runtimeRef.current.generationPromise;
    if (activeGeneration) {
      try {
        await activeGeneration;
      } catch {
        // no-op
      }
    }

    runtimeRef.current.generationPromise = null;
    runtimeRef.current.generationPromiseSession = null;
  }, [waitForModelIdle]);

  const synthesizeChunk = useCallback(async (chunkValue: string) => {
    const normalizedChunk = chunkValue
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .trim();
    if (normalizedChunk.length === 0) {
      return new Float32Array(0);
    }

    await ensureModelReady();

    const audioParts: Float32Array[] = [];
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        await ttsRef.current.stream({
          text: normalizedChunk,
          onNext: async (audioChunk) => {
            audioParts.push(new Float32Array(audioChunk));
          },
        });

        return concatAudio(audioParts);
      } catch (error) {
        const shouldRetry = isRetryableSynthesisError(error);
        if (!shouldRetry || attempt === maxRetries - 1) {
          throw error;
        }

        audioParts.length = 0;

        try {
          ttsRef.current.streamStop();
        } catch {
          // no-op
        }

        await waitForModelIdle(1200);
        await ensureModelReady(6000);
        await sleep(80 * (attempt + 1));
      }
    }

    return concatAudio(audioParts);
  }, [concatAudio, ensureModelReady, isRetryableSynthesisError, sleep, waitForModelIdle]);

  const waitForChunkAudio = useCallback(async (chunkIndex: number, sessionId: number) => {
    while (
      runtimeRef.current.sessionId === sessionId
      && !runtimeRef.current.audioQueue[chunkIndex]
      && !runtimeRef.current.generationDone
    ) {
      await sleep(40);
    }

    if (runtimeRef.current.sessionId !== sessionId) {
      return null;
    }

    return runtimeRef.current.audioQueue[chunkIndex] ?? null;
  }, [sleep]);

  const pruneAudioQueueWindow = useCallback((sessionId: number, centerChunkIndex?: number) => {
    const runtime = runtimeRef.current;

    if (runtime.sessionId !== sessionId) {
      return;
    }

    const anchorChunkIndex = centerChunkIndex ?? runtime.currentChunkIndex;

    const minChunkToKeep = Math.max(0, anchorChunkIndex - playbackKeepBehindChunks);
    const maxChunkToKeep = Math.min(
      runtime.chunkTexts.length - 1,
      anchorChunkIndex + playbackPrefetchAheadChunks,
    );

    let removedAny = false;
    for (const queueIndexKey of Object.keys(runtime.audioQueue)) {
      const queueIndex = Number(queueIndexKey);
      if (queueIndex < minChunkToKeep || queueIndex > maxChunkToKeep) {
        delete runtime.audioQueue[queueIndex];
        removedAny = true;
      }
    }

    const queuedBytes = () => {
      return Object.values(runtime.audioQueue)
        .reduce((sum, chunkAudio) => sum + (chunkAudio.length * Float32Array.BYTES_PER_ELEMENT), 0);
    };

    if (queuedBytes() > queueTargetBytes) {
      const queueIndices = Object.keys(runtime.audioQueue)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => {
          const leftDistance = Math.abs(left - anchorChunkIndex);
          const rightDistance = Math.abs(right - anchorChunkIndex);
          return rightDistance - leftDistance;
        });

      for (const queueIndex of queueIndices) {
        if (queuedBytes() <= queueTargetBytes) {
          break;
        }

        if (queueIndex >= minChunkToKeep && queueIndex <= maxChunkToKeep) {
          continue;
        }

        delete runtime.audioQueue[queueIndex];
        removedAny = true;
      }
    }

    if (removedAny) {
      updateMemoryStats();
    }
  }, [playbackKeepBehindChunks, playbackPrefetchAheadChunks, queueTargetBytes, updateMemoryStats]);

  const playAudioBuffer = useCallback(async (audioData: Float32Array) => {
    if (audioData.length === 0) {
      // Failed chunk synth can be represented as an empty chunk; skip gracefully.
      return 'ended' as PlaybackResult;
    }

    const context = audioContextRef.current;

    return new Promise<PlaybackResult>((resolve) => {
      let resolved = false;
      const resolveIfNeeded = (result: PlaybackResult) => {
        if (resolved) {
          return;
        }

        resolved = true;
        resolve(result);
      };

      try {
        // Fail fast on invalid sample values instead of throwing deep inside native APIs.
        const sampleToCheck = Math.min(audioData.length, 128);
        for (let index = 0; index < sampleToCheck; index += 1) {
          if (!Number.isFinite(audioData[index])) {
            throw new Error(`Invalid audio sample at index ${index}`);
          }
        }

        const buffer = context.createBuffer(1, audioData.length, DEFAULT_TTS_SAMPLE_RATE);
        buffer.getChannelData(0).set(audioData);

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        runtimeRef.current.currentSource = source;

        const handleEnded = () => {
          runtimeRef.current.currentSource = null;
          resolveIfNeeded(playerStateRef.current.isPaused ? 'stopped' : 'ended');
        };

        // Some native audio implementations dispatch only one of these handlers.
        source.onEnded = handleEnded;
        (source as any).onended = handleEnded;

        source.start();

        if (playerStateRef.current.isPaused) {
          try {
            source.stop();
          } catch {
            // no-op
          }
        }
      } catch (error) {
        runtimeRef.current.currentSource = null;
        console.error('TTS playAudioBuffer error:', error);
        resolveIfNeeded('stopped');
      }
    });
  }, []);

  const generateQueue = useCallback(async (sessionId: number) => {
    const runtime = runtimeRef.current;

    if (runtime.generationPromise && runtime.generationPromiseSession === sessionId) {
      return runtime.generationPromise;
    }

    runtime.generationDone = false;
    runtime.generationPromiseSession = sessionId;
    updateMemoryStats();

    runtime.generationPromise = (async () => {
      let consecutiveGenerationFailures = 0;

      while (runtimeRef.current.nextChunkToGenerate < runtimeRef.current.chunkTexts.length) {
        if (!playerStateRef.current.isPlaying || runtimeRef.current.sessionId !== sessionId) {
          break;
        }

        const maxChunkToPrefetch = Math.min(
          runtimeRef.current.chunkTexts.length - 1,
          runtimeRef.current.currentChunkIndex + playbackPrefetchAheadChunks,
        );

        if (runtimeRef.current.nextChunkToGenerate > maxChunkToPrefetch) {
          await sleep(40);
          continue;
        }

        const chunkIndex = runtimeRef.current.nextChunkToGenerate;

        if (runtimeRef.current.audioQueue[chunkIndex]) {
          runtimeRef.current.nextChunkToGenerate += 1;
          continue;
        }

        const chunkValue = runtimeRef.current.chunkTexts[chunkIndex];

        let synthesizedAudio: Float32Array;
        try {
          synthesizedAudio = await synthesizeChunk(chunkValue);
        } catch (error) {
          if (runtimeRef.current.sessionId === sessionId && playerStateRef.current.isPlaying) {
            console.error('TTS synth error:', error);
          }

          consecutiveGenerationFailures += 1;

          // Recover on the same chunk; do not advance cursor and do not desync UI/audio.
          try {
            ttsRef.current.streamStop();
          } catch {
            // no-op
          }

          await waitForModelIdle(1600);

          try {
            await ensureModelReady(8000);
          } catch {
            // Model recovery failed, handled by failure threshold below.
          }

          if (
            runtimeRef.current.sessionId !== sessionId
            || !playerStateRef.current.isPlaying
            || playerStateRef.current.isPaused
          ) {
            break;
          }

          if (consecutiveGenerationFailures >= 3) {
            // Hard stop after repeated failures so UI state reflects stalled playback.
            setPlayerState({ isPlaying: false, isPaused: true });
            break;
          }

          await sleep(120 * consecutiveGenerationFailures);
          continue;
        }

        consecutiveGenerationFailures = 0;

        if (!playerStateRef.current.isPlaying || runtimeRef.current.sessionId !== sessionId) {
          break;
        }

        runtimeRef.current.audioQueue[chunkIndex] = synthesizedAudio;
        runtimeRef.current.totalGeneratedSamples += synthesizedAudio.length;
        runtimeRef.current.nextChunkToGenerate += 1;
        pruneAudioQueueWindow(sessionId);
        updateMemoryStats();
      }

      if (runtimeRef.current.sessionId === sessionId) {
        runtimeRef.current.generationDone = true;
      }
    })().finally(() => {
      if (runtimeRef.current.generationPromiseSession === sessionId) {
        runtimeRef.current.generationPromise = null;
        runtimeRef.current.generationPromiseSession = null;
      }
    });

    return runtime.generationPromise;
  }, [ensureModelReady, playbackPrefetchAheadChunks, pruneAudioQueueWindow, setPlayerState, sleep, synthesizeChunk, updateMemoryStats, waitForModelIdle]);

  const playQueue = useCallback(async (sessionId: number) => {
    const runtime = runtimeRef.current;

    if (runtime.playbackPromise && runtime.playbackPromiseSession === sessionId) {
      return;
    }

    runtime.playbackPromiseSession = sessionId;
    runtime.playbackPromise = (async () => {
      while (
        playerStateRef.current.isPlaying
        && runtimeRef.current.sessionId === sessionId
        && runtimeRef.current.currentChunkIndex < runtimeRef.current.chunkTexts.length
      ) {
        if (playerStateRef.current.isPaused) {
          break;
        }

        const chunkIndex = runtimeRef.current.currentChunkIndex;
        const queuedChunkAudio = await waitForChunkAudio(chunkIndex, sessionId);
        if (!queuedChunkAudio) {
          // Generation may have stopped before producing this chunk; recover in-place.
          if (
            runtimeRef.current.sessionId === sessionId
            && playerStateRef.current.isPlaying
            && !playerStateRef.current.isPaused
            && runtimeRef.current.generationDone
            && chunkIndex < runtimeRef.current.chunkTexts.length
          ) {
            const chunkValue = runtimeRef.current.chunkTexts[chunkIndex];

            try {
              const recoveredAudio = await synthesizeChunk(chunkValue);

              if (
                runtimeRef.current.sessionId === sessionId
                && playerStateRef.current.isPlaying
                && !playerStateRef.current.isPaused
              ) {
                runtimeRef.current.audioQueue[chunkIndex] = recoveredAudio;
                runtimeRef.current.totalGeneratedSamples += recoveredAudio.length;
                updateMemoryStats();
                continue;
              }
            } catch (error) {
              console.error('TTS playback recovery failed:', error);
              setPlayerState({ isPlaying: false, isPaused: true });
            }
          }

          break;
        }

        let playbackResult: PlaybackResult;
        try {
          playbackResult = await playAudioBuffer(queuedChunkAudio);
        } catch (error) {
          console.error('TTS playback loop error:', error);
          setPlayerState({ isPlaying: false, isPaused: true });
          break;
        }

        if (
          runtimeRef.current.sessionId !== sessionId
          || !playerStateRef.current.isPlaying
          || playerStateRef.current.isPaused
        ) {
          break;
        }

        if (playbackResult === 'ended' && !playerStateRef.current.isPaused) {
          if (chunkPauseMs > 0) {
            await sleep(chunkPauseMs);
          }

          if (
            runtimeRef.current.sessionId !== sessionId
            || !playerStateRef.current.isPlaying
            || playerStateRef.current.isPaused
          ) {
            break;
          }

          // Drop the chunk we just finished playing instead of retaining it behind the playhead.
          delete runtimeRef.current.audioQueue[chunkIndex];
          runtimeRef.current.currentChunkIndex += 1;
          setCurrentChunkIndex(runtimeRef.current.currentChunkIndex);
          pruneAudioQueueWindow(sessionId);
          updateMemoryStats();
          continue;
        }

        break;
      }

      if (
        runtimeRef.current.sessionId === sessionId
        && runtimeRef.current.currentChunkIndex >= runtimeRef.current.chunkTexts.length
      ) {
        setPlayerState({ isPlaying: false, isPaused: false });
      }
    })().finally(() => {
      if (runtimeRef.current.playbackPromiseSession === sessionId) {
        runtimeRef.current.playbackPromise = null;
        runtimeRef.current.playbackPromiseSession = null;
      }
    });

    await runtime.playbackPromise;
  }, [chunkPauseMs, playAudioBuffer, pruneAudioQueueWindow, setPlayerState, sleep, synthesizeChunk, updateMemoryStats, waitForChunkAudio]);

  const reset = useCallback(async () => {
    const runtime = runtimeRef.current;

    runtime.sessionId += 1;
    runtime.chunkTexts = [];
    runtime.audioQueue = {};
    runtime.generationDone = true;
    runtime.nextChunkToGenerate = 0;
    runtime.totalGeneratedSamples = 0;
    runtime.currentChunkIndex = 0;
    setChunkTextsState([]);
    setCurrentChunkIndex(0);
    setTotalChunks(0);

    setPlayerState({ isPlaying: false, isPaused: false });
    updateMemoryStats();
    stopCurrentAudio();
    await stopGenerationAndWait();
    clearDownloadCache();
  }, [clearDownloadCache, setPlayerState, stopCurrentAudio, stopGenerationAndWait, updateMemoryStats]);

  const writeWavToFile = useCallback((file: File, wavBytes: Uint8Array) => {
    if (file.exists) {
      file.delete();
    }

    file.create({ intermediates: true, overwrite: true });
    file.write(Buffer.from(wavBytes).toString('base64'), { encoding: 'base64' });
  }, []);

  const synthesizeChunkForDownload = useCallback(async (chunkValue: string, requestId: number) => {
    const normalizedChunk = chunkValue.trim();
    if (normalizedChunk.length === 0) {
      return new Float32Array(0);
    }

    await ensureModelReady();
    assertDownloadActive(requestId);

    const maxRetries = 6;
    const audioParts: Float32Array[] = [];

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      assertDownloadActive(requestId);

      try {
        await ttsRef.current.stream({
          text: normalizedChunk,
          onNext: async (audioChunk) => {
            audioParts.push(new Float32Array(audioChunk));
          },
        });

        return concatAudio(audioParts);
      } catch (error) {
        const shouldRetry = isRetryableSynthesisError(error);
        if (!shouldRetry || attempt === maxRetries - 1) {
          throw error;
        }

        audioParts.length = 0;
        await waitForModelIdle(500);
        await sleep(60 * (attempt + 1));
      }
    }

    return concatAudio(audioParts);
  }, [assertDownloadActive, concatAudio, ensureModelReady, isRetryableSynthesisError, sleep, waitForModelIdle]);

  const synthesizeDownloadChunksConcurrent = useCallback(async (
    normalizedChunks: string[],
    requestId: number,
  ) => {
    const audioParts = new Array<Float32Array>(normalizedChunks.length);
    const workerCount = Math.max(1, Math.min(DOWNLOAD_MAX_CONCURRENCY, normalizedChunks.length));
    let cursor = 0;

    const worker = async () => {
      while (true) {
        assertDownloadActive(requestId);

        const currentIndex = cursor;
        cursor += 1;

        if (currentIndex >= normalizedChunks.length) {
          return;
        }

        const chunkValue = normalizedChunks[currentIndex];
        const cachedAudio = downloadChunkAudioCacheRef.current.get(chunkValue);
        if (cachedAudio) {
          audioParts[currentIndex] = cachedAudio;
          continue;
        }

        const chunkAudio = await synthesizeChunkForDownload(chunkValue, requestId);
        setCachedDownloadChunk(chunkValue, chunkAudio);
        audioParts[currentIndex] = chunkAudio;
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return audioParts;
  }, [assertDownloadActive, setCachedDownloadChunk, synthesizeChunkForDownload]);

  const synthesizeDownloadChunksSequential = useCallback(async (
    normalizedChunks: string[],
    requestId: number,
  ) => {
    const chunkAudioParts: Float32Array[] = [];

    for (let chunkIndex = 0; chunkIndex < normalizedChunks.length; chunkIndex += 1) {
      assertDownloadActive(requestId);
      const chunkValue = normalizedChunks[chunkIndex];
      const cachedAudio = downloadChunkAudioCacheRef.current.get(chunkValue);
      if (cachedAudio) {
        chunkAudioParts.push(cachedAudio);
        continue;
      }

      const chunkAudio = await synthesizeChunkForDownload(chunkValue, requestId);
      setCachedDownloadChunk(chunkValue, chunkAudio);
      chunkAudioParts.push(chunkAudio);
    }

    return chunkAudioParts;
  }, [assertDownloadActive, setCachedDownloadChunk, synthesizeChunkForDownload]);

  const synthesizeDownloadChunksBatched = useCallback(async (
    normalizedChunks: string[],
    requestId: number,
    options?: {
      includeAudioInResult?: boolean;
    },
  ) => {
    const includeAudioInResult = Boolean(options?.includeAudioInResult);
    const sampleRate = DEFAULT_TTS_SAMPLE_RATE;
    const pcmBatches: Int16Array[] = [];
    const stitchedAudioBatches: Float32Array[] = [];
    let totalSamples = 0;
    let synthElapsedMs = 0;
    let encodeElapsedMs = 0;

    for (let startIndex = 0; startIndex < normalizedChunks.length; startIndex += DOWNLOAD_PARALLEL_BATCH_CHUNKS) {
      assertDownloadActive(requestId);
      const batchChunks = normalizedChunks.slice(startIndex, startIndex + DOWNLOAD_PARALLEL_BATCH_CHUNKS);
      let batchAudioParts: Float32Array[];
      const batchSynthStartedAt = Date.now();

      try {
        if (downloadParallelEnabledRef.current) {
          batchAudioParts = await synthesizeDownloadChunksConcurrent(batchChunks, requestId);
        } else {
          batchAudioParts = await synthesizeDownloadChunksSequential(batchChunks, requestId);
        }
      } catch (error) {
        if (downloadParallelEnabledRef.current && isRetryableSynthesisError(error)) {
          downloadParallelEnabledRef.current = false;

          try {
            ttsRef.current.streamStop();
          } catch {
            // no-op
          }

          await waitForModelIdle(1200);
          assertDownloadActive(requestId);
          batchAudioParts = await synthesizeDownloadChunksSequential(batchChunks, requestId);
        } else {
          throw error;
        }
      }

      const batchTotalSamples = batchAudioParts.reduce((sum, chunkAudio) => sum + chunkAudio.length, 0);
      totalSamples += batchTotalSamples;
      synthElapsedMs += Date.now() - batchSynthStartedAt;

      if (includeAudioInResult) {
        stitchedAudioBatches.push(...batchAudioParts);
      }

      const batchEncodeStartedAt = Date.now();
      pcmBatches.push(encodeChunksToPcm16(batchAudioParts));
      encodeElapsedMs += Date.now() - batchEncodeStartedAt;

      // Keep cache bounded by section rather than the full chapter to avoid large memory retention.
      if (normalizedChunks.length > DOWNLOAD_PARALLEL_BATCH_CHUNKS) {
        clearDownloadCache();
      }
    }

    const wavBuildStartedAt = Date.now();
    const wavBytes = buildWav16BitFromPcmBatches(pcmBatches, sampleRate);
    encodeElapsedMs += Date.now() - wavBuildStartedAt;

    return {
      wavBytes,
      totalSamples,
      sampleRate,
      audio: includeAudioInResult ? concatAudio(stitchedAudioBatches) : undefined,
      synthElapsedMs,
      encodeElapsedMs,
    };
  }, [assertDownloadActive, buildWav16BitFromPcmBatches, clearDownloadCache, concatAudio, encodeChunksToPcm16, isRetryableSynthesisError, synthesizeDownloadChunksConcurrent, synthesizeDownloadChunksSequential, waitForModelIdle]);

  const buildCurrentTextDownload = useCallback(async (
    requestId: number,
    options?: {
      includeAudioInResult?: boolean;
    },
  ) => {
    const startedAt = Date.now();
    const normalizedChunks = normalizeDownloadChunks(text);
    assertDownloadActive(requestId);
    const includeAudioInResult = Boolean(options?.includeAudioInResult);

    const synthesizedDownload = await synthesizeDownloadChunksBatched(normalizedChunks, requestId, {
      includeAudioInResult,
    });
    const synthElapsedMs = synthesizedDownload.synthElapsedMs;
    assertDownloadActive(requestId);

    const encodeElapsedMs = synthesizedDownload.encodeElapsedMs;
    clearDownloadCache();

    const normalizedBaseName = downloadFileBaseName
      ? toSafeFileName(downloadFileBaseName)
      : '';
    const fileName = normalizedBaseName
      ? `${normalizedBaseName}.wav`
      : `tts-chapter-${Date.now()}.wav`;

    console.log('[TTS download] stage timings:', {
      chunks: normalizedChunks.length,
      synthMs: synthElapsedMs,
      encodeMs: encodeElapsedMs,
      totalMs: Date.now() - startedAt,
      parallelUsed: downloadParallelEnabledRef.current,
      batchSize: DOWNLOAD_PARALLEL_BATCH_CHUNKS,
    });

    return {
      wavBytes: synthesizedDownload.wavBytes,
      fileName,
      chunkCount: normalizedChunks.length,
      totalSamples: synthesizedDownload.totalSamples,
      sampleRate: synthesizedDownload.sampleRate,
      audio: synthesizedDownload.audio,
    };
  }, [DOWNLOAD_PARALLEL_BATCH_CHUNKS, assertDownloadActive, clearDownloadCache, downloadFileBaseName, normalizeDownloadChunks, synthesizeDownloadChunksBatched, text, toSafeFileName]);

  const buildCurrentTextDownloadToCache = useCallback(async () => {
    const requestId = ++downloadRequestIdRef.current;
    const compiledDownload = await buildCurrentTextDownload(requestId, {
      includeAudioInResult: true,
    });
    const outputFile = new File(Paths.cache, compiledDownload.fileName);
    writeWavToFile(outputFile, compiledDownload.wavBytes);

    assertDownloadActive(requestId);

    return {
      uri: outputFile.uri,
      fileName: compiledDownload.fileName,
      chunkCount: compiledDownload.chunkCount,
      totalSamples: compiledDownload.totalSamples,
      sampleRate: compiledDownload.sampleRate,
      audio: compiledDownload.audio,
    };
  }, [assertDownloadActive, buildCurrentTextDownload, writeWavToFile]);

  const downloadCurrentTextToMemory = useCallback(async () => {
    setIsDownloading(true);

    try {
      return await buildCurrentTextDownloadToCache();
    } finally {
      setIsDownloading(false);
    }
  }, [buildCurrentTextDownloadToCache]);

  const downloadCurrentTextWithPicker = useCallback(async () => {
    const requestId = ++downloadRequestIdRef.current;
    const defaultDownloadsDirectory = new Directory(Paths.document, 'Downloads');

    if (!defaultDownloadsDirectory.exists) {
      defaultDownloadsDirectory.create({ intermediates: true, idempotent: true });
    }

    let selectedDirectoryUri: string | null = null;
    let savedWithPicker = false;

    // Pick destination before enabling the loading modal; the modal can block picker presentation on some devices.
    try {
      const selectedDirectory = await Directory.pickDirectoryAsync(defaultDownloadsDirectory.uri);
      selectedDirectoryUri = selectedDirectory.uri;
      savedWithPicker = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      const pickerCancelled = errorMessage.includes('cancel') || errorMessage.includes('canceled');

      if (!pickerCancelled) {
        console.warn('TTS picker open failed, fallback to app Downloads folder:', error);
      }
    }

    assertDownloadActive(requestId);
    setIsDownloading(true);

    try {
      const compiledDownload = await buildCurrentTextDownload(requestId, {
        includeAudioInResult: false,
      });
      assertDownloadActive(requestId);

      const cacheFile = new File(Paths.cache, compiledDownload.fileName);
      writeWavToFile(cacheFile, compiledDownload.wavBytes);

      const sourceFile = new File(cacheFile.uri);
      const targetDirectoryUri = selectedDirectoryUri || defaultDownloadsDirectory.uri;
      let destinationFile = new File(targetDirectoryUri, compiledDownload.fileName);

      if (destinationFile.exists) {
        destinationFile.delete();
      }

      const writeStartedAt = Date.now();

      try {
        sourceFile.copy(destinationFile);
      } catch (copyError) {
        // SAF-backed picked directories are more robust with copy; if that still fails, fallback to app Downloads.
        console.warn('TTS copy to target failed, fallback to app Downloads:', copyError);
        savedWithPicker = false;
        destinationFile = new File(defaultDownloadsDirectory, compiledDownload.fileName);

        if (destinationFile.exists) {
          destinationFile.delete();
        }

        sourceFile.copy(destinationFile);
      }

      console.log('[TTS download] write timing:', {
        writeMs: Date.now() - writeStartedAt,
        target: savedWithPicker ? 'picker' : 'default-downloads',
      });

      return {
        uri: destinationFile.uri,
        cacheUri: cacheFile.uri,
        fileName: compiledDownload.fileName,
        chunkCount: compiledDownload.chunkCount,
        totalSamples: compiledDownload.totalSamples,
        sampleRate: compiledDownload.sampleRate,
        audio: undefined,
        savedWithPicker,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'download-cancelled') {
        throw new Error('Download cancelled by a newer request.');
      }
      throw error;
    } finally {
      if (requestId === downloadRequestIdRef.current) {
        setIsDownloading(false);
        clearDownloadCache();
      }
    }
  }, [assertDownloadActive, buildCurrentTextDownload, clearDownloadCache, writeWavToFile]);

  const start = useCallback(async () => {
    const runtime = runtimeRef.current;

    if (runtime.isStarting) {
      return;
    }

    runtime.isStarting = true;

    try {
      await stopGenerationAndWait();
      await ensureModelReady();

      const nextSessionId = runtimeRef.current.sessionId + 1;
      runtimeRef.current.sessionId = nextSessionId;

      const chunks = normalizeChunks(text);
      setPreparedChunks(chunks);

      if (chunks.length === 0) {
        setPlayerState({ isPlaying: false, isPaused: false });
        setCurrentChunkIndex(0);
        return;
      }

      runtimeRef.current.currentChunkIndex = 0;
      setCurrentChunkIndex(0);
      runtimeRef.current.generationDone = false;
      runtimeRef.current.audioQueue = {};
      runtimeRef.current.nextChunkToGenerate = 0;
      runtimeRef.current.totalGeneratedSamples = 0;
      updateMemoryStats();

      setPlayerState({ isPlaying: true, isPaused: false });

      void generateQueue(nextSessionId);
      void playQueue(nextSessionId);
    } catch (error) {
      console.error('TTS start error:', error);
      setPlayerState({ isPlaying: false, isPaused: false });
    } finally {
      runtimeRef.current.isStarting = false;
    }
  }, [ensureModelReady, generateQueue, normalizeChunks, playQueue, setPlayerState, setPreparedChunks, stopGenerationAndWait, text, updateMemoryStats]);

  const pause = useCallback(() => {
    setPlayerState({ isPlaying: false, isPaused: true });
    stopCurrentAudio();
    void stopGenerationAndWait();
  }, [setPlayerState, stopCurrentAudio, stopGenerationAndWait]);

  const resume = useCallback(() => {
    const runtime = runtimeRef.current;

    if (runtime.chunkTexts.length === 0) {
      const chunks = normalizeChunks(text);
      setPreparedChunks(chunks);
    }

    if (runtime.chunkTexts.length === 0) {
      return;
    }

    const sessionId = runtime.sessionId;

    if (runtime.nextChunkToGenerate < runtime.currentChunkIndex) {
      runtime.nextChunkToGenerate = runtime.currentChunkIndex;
    }

    setPlayerState({ isPlaying: true, isPaused: false });
    updateMemoryStats();

    void generateQueue(sessionId);
    void playQueue(sessionId);
  }, [generateQueue, normalizeChunks, playQueue, setPlayerState, setPreparedChunks, text, updateMemoryStats]);

  const togglePlayPause = useCallback(async () => {
    if (playerStateRef.current.isPaused) {
      resume();
      return;
    }

    if (playerStateRef.current.isPlaying) {
      pause();
      return;
    }

    await start();
  }, [pause, resume, start]);

  const seekToChunk = useCallback(async (chunkIndex: number) => {
    const runtime = runtimeRef.current;

    if (runtime.chunkTexts.length === 0) {
      const chunks = normalizeChunks(text);
      setPreparedChunks(chunks);
    }

    if (runtime.chunkTexts.length === 0) {
      return;
    }

    const nextChunkIndex = Math.max(
      0,
      Math.min(runtime.chunkTexts.length - 1, Math.floor(chunkIndex)),
    );

    try {
      ttsRef.current.streamStop();
    } catch {
      // no-op
    }

    stopCurrentAudio();

    const shouldAutoPlayAfterSeek = playerStateRef.current.isPlaying || playerStateRef.current.isPaused;

    const nextSessionId = runtime.sessionId + 1;
    runtime.sessionId = nextSessionId;
    runtime.currentChunkIndex = nextChunkIndex;
    runtime.audioQueue = {};
    runtime.generationDone = false;
    runtime.nextChunkToGenerate = nextChunkIndex;

    setCurrentChunkIndex(nextChunkIndex);
    setTotalChunks(runtime.chunkTexts.length);
    if (shouldAutoPlayAfterSeek) {
      setPlayerState({ isPlaying: true, isPaused: false });
    }

    updateMemoryStats();

    void generateQueue(nextSessionId);

    if (shouldAutoPlayAfterSeek) {
      void playQueue(nextSessionId);
    }
  }, [generateQueue, normalizeChunks, playQueue, setPlayerState, setPreparedChunks, stopCurrentAudio, text, updateMemoryStats]);

  useEffect(() => {
    let isCancelled = false;

    if (previousTextRef.current === text) {
      return;
    }

    previousTextRef.current = text;

    (async () => {
      await reset();
      if (isCancelled) {
        return;
      }

      const chunks = normalizeChunks(text);
      setPreparedChunks(chunks);

      setPlayerState({ isPlaying: false, isPaused: true });
    })();

    return () => {
      isCancelled = true;
    };
  }, [normalizeChunks, reset, setPlayerState, setPreparedChunks, text]);

  useEffect(() => {
    return () => {
      void reset();
    };
  }, [reset]);

  return {
    isPlaying,
    isPaused,
    isDownloading,
    chunkTexts: chunkTextsState,
    currentChunkIndex,
    totalChunks,
    memoryStats,
    start,
    pause,
    resume,
    togglePlayPause,
    seekToChunk,
    reset,
    downloadCurrentTextToMemory,
    downloadCurrentTextWithPicker,
  };
}
