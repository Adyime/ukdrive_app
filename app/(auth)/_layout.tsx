/**
 * Auth Layout
 * Stack navigator for authentication flow
 */

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="passenger/send-otp" />
      <Stack.Screen name="passenger/verify-otp" />
      <Stack.Screen name="passenger/register" />
      <Stack.Screen name="driver/send-otp" />
      <Stack.Screen name="driver/verify-otp" />
      <Stack.Screen name="driver/onboarding" />
    </Stack>
  );
}

