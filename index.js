import TrackPlayer from 'react-native-track-player';
import { playbackService } from './services/playbackService';

TrackPlayer.registerPlaybackService(() => playbackService);

import 'expo-router/entry';
