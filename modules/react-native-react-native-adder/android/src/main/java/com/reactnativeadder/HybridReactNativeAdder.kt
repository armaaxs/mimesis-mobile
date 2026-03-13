package com.reactnativeadder

import com.margelo.nitro.reactnativeadder.HybridReactNativeAdderSpec

class HybridReactNativeAdder: HybridReactNativeAdderSpec() {    
    override fun sum(num1: Double, num2: Double): Double {
        return num1 + num2
    }
}
