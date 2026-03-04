# Session Progress Log

## Scope
Implemented and iterated on `app/tts.tsx` to support reliable chunk-based TTS queue playback, pause/resume correctness, chapter-change reset behavior, and model-generation cancellation safety.

## What Was Implemented

### 1) Chunk queue architecture for TTS
- Reworked playback flow from direct stream-and-play to a queue model:
  - Text is chunked (`chunkText`).
  - Each chunk is synthesized into audio (`Float32Array`) and stored in a queue keyed by chunk index.
  - Playback consumes queue entries in order.
- Added chunk-linked state refs:
  - `chunkTextsRef`, `audioQueueRef`, `currentChunkIndexRef`, `generationDoneRef`.

### 2) Accurate pause/resume semantics
- Added runtime playback controls:
  - `isPlaying` / `isPaused` state + ref mirrors.
  - `pause` stops current audio source immediately.
  - `resume` restarts playback from the same chunk index (same chunk replays from start).
- Updated button behavior/icon toggle:
  - Play when idle/paused, pause when actively playing.

### 3) Chapter text change reset behavior
- Added `useEffect` on `text` changes:
  - Hard reset of queue/playback state.
  - Clears all chunk/audio/session state.
- Final behavior after user refinement:
  - On chapter change, **do not auto-restart**.
  - Keep player in paused state after reset until user presses play.

### 4) Session isolation to prevent stale playback
- Added session guards using `playbackSessionRef` and per-session task tracking.
- Ensures async tasks from old sessions cannot write/play into new chapter state.

### 5) Root-cause fix for model concurrency crash
User-reported runtime error:
- `The model is currently generating. Please wait until previous model run is complete.`
- `[Kokoro::Synthesizer] Failed to execute method forward, error: 1`

Fix implemented:
- Integrated native generation stop via `tts.streamStop()`.
- Added `stopGenerationAndWait()`:
  - Calls `streamStop()`.
  - Awaits any in-flight generation promise (`generationTaskRef`) before starting new playback.
- Added generation task/session refs:
  - `generationTaskRef`, `generationTaskSessionRef`.
- Ensured reset and unmount paths also stop/wait generation.
- Prevented start races with `isStartingRef` guard.

### 6) Hook/lint correctness hardening
- Stabilized reset/stop helpers with `useCallback`.
- Added `ttsRef` sync effect so callbacks can safely call latest `streamStop`.
- Updated effect dependency arrays to satisfy React hooks lint rules.

## Validation Performed
- TypeScript/editor diagnostics on `app/tts.tsx`: no errors.
- Lint check run:
  - `npm run lint -- app/tts.tsx`
  - Final result: passes (no warnings/errors).

## Current Expected Behavior
- Press play:
  - Starts fresh session, generates queued chunk audio, plays sequentially.
- Press pause:
  - Stops current source; current chunk index is preserved.
- Press play again from paused:
  - Replays the same chunk, then continues.
- Change chapter (`text` prop changes):
  - Stops audio + stops native model generation.
  - Clears queue/session/chunk state.
  - Leaves player paused (no auto-restart).

## Files Changed
- `app/tts.tsx`
- `progress.md` (this file)

## Latest Simplification Pass
- Rewrote `app/tts.tsx` end-to-end for readability while preserving behavior.
- Replaced many scattered refs with two clear structures:
  - `playerStateRef` for UI play/pause state.
  - `runtimeRef` for queue/session/source/task runtime data.
- Grouped logic into explicit helpers with single responsibilities:
  - synthesis (`synthesizeChunk`), model stop/wait (`stopGenerationAndWait`),
    generation (`generateQueue`), playback (`playQueue`), reset (`resetPlaybackState`), and controls (`start/pause/resume`).
- Preserved required functionality exactly:
  - queued chunk generation/playback,
  - pause resumes from the same chunk,
  - chapter change resets and stays paused,
  - native model generation stop + busy retry handling.
- Validation after rewrite:
  - `npm run lint -- app/tts.tsx` passes.
