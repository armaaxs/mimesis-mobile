import { useEffect, useRef } from 'react';
import {
  KOKORO_MEDIUM,
  KOKORO_VOICE_AF_HEART,
  useTextToSpeech,
} from 'react-native-executorch';

export function useTTSPreload() {
  const tts = useTextToSpeech({
    model: KOKORO_MEDIUM,
    voice: KOKORO_VOICE_AF_HEART,
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
