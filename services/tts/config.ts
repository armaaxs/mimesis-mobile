import {
  KOKORO_SMALL,
  KOKORO_VOICE_AF_RIVER,
  KOKORO_VOICE_AM_MICHAEL,
} from 'react-native-executorch';

export const DEFAULT_TTS_SAMPLE_RATE = 24000;

// Centralized default engine settings so model/voice swaps happen in one place.
export const DEFAULT_EXECUTORCH_TTS_MODEL = KOKORO_SMALL;
export const DEFAULT_EXECUTORCH_TTS_VOICE = KOKORO_VOICE_AF_RIVER;
