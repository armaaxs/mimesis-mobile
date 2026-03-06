# TTS Pipeline And Debug Guide

This is the practical guide for `hooks/use-tts-queue-player.ts`.

## 1) Hook Purpose

`useTTSQueuePlayer` turns long chapter text into streamable chunk audio with:

1. chunk generation,
2. queue-based playback,
3. pause/resume/seek,
4. memory window pruning,
5. chapter export to WAV.
6. defensive audio playback error handling.

## 2) Runtime Model

The hook has two state layers.

## UI state

- `isPlaying`
- `isPaused`
- `isDownloading`
- `currentChunkIndex`
- `totalChunks`
- `memoryStats`

## Runtime refs

- session id (invalidates stale async work)
- `chunkTexts`
- `audioQueue` (index -> Float32Array)
- `nextChunkToGenerate`
- `generationDone`
- playback and generation promises
- current audio source

Additional runtime details:

1. model/voice/sample-rate come from `services/tts/config.ts`.
2. synthesis and playback are isolated by `sessionId` so stale async work is ignored.

## 3) Playback Lifecycle

## `start()`

1. stop old generation safely,
2. ensure model readiness,
3. normalize chunks,
4. reset queue/cursors,
5. launch `generateQueue(session)` and `playQueue(session)`.

## `generateQueue(session)`

1. synthesizes chunks ahead of current playback cursor,
2. stores audio in queue,
3. prunes old/far chunks,
4. updates memory stats,
5. marks `generationDone` at loop end.

## `playQueue(session)`

1. waits for chunk audio,
2. plays audio buffer,
3. increments `currentChunkIndex` only after chunk playback completes,
4. handles session changes/pause/end safely,
5. can attempt in-place recovery synth if queue is unexpectedly missing current chunk,
6. catches playback exceptions and fails to paused state instead of hanging.

## `pause()` / `resume()`

- `pause()` stops current source immediately, marks paused, and stops generation (`stopGenerationAndWait()`).
- `resume()` restarts generation and playback from current chunk.

## `seekToChunk(i)`

1. clamp index,
2. stop source and stream,
3. start new session at target index,
4. reset queue and generation cursor to target index,
5. auto-play when current state is paused or playing,
6. keep idle only when not previously in a play-capable state.

## 4) Memory And Queue Settings

Reader currently uses safer values:

- `playbackPrefetchAheadChunks: 6`
- `playbackKeepBehindChunks: 2`
- `queueTargetMemoryMB: 32`

Hook defaults are:

- `playbackPrefetchAheadChunks: 6`
- `playbackKeepBehindChunks: 2`
- `queueTargetMemoryMB: 96`

Why this matters:

1. lower prefetch means less RAM pressure,
2. smaller queue means fewer long-tail stale buffers,
3. fewer simultaneous synth operations means fewer model contention edges.

## 5) Readiness And Recovery Strategy

Use `ensureModelReady(...)` rather than only `waitForModelReady(...)`.

Recovery cycle:

1. check readiness,
2. if timeout, `streamStop()`,
3. wait idle,
4. wait ready again,
5. retry chunk.

Hard stop only after bounded consecutive failures.

Playback-side protection:

1. `playAudioBuffer(...)` validates sample data before native playback.
2. buffer creation/start is wrapped in try/catch.
3. playback loop wraps `await playAudioBuffer(...)` in try/catch.
4. failures transition state to paused instead of unresolved/hung promises.

## 6) Debugging Matrix

1. Symptom: stops at chunk 2 or 3.
   - Inspect: synthesis error logs, `generationDone`, `nextChunkToGenerate`.
   - Fix: strengthen retry/recovery on same chunk.

2. Symptom: audio stops but text keeps moving.
   - Inspect: who increments `currentChunkIndex`.
   - Fix: increment only on confirmed chunk completion.

3. Symptom: text stops but app still responsive.
   - Inspect: missing queue entry for current chunk and `generationDone=true`.
   - Fix: on-demand synth recovery in playback loop.

4. Symptom: preload timeout warning near stop.
   - Inspect: multiple TTS instances/models loaded simultaneously.
   - Fix: single active playback engine and aligned model config; keep global preload disabled in `app/_layout.tsx`.

5. Symptom: seek while paused does not start audio.
   - Inspect: session transition and `shouldAutoPlayAfterSeek` path.
   - Fix: ensure seek rebuilds queue and launches `playQueue` for paused/playing states.

## 7) What To Log During A Repro

At minimum, log these fields each chunk step:

1. `sessionId`
2. `currentChunkIndex`
3. `nextChunkToGenerate`
4. `generationDone`
5. queue keys (`Object.keys(audioQueue)`)
6. `isPlaying` and `isPaused`

Example pattern:

- `[TTS] generate start { sessionId, chunkIndex }`
- `[TTS] generate ok { sessionId, chunkIndex, samples }`
- `[TTS] generate err { sessionId, chunkIndex, message }`
- `[TTS] play start { sessionId, chunkIndex }`
- `[TTS] play end { sessionId, chunkIndex }`

## 8) Safe Refactor Rules

When changing this hook, keep these invariants:

1. one generation loop and one playback loop per session,
2. stale sessions must not mutate current session,
3. never advance chunk index without real playback completion,
4. pause must stop current source immediately,
5. chapter text change must invalidate old runtime work.
6. playback promises must always resolve even on native audio errors.

## 9) Download Flow (WAV Export)

`downloadCurrentTextWithPicker()`:

1. build chapter WAV in cache,
2. ask for destination directory,
3. copy to picked location,
4. fallback to app Downloads directory,
5. clear download state in `finally`.

If download fails:

1. check picker cancellation vs actual error,
2. check file write permission,
3. check cache output file size.

## 10) Quick TTS Health Checklist

Before deep debugging, verify:

1. chapter text length > 0,
2. chunk count > 0,
3. model readiness eventually true,
4. chunk 0 synth succeeds,
5. chunk 1 synth succeeds,
6. chunk index increments with audible output,
7. no repeated stream-busy errors without recovery.

## 11) Current File Map

1. `hooks/use-tts-queue-player.ts`: playback/generation state machine.
2. `services/tts/config.ts`: centralized model/voice/sample-rate constants.
3. `app/reader.tsx`: reader-level queue settings and controls.
4. `app/_layout.tsx`: global preload intentionally disabled.
