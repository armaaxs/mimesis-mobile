# Switching TTS Model To KittenTTS (ONNX) Guide

This document explains how to replace the current Kokoro-based path with another ONNX model (example: KittenTTS).

## Implementation Status In This Repo

Implemented already:

1. Central model/voice/sample-rate config at `services/tts/config.ts`.
2. TTS adapter contract at `services/tts/types.ts`.
3. Kokoro adapter scaffold at `services/tts/kokoroAdapter.ts`.
4. Queue player now reads model/voice/sample-rate from shared config (`hooks/use-tts-queue-player.ts`).
5. Preload hook uses shared config (`hooks/use-tts-preload.ts`), but global preload invocation is disabled in `app/_layout.tsx`.

Next step to complete migration:

1. Replace remaining direct synthesis calls in `use-tts-queue-player.ts` with adapter methods (`ensureReady`, `synthesize`, `stop`).
2. Add `KittenOnnxAdapter` implementation and select engine via feature flag.

## 1) Current State In This App

Current playback hook uses `react-native-executorch` with Kokoro constants in:

- `hooks/use-tts-queue-player.ts`

Audio playback and queue logic are model-agnostic. The model-specific part is synthesis.

That means the safest migration is:

1. keep queue/playback/download logic,
2. replace only synthesis backend.

## 2) Migration Strategy (Do This)

Create a model adapter interface, then provide one adapter per backend.

## Step A: Add a synthesis adapter interface

Use `services/tts/types.ts` for the adapter contract:

1. `isReady(): boolean`
2. `ensureReady(timeoutMs): Promise<void>`
3. `synthesize(text): Promise<Float32Array>`
4. `stop(): Promise<void>`
5. `sampleRate: number`

## Step B: Wrap current Kokoro implementation

Use `services/tts/kokoroAdapter.ts` that internally uses `useTextToSpeech` behavior equivalents.

## Step C: Implement KittenTTS ONNX adapter

Create `services/tts/KittenOnnxAdapter.ts`.

Important: this depends on your chosen ONNX runtime path:

1. ONNX Runtime React Native (recommended if supported by your target architecture).
2. Custom native module (Swift/Kotlin) that runs ONNX and returns PCM.
3. External local service endpoint (least preferred for offline app).

## Step D: Inject adapter into queue hook

Refactor `use-tts-queue-player.ts` so `synthesizeChunk` calls the adapter instead of direct `react-native-executorch` stream calls.

## 3) Required Model Inputs For Any ONNX TTS

Before coding adapter, confirm these for KittenTTS:

1. tokenizer/vocab format,
2. phonemizer requirement,
3. input tensor names and shapes,
4. output tensor format (PCM, mel, or latent),
5. expected sample rate,
6. speaker/voice conditioning inputs,
7. required post-processing (vocoder, denoise, normalization).

If output is not PCM directly, you need an extra stage (for example vocoder ONNX).

## 4) Minimal Adapter Design Example

Use this design, independent of backend:

`TTSAdapter.synthesize(text)` should always return mono `Float32Array` at `sampleRate`.

Then existing queue code can stay mostly unchanged.

## 5) Hook Refactor Plan

In `hooks/use-tts-queue-player.ts`:

1. remove direct model constants from hook,
2. pass adapter in options or create adapter with factory,
3. replace direct readiness/stream calls with adapter calls,
4. keep chunking/retry/session logic,
5. if adapter sample rate is not 24000, either:
   - update playback buffer sample rate dynamically, or
   - resample to 24000 before playback/export.

## 6) Sample Rate Rule

Do not hardcode `24000` if switching models.

Places to make dynamic:

1. `AudioContext({ sampleRate })`
2. `createBuffer(..., sampleRate)`
3. WAV header `sampleRate`
4. `queuedSeconds = queuedSamples / sampleRate`

If your model is 22050 Hz or 16000 Hz and you keep 24000 assumptions, playback speed and duration will be wrong.

## 7) Performance Considerations

1. Keep chunk size moderate. Too small increases overhead, too large increases latency.
2. Keep prefetch low while validating new model stability.
3. Add simple LRU cache for repeated chunks in download flow.
4. Watch memory during long chapters.

## 8) Validation Checklist For New Model

Run this in order:

1. synthesize fixed sentence and save WAV.
2. verify sample rate and audible speed.
3. run 20 sequential chunks in one session.
4. pause/resume 10 times.
5. seek forward/backward repeatedly.
6. export full chapter and verify file integrity.
7. test app background/foreground transitions.

## 9) Common Failure Cases During ONNX Migration

1. Silence output.
   - Usually wrong tensor names/shapes or post-processing not applied.

2. Metallic/noisy output.
   - Usually mel output being interpreted as PCM or wrong vocoder pipeline.

3. Crashes on long chapters.
   - Usually tensor or buffer memory pressure; reduce batch/chunk and prefetch.

4. Wrong speed/pitch.
   - Usually sample-rate mismatch.

## 10) Practical Rollout Plan

1. Keep Kokoro path as default and stable fallback.
2. Add feature flag: `ttsEngine = kokoro | kitten`.
3. Ship internal test build with Kitten adapter only for your device.
4. Collect logs and tune settings.
5. Switch default only after 100+ chapter test chunks without hard stops.

## 12) Current Reality Check

1. Adapter types and Kokoro adapter scaffold exist.
2. Queue player still directly performs synthesis via `ttsRef.current.stream(...)` in current implementation.
3. Complete adapter wiring before introducing KittenTTS runtime to reduce risk.

## 11) What You Need From KittenTTS Repo Before Coding

Gather and pin these artifacts in your docs:

1. exact model files (`.onnx`, tokenizer, speaker assets),
2. inference recipe from reference implementation,
3. license for model and weights,
4. expected compute/memory profile for mobile.

Without these, adapter work turns into guesswork.
