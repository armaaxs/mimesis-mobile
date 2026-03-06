export type TTSAudioChunk = Float32Array;

export type TTSStreamEngine = {
  isReady: boolean;
  isGenerating: boolean;
  stream: (options: {
    text: string;
    onNext: (audioChunk: Float32Array | number[] | ArrayLike<number>) => Promise<void> | void;
  }) => Promise<void>;
  streamStop: () => void;
};

export type TTSAdapter = {
  sampleRate: number;
  isReady: () => boolean;
  isGenerating: () => boolean;
  ensureReady: (timeoutMs?: number) => Promise<void>;
  synthesize: (text: string) => Promise<TTSAudioChunk>;
  stop: () => Promise<void>;
};
