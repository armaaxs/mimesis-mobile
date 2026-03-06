import { useEffect, useRef } from 'react';
import { useTextToSpeech } from 'react-native-executorch';
import {
  DEFAULT_EXECUTORCH_TTS_MODEL,
  DEFAULT_EXECUTORCH_TTS_VOICE,
} from '../services/tts/config';

export function useTTSPreload() {
  const tts = useTextToSpeech({
    // Keep preload aligned with playback hook to avoid model/voice contention.
    model: DEFAULT_EXECUTORCH_TTS_MODEL,
    voice: DEFAULT_EXECUTORCH_TTS_VOICE,
  });
  
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) {
      return;
    }

    const preloadModel = async () => {
      const startTime = Date.now();
      
      const checkReady = () => {
        return new Promise<void>((resolve) => {
          const check = () => {
            if (tts.isReady) {
              console.log(`[TTS Preload] Model ready after ${Date.now() - startTime}ms`);
              resolve();
              return;
            }
            
            if (Date.now() - startTime > 60000) {
              console.warn('[TTS Preload] Model preload timeout');
              resolve();
              return;
            }
            
            setTimeout(check, 100);
          };
          check();
        });
      };

      await checkReady();
      hasLoadedRef.current = true;
    };

    preloadModel();
  }, [tts]);

  return tts;
}
