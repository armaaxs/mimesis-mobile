#include <jni.h>
#include "ReactNativeAdderOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::reactnativeadder::initialize(vm);
}
