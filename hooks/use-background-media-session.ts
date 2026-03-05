import { Buffer } from 'buffer';
import { File, Paths } from 'expo-file-system';
import { useEffect } from 'react';
import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event, RepeatMode } from 'react-native-track-player';

type UseBackgroundMediaSessionOptions = {
  title: string;
  artist?: string;
  artwork?: string;
  isPlaying: boolean;
  position: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek?: (positionSeconds: number) => void;
};

let playerReady = false;
const TRACK_ID = 'mimesis-background-track';

const encodeSilenceWavBase64 = (sampleRate = 8000, seconds = 1) => {
  const totalSamples = sampleRate * seconds;
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const byteRate = sampleRate * channelCount * bytesPerSample;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = totalSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  return Buffer.from(buffer).toString('base64');
};

const ensureSilentTrack = async () => {
  const silentFile = new File(Paths.cache, 'mimesis-silence.wav');
  if (!silentFile.exists) {
    silentFile.create({ intermediates: true, overwrite: true });
    silentFile.write(encodeSilenceWavBase64(8000, 1), { encoding: 'base64' });
  }
  return silentFile.uri;
};

const setupIfNeeded = async () => {
  if (playerReady) return;

  await TrackPlayer.setupPlayer();
  await TrackPlayer.updateOptions({
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      compactCapabilities: [Capability.Play, Capability.Pause],
      notificationCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
    },
  });

  const silentUri = await ensureSilentTrack();
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: TRACK_ID,
    url: silentUri,
    title: 'Mimesis-82',
    artist: 'Audiobook',
    duration: 3600,
  });
  await TrackPlayer.setRepeatMode(RepeatMode.Track);
  await TrackPlayer.setVolume(0);

  playerReady = true;
};

export const useBackgroundMediaSession = ({
  title,
  artist,
  artwork,
  isPlaying,
  position,
  duration,
  onPlay,
  onPause,
  onSeek,
}: UseBackgroundMediaSessionOptions) => {
  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        await setupIfNeeded();
      } catch (error) {
        console.warn('Background media session setup failed:', error);
      }
    };

    void setup();

    return () => {
      mounted = false;
      if (!mounted) {
        // no-op; keep player alive for background controls
      }
    };
  }, []);

  useEffect(() => {
    const sync = async () => {
      try {
        await setupIfNeeded();
        await TrackPlayer.updateMetadataForTrack(TRACK_ID, {
          title,
          artist,
          artwork,
        });

        const safeDuration = Math.max(1, duration || 1);
        const safePosition = Math.max(0, Math.min(position || 0, safeDuration));
        await TrackPlayer.setQueue([
          {
            id: TRACK_ID,
            url: await ensureSilentTrack(),
            title,
            artist,
            artwork,
            duration: safeDuration,
          },
        ]);

        if (isPlaying) {
          await TrackPlayer.play();
        } else {
          await TrackPlayer.pause();
        }
      } catch (error) {
        console.warn('Background media session sync failed:', error);
      }
    };

    void sync();
  }, [artist, artwork, duration, isPlaying, position, title]);

  useEffect(() => {
    const playSub = TrackPlayer.addEventListener(Event.RemotePlay, onPlay);
    const pauseSub = TrackPlayer.addEventListener(Event.RemotePause, onPause);
    const stopSub = TrackPlayer.addEventListener(Event.RemoteStop, onPause);

    return () => {
      playSub.remove();
      pauseSub.remove();
      stopSub.remove();
    };
  }, [onPause, onPlay]);
};
