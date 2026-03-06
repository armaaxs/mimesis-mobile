# use-tts-queue-player.ts — Updated Technical Documentation

## 1) Purpose
`useTTSQueuePlayer` is a chunked TTS playback hook for long text (chapter-like content). It provides:

- model-gated synthesis with recovery (`ensureModelReady`),
- queue-based playback with rolling memory window,
- play/pause/resume/toggle/reset controls,
- chunk seeking (`seekToChunk`) for seeker UI,
- download/export to WAV with optional user-picked destination.

---

## 2) Public API

### Input options
```ts
useTTSQueuePlayer({
  text: string,
  chunkSize?: number,                    // default: 200
  chunkPauseMs?: number,                 // default: 140
  playbackPrefetchAheadChunks?: number,  // default: 6
  playbackKeepBehindChunks?: number,     // default: 2
  queueTargetMemoryMB?: number,          // default: 96
})
```

### Return shape
```ts
{
  isPlaying: boolean,
  isPaused: boolean,
  isDownloading: boolean,
  currentChunkIndex: number,
  totalChunks: number,
  memoryStats: {
    queuedChunks: number,
    queuedSamples: number,
    queuedBytes: number,
    queuedSeconds: number,
    generatedSamplesTotal: number,
    generatedBytesTotal: number,
  },
  start: () => Promise<void>,
  pause: () => void,
  resume: () => void,
  togglePlayPause: () => Promise<void>,
  seekToChunk: (chunkIndex: number) => Promise<void>,
  reset: () => Promise<void>,
  downloadCurrentTextToMemory: () => Promise<ChapterAudioDownloadResult>,
  downloadCurrentTextWithPicker: () => Promise<ChapterAudioPickedSaveResult>,
}
```

### Export result types
```ts
type ChapterAudioDownloadResult = {
  uri: string,
  fileName: string,
  chunkCount: number,
  totalSamples: number,
  sampleRate: number,
  audio: Float32Array,
}

type ChapterAudioPickedSaveResult = ChapterAudioDownloadResult & {
  cacheUri: string,
  savedWithPicker: boolean,
}
```

---

## 3) State semantics

### Playback booleans
- `isPlaying = true`: audio is in active playback mode.
- `isPlaying = false` and `isPaused = true`: paused state.
- `isPlaying = false` and `isPaused = false`: idle/stopped/end.

This matters for UI icons: if your icon is based on `isPlaying`, pause now correctly flips to play icon.

### Chunk progress
- `currentChunkIndex`: current playback chunk cursor.
- `totalChunks`: normalized chunk count for current text.

These are designed for seeker/progress controls.

### Memory metrics
`memoryStats` tracks queue memory for in-flight playback chunks (not full process RAM):
- queued chunk count,
- sample and byte totals,
- queue duration seconds,
- total generated sample/byte counters for the current session.

---

## 4) Internal pipeline

### 4.1 `normalizeChunks(inputText)`
Single normalization path used by playback + seek + download:
1. chunk text (`chunkText`),
2. trim each chunk,
3. drop empty chunks.

### 4.2 `synthesizeChunk(chunkValue)`
- Trims input chunk and returns empty audio for empty text.
- Sanitizes control chars and ensures model readiness before synthesis.
- Streams PCM chunks and concatenates to one `Float32Array`.
- Retries up to 5 times for retryable native/model errors:
  - `currently generating`,
  - native `code: 2`,
  - `forward function did not succeed`,
  - `model input is correct`.
- Retry procedure:
  1. `streamStop()`,
  2. wait for idle,
  3. run readiness recovery,
  4. backoff and retry.

### 4.3 `playAudioBuffer(audioData)`
- Validates sample values before native playback.
- Wraps buffer creation/start in try/catch.
- Always resolves playback promise to avoid deadlock on native errors.
- Logs `TTS playAudioBuffer error` on failure.

### 4.4 `generateQueue(sessionId)`
- Generates from `nextChunkToGenerate` within prefetch window only.
- Stores chunk audio in `audioQueue[index]`.
- Prunes queue using keep-behind + prefetch-ahead limits.
- Updates `memoryStats` on changes.

### 4.5 `playQueue(sessionId)`
- Waits for chunk audio availability.
- Plays chunk PCM via `AudioContext`.
- Advances `currentChunkIndex` on natural chunk end.
- Attempts on-demand synth recovery if generation ended but current chunk audio is missing.
- Stops when paused/session-changed/end reached.

---

## 5) Core control flows

### `start()`
- Stops old generation, waits model ready, creates new session.
- Normalizes chunks from current text.
- Resets queue state and cursor to chunk 0.
- Sets playing state and starts generation + playback loops.

### `pause()`
- Sets `isPlaying: false`, `isPaused: true`.
- Stops current audio source immediately.
- Stops generation and waits for model to become idle (`stopGenerationAndWait`).

### `resume()`
- If no chunks, no-op.
- Creates a new session from current cursor.
- Resets queue and starts generation from `currentChunkIndex`.
- Sets `isPlaying: true`, `isPaused: false` and resumes playback.

### `togglePlayPause()`
- If paused → `resume()`.
- Else if playing → `pause()`.
- Else idle → `start()`.

### `seekToChunk(chunkIndex)`
- Ensures chunk list exists.
- Clamps target index to valid range.
- Stops current generation/audio.
- Starts a new session from target chunk.
- Resets queue and generation cursor to target chunk.
- Auto-starts playback when prior state is paused or playing.

### `reset()`
- Increments `sessionId` (invalidates stale async work).
- Clears queue/chunks/cursor/generation state.
- Resets progress + memory stats.
- Stops audio and generation safely.

---

## 6) Download/export flows

### `downloadCurrentTextToMemory()`
- Sets `isDownloading: true` for full operation.
- Calls internal cache builder that:
  1. resets playback,
  2. normalizes chunks,
  3. synthesizes sequentially,
  4. stitches PCM,
  5. encodes WAV (24kHz mono 16-bit),
  6. writes file to cache.
- Returns metadata + URI + in-memory audio.
- Always clears `isDownloading` in `finally`.

### `downloadCurrentTextWithPicker()`
- Also sets/clears `isDownloading` with `finally`.
- Builds cache WAV first.
- Tries directory picker with default initial location `Paths.document/Downloads`.
- Copies file to selected location.
- On picker cancel/error, falls back to saving in default Downloads directory.

---

## 7) Concurrency guarantees
- **Session isolation**: stale async tasks cannot mutate new playback sessions.
- **Single generator/player per session** via promise guards.
- **Start lock** via `isStarting` to avoid overlapping starts.
- **Model readiness gating** before synthesis/start.
- **Safe teardown** for audio source + model stream.
- **Defensive playback resolution** so chunk playback never hangs on native start errors.

---

## 8) Lifecycle behavior
- On `text` change:
  - hook resets runtime,
  - then leaves state in paused-ready mode (`isPlaying: false`, `isPaused: true`).
- On unmount:
  - hook calls `reset()` to stop generation/playback cleanly.

---

## 9) Notes for UI integration
- Play/pause button can safely use `isPlaying` alone for icon flip.
- Seeker uses:
  - `currentChunkIndex`,
  - `totalChunks`,
  - `seekToChunk()`.
- Download modal/overlay should key off `isDownloading`.

---

## 10) Related files
- `hooks/use-tts-queue-player.ts` — implementation.
- `utils/chunkText.ts` — text chunking utility.
- `app/reader.tsx` — consumer with play controls + seeker.
- `components/ChunkSeeker.component.tsx` — seeker UI component.
