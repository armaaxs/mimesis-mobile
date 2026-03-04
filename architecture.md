# Mimesis-82 Book Processing Architecture

This document describes the complete lifecycle of a book in the app, from EPUB selection to chapter rendering, chunking, TTS streaming playback, and downloadable audio export.

---

## 1) High-Level End-to-End Flow

1. User taps **Add Book** in Library.
2. App opens EPUB picker and copies selected file into persistent app documents storage.
3. Import pipeline loads EPUB zip, parses package metadata/manifest/spine/TOC/cover, and extracts chapter HTML + plain text.
4. App builds a `Book` domain object and persists:
   - a lightweight catalog entry for Library listing
   - a full per-book JSON payload (including chapter data)
5. Library list hydrates persisted books and shows cards.
6. User opens a book card; Reader route receives params (currently full object shape).
7. Reader resolves persisted book by `id` (fallback by `uri`), then loads chapter HTML from persisted chapters.
8. Reader converts current chapter HTML to normalized text and passes it to TTS hook.
9. TTS hook chunks text, generates audio chunks with local model, streams playback, maintains queue/memory window, and updates current chunk index.
10. UI supports seek, pause/resume, chapter switching, and exporting current chapter audio as WAV.

---

## 2) Primary Components and Responsibilities

## UI / Screen Layer

### `components/AddBookCard.component.tsx`
- Opens document picker (`expo-document-picker`) with EPUB MIME type.
- Copies selected file from temporary cache to permanent `Paths.document` location.
- Calls `onBookAdded(destFile.uri, asset.name)`.

### `app/(tabs)/index.tsx` (Library)
- Hydrates persisted catalog via `listBookCatalog()`.
- Handles import pipeline after file selection.
- Creates domain `Book` object from extracted EPUB payload.
- Persists `Book` through repository.
- Renders books via `BookCard` and navigates to Reader.

### `components/BookCard.components.tsx`
- Displays cover/title/author per book entry.
- Falls back to title initial when cover is missing.

### `app/reader.tsx`
- Resolves persisted book data (`getBookById` then `getBookByUri` fallback).
- Falls back to legacy runtime EPUB parse path if persisted data is unavailable.
- Loads selected chapter content and feeds text to `useTTSQueuePlayer`.
- Hosts reader UI, cover/text mode animation, chunk list, controls, seeker, chapter index bottom sheet.

### `app/bookIndex.tsx`
- Renders chapter list.
- Uses `chapter.title` when available; falls back to `Chapter X`.

### `components/ChunkSeeker.component.tsx`
- Touch/pan seeker over chapter chunks.
- Emits normalized progress to Reader.

### `components/DownloadOverlay.component.tsx`
- Modal overlay shown while export/download is processing.

---

## Domain + Data Layer

### `models/Book.ts`
Defines runtime domain model and persistence DTOs.

- `BookChapterDTO`
  - `id`, `href`, optional `title`, `html`, `plainText`
- `BookDTO`
  - `id`, `title`, `author`, `cover`, `uri`, `basePath`, `chapters`, `createdAt`
- `Book` class
  - `fromImport(...)` creates a new domain instance with generated id
  - `toDTO()` serializes for persistence
  - `fromDTO()` hydrates runtime instance from persisted JSON
  - `toLibraryItem()` returns list-friendly minimal shape

### `utils/bookRepository.ts`
Persistence abstraction over `expo-file-system` object API (`Directory`, `File`, `Paths`).

Storage layout:
- Directory: `Paths.document/mimesis-books`
- Catalog: `catalog.json` (lightweight records for Library)
- Per-book file: `${bookId}.json` (full `BookDTO` payload)

Repository APIs:
- `saveBook(book)`
- `getBookById(bookId)`
- `getBookByUri(uri)`
- `listBookCatalog()`

---

## EPUB Parsing + Extraction Layer

### `utils/epubparser.ts`
Core import-time EPUB parsing and extraction.

Key responsibilities:
1. Parse `META-INF/container.xml` to find OPF path.
2. Parse OPF package:
   - metadata (`dc:title`, `dc:creator`)
   - manifest entries
   - spine reading order
   - guide references
