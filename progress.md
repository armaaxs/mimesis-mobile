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

---

## Recent Updates (Import Pipeline + Reader Refactor)

### Scope
Implemented a new import-first architecture so EPUB metadata/content is extracted once at import time, persisted as a `Book` domain object, and reused by Reader. Also upgraded chapter-title hydration from EPUB TOC (EPUB2 + EPUB3) and refined reader UI behavior.

### What Was Implemented

#### 1) Domain model + persistence layer
- Added `models/Book.ts` with:
  - `Book` class
  - `BookDTO`, `BookChapterDTO`, `LibraryBookItem`
  - `fromImport`, `fromDTO`, `toDTO`, `toLibraryItem`
- Added `utils/bookRepository.ts`:
  - storage dir: `Paths.document/mimesis-books`
  - catalog file: `catalog.json`
  - per-book file: `${bookId}.json`
  - APIs: `saveBook`, `getBookById`, `getBookByUri`, `listBookCatalog`

#### 2) Import-time EPUB extraction (single-pass)
- Extended `utils/epubparser.ts` with `extractEpubImportPayload(zip)` that extracts:
  - `title`, `author`
  - `cover` (metadata/manifest/guide strategies)
  - chapter list in spine order
  - chapter `html` + derived `plainText`
- Added shared HTML-to-text utility in `utils/extractRawText.ts`.

#### 3) TOC title extraction (EPUB2 + EPUB3)
- Added TOC parsing for:
  - EPUB2 NCX (`application/x-dtbncx+xml`)
  - EPUB3 nav docs (`properties="nav"`)
- Added href normalization/matching so TOC labels map reliably to spine chapters.
- Persisted chapter `title` in chapter DTOs.

#### 4) Library import flow refactor
- Updated `app/(tabs)/index.tsx` import pipeline:
  - pick/copy file (existing behavior)
  - parse zip + extract payload
  - create `Book` instance
  - persist via repository
  - prepend hydrated library card from persisted data
- Library now hydrates persisted catalog on mount.

#### 5) Reader data-source migration (persisted-first)
- Updated `app/reader.tsx` to:
  - resolve persisted book by `id`, fallback by `uri`
  - load chapter content from persisted `chapters[]` when available
  - fallback to legacy runtime zip parsing only if persisted data is missing

#### 6) Reader UX updates
- Added cover-first reader mode (Spotify-like):
  - open on cover
  - tap cover to enter text mode
  - in-view Back button returns to cover mode
- Added animated transition between cover/text modes using `Animated.spring`.

#### 7) Chapter index title hydration in Reader
- Updated reader chapter menu input so it prefers extracted chapter titles.
- Added robust fallback title generation in `reader.tsx`:
  1. extracted `chapter.title`
  2. first non-empty line from chapter text
  3. cleaned filename from `href`
  4. `Chapter X`

### Validation Performed
- File diagnostics for changed files: no errors.
- Lint run: `npm run lint`
  - passes with existing unrelated warnings in `app/(tabs)/explore.tsx`.

### Documentation
- Added `architecture.md` with complete end-to-end pipeline:
  - file selection/import
  - EPUB parsing/TOC/cover extraction
  - persistence model
  - reader hydration and chapter flow
  - chunking, queue playback, and WAV export path

### Files Added
- `models/Book.ts`
- `utils/bookRepository.ts`
- `utils/extractRawText.ts`
- `architecture.md`

### Files Updated
- `app/(tabs)/index.tsx`
- `app/reader.tsx`
- `utils/epubparser.ts`
- `progress.md` (this file)
