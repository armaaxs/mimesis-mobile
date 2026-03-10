/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#2F6B62';
const tintColorDark = '#2F6B62';

export const AppPalette = {
  background: '#F4EEDF',
  backgroundMuted: '#E8DDC7',
  surface: '#FBF8F1',
  surfaceStrong: '#F0E7D7',
  surfaceInverse: '#201A17',
  border: '#D9C9AF',
  borderStrong: '#B49D7B',
  text: '#241C18',
  textMuted: '#6E6255',
  textSubtle: '#8D7E6C',
  accent: '#2F6B62',
  accentSoft: '#D6E2DD',
  accentStrong: '#214B45',
  danger: '#A44A3F',
  shadow: '#9B835C',
};

export const Colors = {
  light: {
    text: AppPalette.text,
    background: AppPalette.background,
    tint: tintColorLight,
    icon: AppPalette.textSubtle,
    tabIconDefault: AppPalette.textSubtle,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: AppPalette.text,
    background: AppPalette.background,
    tint: tintColorDark,
    icon: AppPalette.textSubtle,
    tabIconDefault: AppPalette.textSubtle,
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const GlobalFont = Platform.select({
  ios: 'Georgia',
  default: 'Georgia',
  web: "Georgia, 'Times New Roman', serif",
});