3. Resolve and extract cover image:
   - EPUB metadata `meta name="cover"`
   - EPUB3 `cover-image` property
   - guide cover fallback
4. Extract TOC titles for both formats:
   - EPUB 2: NCX (`application/x-dtbncx+xml`)
   - EPUB 3: nav document (`properties="nav"`)
5. Build chapter sequence according to spine order.
6. For each spine chapter, load chapter HTML and derive plain text.

Primary APIs:
- `parseEpub(zip)`
  - lightweight structure (metadata + chapter refs) used by legacy fallback
- `extractEpubImportPayload(zip)`
  - full import payload (title, author, cover, basePath, chapters with html/plainText/title)
- `getChapterText(zip, href)`

### TOC Normalization Strategy
TOC title mapping resolves common EPUB path mismatches by:
- stripping fragments (`#...`)
- normalizing relative path segments (`.` / `..`)
- resolving TOC href against TOC file directory
- comparing normalized lowercased hrefs

This allows menu titles to hydrate reliably across EPUB2 and EPUB3 variations.

---

## Text Normalization + Chunking Layer

### `utils/extractRawText.ts`
Converts chapter HTML to clean plain text:
- removes `<script>` / `<style>` blocks
- inserts line breaks at block tags (`p`, `h1..h6`, `div`, `li`, `br`)
- strips remaining tags
- decodes basic HTML entities
- collapses repeated whitespace

### `utils/chunkText.ts`
Splits text into chunk units for TTS generation/playback.

Algorithm behavior:
- normalizes whitespace first
- targets max chunk length (`chunkSize`, default 200 in reader)
- prefers punctuation boundaries (`.` then `,` then `:`)
- avoids splitting after known abbreviations (`dr.`, `e.g.`, etc.)
- falls back to whitespace
- forward-lookahead fallback if no local break found
- hard split only as last resort

Result: chunks remain natural enough for speech cadence while being bounded for streaming inference.

---

## TTS + Playback Pipeline

### `hooks/use-tts-queue-player.ts`
Streaming queue-based TTS engine + player.

Model/runtime stack:
- `react-native-executorch` (`useTextToSpeech`)
- Kokoro model/voice constants (`KOKORO_MEDIUM`, `KOKORO_VOICE_AF_HEART`)
- `react-native-audio-api` `AudioContext` at 24kHz

### Internal Runtime State
The hook tracks:
- session id (invalidates stale generation/playback loops)
- chunk text list
- audio queue map (`chunkIndex -> Float32Array`)
- generation cursor and playback cursor
- memory counters
- current audio source

### Playback Orchestration
1. `start()`:
   - waits for model readiness
   - chunks current text
   - resets runtime queue and indices
   - starts `generateQueue(session)` and `playQueue(session)`
2. `generateQueue(session)`:
   - synthesizes chunks ahead of playback window
   - stores chunk audio in queue
   - prunes queue window by index and memory budget
3. `playQueue(session)`:
   - waits for next chunk audio
   - plays buffer via `AudioContext`
   - advances current chunk index on completion
4. `pause()`:
   - stops current source, keeps pause state
5. `resume()`:
   - restarts queue generation + playback for current session
6. `seekToChunk(index)`:
   - increments session id
   - stops model stream and current source
   - re-anchors playback/index
   - restarts generation/play from new position if playing

### Queue Memory Management
Configurable controls:
- `playbackPrefetchAheadChunks` (default 40)
- `playbackKeepBehindChunks` (default 20)
- `queueTargetMemoryMB` (default 96)

Pruning rules:
- keep chunks near current index
- evict outside window
- if over byte budget, evict farthest chunks first

### Retry Behavior for Synthesis
`synthesizeChunk` retries transient generation failures up to 5 attempts when error indicates in-flight generation conflicts or model forward failures.

---

## Download / Export Path (Current Chapter)

