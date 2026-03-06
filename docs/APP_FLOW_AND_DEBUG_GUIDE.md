# Mimesis App Flow And Debug Guide

This document is a practical map of how the app works and how to debug it quickly.

## 1) High-Level Product Flow

1. User opens app.
2. `app/_layout.tsx` checks auth state with `useSupabaseAuth()`.
3. User lands in tabs (`/(tabs)`), usually library screen (`app/(tabs)/index.tsx`).
4. User imports EPUB.
5. EPUB is parsed and normalized into app domain model (`Book`).
6. Book is persisted locally (`utils/bookRepository.ts`) and optionally synced.
7. User opens Reader (`app/reader.tsx`).
8. Reader loads chapter HTML and plain text, sends text to TTS hook.
9. TTS hook chunks, synthesizes, queues, plays, and updates seeker/progress.
10. Progress is saved locally and synced to Supabase.

## 2) Core Files And Responsibilities

- `app/_layout.tsx`: Auth gate + global route stack.
- `app/(tabs)/index.tsx`: Library UI + import orchestration.
- `app/BookDescription.tsx`: Book details + open reader path.
- `app/reader.tsx`: Reading UI, chapter switching, TTS controls, progress persistence.
- `utils/epubparser.ts`: Parse container/OPF/spine/TOC and extract chapter payload.
- `utils/extractRawText.ts`: HTML to plain text.
- `utils/chunkText.ts`: Chunking strategy for TTS.
- `hooks/use-tts-queue-player.ts`: TTS synthesis, queue generation, playback, download.
- `services/tts/config.ts`: central model/voice/sample-rate constants.
- `hooks/use-background-media-session.ts`: lock screen/remote media controls.
- `utils/bookRepository.ts`: local storage abstraction.
- `services/syncService.ts`: sync queue and pull/push progress.
- `hooks/use-supabase-auth.ts`: auth state and post-auth hydration/sync.

## 3) Import Pipeline (EPUB -> Local Book)

## Entry points

- `app/(tabs)/index.tsx`
- `app/BookDescription.tsx` (depending on your flow)

## Pipeline

1. Pick file (`expo-document-picker`).
2. Copy selected file into app documents directory.
3. Load zip (`jszip`).
4. Call `extractEpubImportPayload(zip)`.
5. Resolve title/author/cover/chapters.
6. Build `Book` domain object.
7. Persist via repository (`saveBook`).
8. Update library state and navigate.

## Fast checks when import fails

1. Verify EPUB exists and is readable.
2. Verify `container.xml` and OPF path resolution in `utils/epubparser.ts`.
3. Verify chapter list is non-empty after spine parse.
4. Verify JSON persists under `Paths.document/mimesis-books`.

## 4) Reader Pipeline (Open Book -> Readable Text)

1. Reader receives route params (`id`, `uri`, resume info).
2. Reader resolves persisted book (`getBookById`, fallback `getBookByUri`).
3. Reader picks current chapter and sets `currentHtml`.
4. `extractRawText(currentHtml)` generates `rawChapterText`.
5. TTS hook receives text.
6. Styled rendering is produced with `htmlToStyledBlocks(...)`.
7. Active chunk highlighting follows `currentChunkIndex`.

## Reader-specific pitfalls

1. Chapter index mismatch (off-by-one) can appear if resume chapter index and filtered chapter list differ.
2. Missing `html` for chapter yields empty text and silent TTS.
3. Large chapter + heavy styling can make UI appear frozen while TTS is running.

## 5) Progress Persistence And Sync

## Local progress

- Reader debounces writes and persists chapter/chunk/href + timestamp.

## Cloud sync

- Pull path: `pullUserBookProgressForBook(...)`.
- Push path: save progress locally -> enqueue/flush with `services/syncService.ts`.

## Debug checklist for progress issues

1. Confirm `persistedBook.id` is present.
2. Confirm `queuePersistReadingProgress(...)` is called after resume bootstrap.
3. Confirm `flushPendingProgress()` runs on unmount.
4. Confirm Supabase credentials and auth session are valid.

## 6) End-To-End Debug Runbook

Use this exact sequence when app behavior is unclear.

1. Start app: `npx expo start`.
2. Import one known-good EPUB.
3. Open reader and press play.
4. Confirm these move together:
   - audio output
   - active highlighted text
   - `currentChunkIndex`
5. Switch chapter, verify reset and re-start behavior.
6. Pause/resume multiple times.
7. Seek while paused and confirm playback auto-starts from target chunk.
8. Seek during playback and confirm clean session transition.
9. Switch chapter during playback and confirm no stale-session audio.
10. Exit reader, reopen book, verify resume position.

## 7) Logging Strategy (Minimal But Useful)

Use consistent tags to isolate logs quickly.

- `[Import]` for parser/repository.
- `[Reader]` for chapter/load/resume.
- `[TTS]` for synthesis/queue/playback.
- `[Sync]` for progress push/pull.

Keep logs at these points:

1. On chapter text set: chapter index, href, text length.
2. On TTS start: chunk count and queue settings.
3. On synth error: chunk index and message.
4. On queue stall: `generationDone`, `nextChunkToGenerate`, `currentChunkIndex`, queue keys.
5. On progress save: chapter/chunk/href.

## 8) Known Failure Patterns And First Fix

1. Symptom: audio stops, text still advances.
   - Cause: forced playback advancement without real audio completion.
   - Fix: ensure chunk index only increments on confirmed playback end.

2. Symptom: text stops, audio stops around chunk 2.
   - Cause: generation loop exits on single unrecovered synth error.
   - Fix: same-chunk bounded retry and recovery before hard stop.

3. Symptom: preload timeout warning appears when stopping.
   - Cause: model readiness contention or stale generation state.
   - Fix: one active TTS engine for playback path, use readiness recovery cycle.

4. Symptom: playback dies silently after first chunk.
   - Cause: native audio buffer/start errors not surfaced or unresolved playback promise.
   - Fix: use guarded `playAudioBuffer` path and fail closed to paused state.

5. Symptom: seek while paused moves text but does not restart audio.
   - Cause: seek created a new session without launching playback.
   - Fix: seek path now auto-plays for paused/playing states.

## 9) Practical Recovery Workflow For Any Major Bug

1. Reproduce with one chapter only.
2. Disable non-critical UI effects.
3. Validate text input shape (non-empty, no control chars).
4. Validate TTS synthesis in isolation.
5. Re-enable queue playback.
6. Re-enable seeker.
7. Re-enable background media controls.

## 10) What To Stabilize Next (Priority)

1. Add a small in-app debug panel for TTS runtime state.
2. Add synthetic test chapter fixture with deterministic content.
3. Add integration test scripts for import -> read -> resume.
4. Keep model and voice constants centralized in one config file.
5. Complete end-to-end adapter wiring in `use-tts-queue-player.ts` before swapping engines.
