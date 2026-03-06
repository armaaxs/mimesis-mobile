import { DEFAULT_TTS_SAMPLE_RATE } from './config';
import { TTSAdapter, TTSStreamEngine } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const concatAudio = (audioParts: Float32Array[]) => {
  const totalLength = audioParts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const part of audioParts) {
    merged.set(part, offset);
    offset += part.length;
  }

  return merged;
};

export const createKokoroAdapter = (
  engine: TTSStreamEngine,
  sampleRate: number = DEFAULT_TTS_SAMPLE_RATE,
): TTSAdapter => {
  const waitForReady = async (timeoutMs: number = 20000) => {
    const startedAt = Date.now();

    while (!engine.isReady && Date.now() - startedAt < timeoutMs) {
      await sleep(40);
    }

    if (!engine.isReady) {
      throw new Error('TTS model did not become ready in time.');
    }
  };

  const waitForIdle = async (timeoutMs: number = 1500) => {
    const startedAt = Date.now();

    while (engine.isGenerating && Date.now() - startedAt < timeoutMs) {
      await sleep(40);
    }
  };

  return {
    sampleRate,
    isReady: () => engine.isReady,
    isGenerating: () => engine.isGenerating,
    ensureReady: waitForReady,
    synthesize: async (text: string) => {
      const normalized = text.trim();
      if (normalized.length === 0) {
        return new Float32Array(0);
      }

      await waitForReady();

      const audioParts: Float32Array[] = [];
      await engine.stream({
        text: normalized,
        onNext: async (audioChunk) => {
          audioParts.push(new Float32Array(audioChunk));
        },
      });

      return concatAudio(audioParts);
    },
    stop: async () => {
      try {
        engine.streamStop();
      } catch {
        // no-op
      }

      await waitForIdle();
    },
  };
};
