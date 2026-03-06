import { Buffer } from 'buffer';
import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioContext } from 'react-native-audio-api';
import {
  KOKORO_MEDIUM,
  // KOKORO_VOICE_AM_MICHAEL,
  KOKORO_VOICE_AF_HEART,
  useTextToSpeech,
} from 'react-native-executorch';
import { chunkText } from '../utils/chunkText';

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
  audio: Float32Array;
};

export type ChapterAudioPickedSaveResult = ChapterAudioDownloadResult & {
  cacheUri: string;
  savedWithPicker: boolean;
};

export function useTTSQueuePlayer({
  text,
  chunkSize = 200,
  chunkPauseMs = 140,
  playbackPrefetchAheadChunks = 40,
  playbackKeepBehindChunks = 20,
  queueTargetMemoryMB = 96,
}: UseTTSQueuePlayerOptions): UseTTSQueuePlayerResult {
  const tts = useTextToSpeech({
    model: KOKORO_MEDIUM,
    voice: KOKORO_VOICE_AF_HEART,
  });

  const ttsRef = useRef(tts);
  const audioContextRef = useRef(new AudioContext({ sampleRate: 24000}));
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
      queuedSeconds: queuedSamples / 24000,
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

  const encodeWav16Bit = useCallback((audioData: Float32Array, sampleRate: number) => {
    const channelCount = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const byteRate = sampleRate * channelCount * bytesPerSample;
    const blockAlign = channelCount * bytesPerSample;
    const dataSize = audioData.length * bytesPerSample;
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
    for (let sampleIndex = 0; sampleIndex < audioData.length; sampleIndex += 1) {
      const sample = Math.max(-1, Math.min(1, audioData[sampleIndex]));
      const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(dataOffset, int16Sample, true);
      dataOffset += 2;
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
      || /currently generating|forward function did not succeed|model input is correct/i.test(errorMessage)
    );
  }, []);

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
    const normalizedChunk = chunkValue.trim();
    if (normalizedChunk.length === 0) {
      return new Float32Array(0);
    }

    await waitForModelReady();

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
        await waitForModelReady(4000);
        await sleep(80 * (attempt + 1));
      }
    }

    return concatAudio(audioParts);
  }, [concatAudio, isRetryableSynthesisError, sleep, waitForModelIdle, waitForModelReady]);

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
    const context = audioContextRef.current;

    return new Promise<PlaybackResult>((resolve) => {
      const buffer = context.createBuffer(1, audioData.length, 24000);
      buffer.getChannelData(0).set(audioData);

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      runtimeRef.current.currentSource = source;

      let resolved = false;
      source.onEnded = () => {
        if (resolved) {
          return;
        }

        resolved = true;
        runtimeRef.current.currentSource = null;
        resolve(playerStateRef.current.isPaused ? 'stopped' : 'ended');
      };

      source.start();

      if (playerStateRef.current.isPaused) {
        try {
          source.stop();
        } catch {
          // no-op
        }
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
          break;
        }

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
  }, [playbackPrefetchAheadChunks, pruneAudioQueueWindow, sleep, synthesizeChunk, updateMemoryStats]);

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
          break;
        }

        const playbackResult = await playAudioBuffer(queuedChunkAudio);

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
  }, [chunkPauseMs, playAudioBuffer, pruneAudioQueueWindow, setPlayerState, sleep, updateMemoryStats, waitForChunkAudio]);

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
  }, [setPlayerState, stopCurrentAudio, stopGenerationAndWait, updateMemoryStats]);

  const buildCurrentTextDownloadToCache = useCallback(async () => {
    await reset();

    const normalizedChunks = normalizeChunks(text);

    const chunkAudioParts: Float32Array[] = [];

    for (let chunkIndex = 0; chunkIndex < normalizedChunks.length; chunkIndex += 1) {
      const chunkAudio = await synthesizeChunk(normalizedChunks[chunkIndex]);
      chunkAudioParts.push(chunkAudio);
    }

    const stitchedAudio = concatAudio(chunkAudioParts);
    const sampleRate = 24000;
    const wavBytes = encodeWav16Bit(stitchedAudio, sampleRate);
    const fileName = `tts-chapter-${Date.now()}.wav`;
    const outputFile = new File(Paths.cache, fileName);

    if (outputFile.exists) {
      outputFile.delete();
    }

    outputFile.create({ intermediates: true, overwrite: true });
    outputFile.write(Buffer.from(wavBytes).toString('base64'), { encoding: 'base64' });

    return {
      uri: outputFile.uri,
      fileName,
      chunkCount: normalizedChunks.length,
      totalSamples: stitchedAudio.length,
      sampleRate,
      audio: stitchedAudio,
    };
  }, [concatAudio, encodeWav16Bit, normalizeChunks, reset, synthesizeChunk, text]);

  const downloadCurrentTextToMemory = useCallback(async () => {
    setIsDownloading(true);

    try {
      return await buildCurrentTextDownloadToCache();
    } finally {
      setIsDownloading(false);
    }
  }, [buildCurrentTextDownloadToCache]);

  const downloadCurrentTextWithPicker = useCallback(async () => {
    setIsDownloading(true);

    try {
      const cacheResult = await buildCurrentTextDownloadToCache();
      const sourceFile = new File(cacheResult.uri);
      const defaultDownloadsDirectory = new Directory(Paths.document, 'Downloads');

      if (!defaultDownloadsDirectory.exists) {
        defaultDownloadsDirectory.create({ intermediates: true, idempotent: true });
      }

      const saveToDefaultDownloads = () => {
        const destinationFile = new File(defaultDownloadsDirectory, cacheResult.fileName);

        if (destinationFile.exists) {
          destinationFile.delete();
        }

        sourceFile.copy(destinationFile);

        return {
          ...cacheResult,
          uri: destinationFile.uri,
          cacheUri: cacheResult.uri,
          savedWithPicker: false,
        };
      };

      try {
        const selectedDirectory = await Directory.pickDirectoryAsync(defaultDownloadsDirectory.uri);
        const destinationFile = new File(selectedDirectory.uri, cacheResult.fileName);

        if (destinationFile.exists) {
          destinationFile.delete();
        }

        sourceFile.copy(destinationFile);

        return {
          ...cacheResult,
          uri: destinationFile.uri,
          cacheUri: cacheResult.uri,
          savedWithPicker: true,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
        const pickerCancelled = errorMessage.includes('cancel') || errorMessage.includes('canceled');

        if (!pickerCancelled) {
          console.warn('TTS picker save fallback to cache file:', error);
        }

        return saveToDefaultDownloads();
      }
    } finally {
      setIsDownloading(false);
    }
  }, [buildCurrentTextDownloadToCache]);

  const start = useCallback(async () => {
    const runtime = runtimeRef.current;

    if (runtime.isStarting) {
      return;
    }

    runtime.isStarting = true;

    try {
      await stopGenerationAndWait();
      await waitForModelReady();

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
  }, [generateQueue, normalizeChunks, playQueue, setPlayerState, setPreparedChunks, stopGenerationAndWait, text, updateMemoryStats, waitForModelReady]);

  const pause = useCallback(() => {
    setPlayerState({ isPlaying: false, isPaused: true });
    stopCurrentAudio();
  }, [setPlayerState, stopCurrentAudio]);

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

    const nextSessionId = runtime.sessionId + 1;
    runtime.sessionId = nextSessionId;
    runtime.currentChunkIndex = nextChunkIndex;
    runtime.generationDone = false;
    runtime.nextChunkToGenerate = Math.min(runtime.nextChunkToGenerate, nextChunkIndex);

    setCurrentChunkIndex(nextChunkIndex);
    setTotalChunks(runtime.chunkTexts.length);
    pruneAudioQueueWindow(nextSessionId, nextChunkIndex);
    updateMemoryStats();

    void generateQueue(nextSessionId);

    if (playerStateRef.current.isPlaying && !playerStateRef.current.isPaused) {
      void playQueue(nextSessionId);
    }
  }, [generateQueue, normalizeChunks, playQueue, pruneAudioQueueWindow, setPreparedChunks, stopCurrentAudio, text, updateMemoryStats]);

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
