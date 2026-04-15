/**
 * SwipeButton Component
 * Custom swipe-to-confirm gesture component built with
 * React Native Gesture Handler + Reanimated.
 *
 * Props:
 * - onSwipeComplete: Callback when swipe reaches threshold
 * - label: Text shown on the track
 * - disabled: Disable interaction
 * - loading: Show spinner instead of thumb
 * - color: Primary color (track highlight + thumb)
 */

import React, { useCallback } from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const THUMB_SIZE = 56;
const TRACK_HEIGHT = 64;
const TRACK_PADDING = 4;
const SWIPE_THRESHOLD_RATIO = 0.75; // 75% of track width

interface SwipeButtonProps {
  onSwipeComplete: () => void;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
}

export default function SwipeButton({
  onSwipeComplete,
  label = 'Swipe to Confirm',
  disabled = false,
  loading = false,
  color = '#22c55e',
}: SwipeButtonProps) {
  const translateX = useSharedValue(0);
  const trackWidth = useSharedValue(0);
  const hasTriggered = useSharedValue(false);

  const triggerHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleComplete = useCallback(() => {
    triggerHaptic();
    onSwipeComplete();
  }, [onSwipeComplete, triggerHaptic]);

  const panGesture = Gesture.Pan()
    .enabled(!disabled && !loading)
    .onStart(() => {
      hasTriggered.value = false;
    })
    .onUpdate((e) => {
      const maxTranslate = trackWidth.value - THUMB_SIZE - TRACK_PADDING * 2;
      if (maxTranslate <= 0) return;
      translateX.value = Math.max(0, Math.min(e.translationX, maxTranslate));
    })
    .onEnd(() => {
      const maxTranslate = trackWidth.value - THUMB_SIZE - TRACK_PADDING * 2;
      if (maxTranslate <= 0) return;

      const threshold = maxTranslate * SWIPE_THRESHOLD_RATIO;
      if (translateX.value >= threshold && !hasTriggered.value) {
        hasTriggered.value = true;
        translateX.value = withSpring(maxTranslate, { damping: 20, stiffness: 200 });
        runOnJS(handleComplete)();
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const labelStyle = useAnimatedStyle(() => {
    const maxTranslate = trackWidth.value - THUMB_SIZE - TRACK_PADDING * 2;
    if (maxTranslate <= 0) return { opacity: 1 };
    return {
      opacity: interpolate(
        translateX.value,
        [0, maxTranslate * 0.5],
        [1, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  const fillStyle = useAnimatedStyle(() => ({
    width: translateX.value + THUMB_SIZE + TRACK_PADDING,
  }));

  return (
    <GestureHandlerRootView>
      <View
        style={[
          styles.track,
          { backgroundColor: disabled ? '#d1d5db' : '#e5e7eb' },
        ]}
        onLayout={(e) => {
          trackWidth.value = e.nativeEvent.layout.width;
        }}
      >
        {/* Fill behind thumb */}
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: disabled ? '#9ca3af' : color },
            fillStyle,
          ]}
        />

        {/* Label */}
        <Animated.View style={[styles.labelContainer, labelStyle]}>
          <Text style={[styles.label, disabled && styles.labelDisabled]}>
            {label}
          </Text>
          <Text style={styles.chevrons}>{'>>>'}</Text>
        </Animated.View>

        {/* Thumb */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.thumb,
              {
                backgroundColor: disabled ? '#9ca3af' : '#fff',
                borderColor: disabled ? '#9ca3af' : color,
              },
              thumbStyle,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={color} />
            ) : (
              <Text style={[styles.thumbIcon, { color: disabled ? '#d1d5db' : color }]}>
                {'>>'}
              </Text>
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
    opacity: 0.3,
  },
  labelContainer: {
    position: 'absolute',
    left: THUMB_SIZE + TRACK_PADDING * 2 + 8,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  labelDisabled: {
    color: '#9ca3af',
  },
  chevrons: {
    fontSize: 14,
    color: '#9ca3af',
    letterSpacing: 2,
  },
  thumb: {
    position: 'absolute',
    left: TRACK_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  thumbIcon: {
    fontSize: 18,
    fontWeight: '700',
  },
});
