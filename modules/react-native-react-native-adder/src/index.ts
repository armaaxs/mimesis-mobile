import { NitroModules } from 'react-native-nitro-modules'
import type { ReactNativeAdder as ReactNativeAdderSpec } from './specs/react-native-adder.nitro'

export const ReactNativeAdder =
  NitroModules.createHybridObject<ReactNativeAdderSpec>('ReactNativeAdder')