`downloadCurrentTextWithPicker()` in `use-tts-queue-player`:
1. Resets active playback state.
2. Re-synthesizes all current chapter chunks.
3. Concatenates PCM float chunks.
4. Encodes WAV (16-bit mono, 24kHz).
5. Writes WAV to cache as base64.
6. Attempts directory picker save; if cancelled/fails, falls back to `Paths.document/Downloads`.
7. Returns metadata (`uri`, `fileName`, `chunkCount`, `sampleRate`, etc.).

Reader shows `DownloadOverlay` during this process.

---

## 3) Sequence Flow (Runtime)

```mermaid
flowchart TD
  A[User taps Add Book] --> B[DocumentPicker returns EPUB asset]
  B --> C[Copy asset to Paths.document]
  C --> D[Library handleBookAdded]
  D --> E[Read EPUB file base64]
  E --> F[JSZip loadAsync]
  F --> G[extractEpubImportPayload]
  G --> G1[Parse container.xml + OPF]
  G --> G2[Resolve cover]
  G --> G3[Parse TOC ncx/nav]
  G --> G4[Extract chapter html + plainText]
  G4 --> H[Book.fromImport]
  H --> I[saveBook to repository]
  I --> J[Catalog + per-book JSON persisted]
  J --> K[Library list updated]
  K --> L[User opens book]
  L --> M[Reader resolves persisted book by id/uri]
  M --> N[Load selected chapter html]
  N --> O[extractRawText]
  O --> P[useTTSQueuePlayer(text)]
  P --> Q[chunkText]
  Q --> R[generateQueue synthesize chunks]
  R --> S[playQueue audio playback]
  S --> T[UI chunk highlight + seeker updates]
  T --> U[optional export WAV download]
```

---

## 4) Reader-Specific UI Flow

1. Reader opens in cover-first mode.
2. Tap cover transitions to text mode (animated).
3. Chapter text mode displays chunk rows and active chunk highlighting.
4. Seeker drag maps progress -> chunk index -> `seekToChunk`.
5. Chapter menu selection changes `currentChapterNo`, re-hydrates chapter text and chunk list.
6. Play/Pause toggles queue playback state.
7. Download button triggers chapter WAV export and overlay.

---

## 5) Fallback and Compatibility Paths

Current reader keeps a fallback path:
- Preferred path: persisted `Book` from repository.
- Fallback path: parse EPUB at runtime from `params.uri` using `parseEpub` + `getChapterText`.

This preserves compatibility when a route param exists but book persistence is missing.

---

## 6) Important Implementation Notes / Constraints

1. Chapter indexing currently starts at `currentChapterNo = 1` in Reader.
   - This means initial chapter load begins from index 1 (second entry) unless changed.
2. Route currently still passes full book-ish params from Library to Reader.
   - Reader already prefers persisted hydration when possible.
3. TOC title hydration is best-effort.
   - Missing/unsupported TOC still falls back to `Chapter X` labels in `bookIndex`.
4. Persisted catalog and book files are JSON-based.
   - Easy to inspect/migrate but can become large for books with many chapters.

---

## 7) File-Level Map

- Import trigger: `components/AddBookCard.component.tsx`
- Import orchestration + navigation: `app/(tabs)/index.tsx`
- EPUB parse/extraction + TOC handling: `utils/epubparser.ts`
- HTML -> plain text normalization: `utils/extractRawText.ts`
- Domain model: `models/Book.ts`
- Persistence repository: `utils/bookRepository.ts`
- Reader UI + chapter selection + controls: `app/reader.tsx`
- Chapter index menu: `app/bookIndex.tsx`
- Chunk splitting algorithm: `utils/chunkText.ts`
- Streaming TTS + queue playback + export: `hooks/use-tts-queue-player.ts`
- Seek UI: `components/ChunkSeeker.component.tsx`
- Download progress modal: `components/DownloadOverlay.component.tsx`

---

## 8) Suggested Future Hardening (Optional)

- Move route contract to `bookId` only.
- Remove legacy runtime zip fallback in Reader once migration is complete.
- Add schema versioning and migration utilities in repository payloads.
- Persist reading progress (`chapterIndex`, `chunkIndex`, timestamp).
- Introduce pagination/virtualization for very long chunk lists.
- Add telemetry around TTS generation failures and average synthesis latency.
