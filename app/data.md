Summary: below is a concise, complete breakdown of every piece of data we store or generate per book (persisted, cached, and in-memory), where it lives, and how it's used.

Persisted (on-disk)

Book JSON: Paths.document/mimesis-books/{bookId}.json — contains the full BookDTO:

id (string)
title (string)
author (string)
cover (string | null) — often a data:...;base64, or remote URL
uri (string) — local EPUB path (e.g., Paths.document/mimesis-books/gutendex-<id>.epub) or original URI
basePath (string) — EPUB internal base path for resolving chapter hrefs
chapters (BookChapterDTO[]): array of:
id (string) — OPF id
href (string) — chapter file path inside epub
title? (string)
html (string) — sanitized HTML for rendering (stored verbatim)
plainText (string) — normalized extracted text (used for TTS chunking)
metadata (BookMetadataDTO | null):
summary: string | null
downloadCount: number | null
language: string | null
subjects: string[]
sourceId: number | null (Gutendex ID)
createdAt (number timestamp)
Catalog index: Paths.document/mimesis-books/catalog.json — array of catalog items (LibraryBookItem + createdAt):

id, title, author, cover, uri, metadata (as above), createdAt
Used for the library index/listing (fast lookup without loading full book JSON).
EPUB import file (when importing from Gutendex):

Paths.document/mimesis-books/gutendex-<safeId>.epub — the downloaded EPUB binary saved during import.
BookDTO.uri points to this local file when present.
Exported audio files (only when user explicitly exports):

Paths.cache/tts-chapter-<timestamp>.wav — created by the TTS hook when the user downloads chapter audio.
If the user picks a save location, the file is copied to a default Downloads directory or user-picked folder (Paths.document/Downloads or picked dir).
Background media helper:

Paths.cache/mimesis-silence.wav — a generated silent WAV used to keep TrackPlayer alive; not per-book audio.
Transient / In-memory only

Transient DTO map: utils/transientDtoMap — Map<id, BookDTO> used for prepared-but-unsaved books (not persisted). Keys are book.id; values are full BookDTO objects.
TTS runtime (per active reader session) — all ephemeral:
runtimeRef.audioQueue: Record<chunkIndex, Float32Array> — generated chunk audio in RAM.
runtime/session IDs, generationPromise/playbackPromise, generationDone, nextChunkToGenerate, totalGeneratedSamples.
memoryStats: queuedChunks, queuedSamples, queuedBytes, queuedSeconds (derived).
chunkTexts: array of normalized TTS chunks (strings) — derived from BookChapterDTO.plainText when reader is open.
chunk layout map (Reader): chunkLayoutMapRef with y/height per chunk — UI-only; not persisted.
Temporary files while exporting or parsing: base64 buffers, JSZip instances, etc., used in memory or as short-lived files.
Audio specifics (what's generated and where)

TTS generation:
Model generates Float32Array buffers (sampleRate 24k) per chunk.
These are stitched and (on export) encoded to 16-bit WAV bytes by encodeWav16Bit.
Temporary export file: File(Paths.cache, 'tts-chapter-<timestamp>.wav') (base64 write).
If user saves via picker, the cache file is copied to chosen folder (Downloads fallback).
No automatic per-book audio persistence:
The app does not persist per-book chapter audio by default; audio is generated on-demand and kept in memory + cache when exported.
The TrackPlayer background approach uses a silent file, not real audio.
Other derived data & mappings

htmlToStyledBlocks builds run-level objects annotated with chunkIndex by aligning the normalized plainText (rawChapterText) with TTS chunks; this mapping is derived at runtime from stored chapters[].html and chapters[].plainText.
Chunking parameters (chunk size, pause, sampleRate) are runtime settings in useTTSQueuePlayer and not stored per-book.
UI/state: reader positions, last-read chunk, bookmarks, UX settings — not stored in current codebase (could be added later).
Where to look in repo (quick links)

Model/DTO shape: Book.ts
Persistence: bookRepository.ts (store dir, catalog.json, per-book .json)
EPUB import & chapter extraction: epubparser.ts (extractEpubImportPayload)
Raw-text extraction & Gutenberg cleanup: utils/extractRawText.ts
Renderer chunk mapping: htmlToStyledBlocks.ts
TTS audio generation, in-memory queue, and export: use-tts-queue-player.ts
Reader usage (where rawChapterText → TTS & renderer): reader.tsx
Transient DTO store: transientDtoMap.ts
Save/import flow and EPUB saving: BookDescription.tsx
Notes & recommendations

Size: saved BookDTOs include full chapter HTML + embedded base64 cover images — files can become large. Consider storing chapter HTML separately (files per chapter) or compressing JSON if space is a concern.
Audio persistence: if you want persisted per-book audio (for offline playback without re-generating), we can add an explicit per-book audio export/save flow that writes WAV/MP3 files under Paths.document/mimesis-books/{bookId}/audio/ and record their URIs in the BookDTO (e.g., a new audioFiles: { chapterIndex: string }[] field).
Metadata backfill: older saved books without metadata can be lazily backfilled when opened or during a migration script.
Want a JSON example of a persisted BookDTO and approximate on-disk size estimate for one of your sample books? I can (1) produce an example JSON from an existing book in repo or (2) add a script to list sizes of files under mimesis-books/ — which would you prefer?