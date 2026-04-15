/**
 * useCall — Initiate Fonada masked call.
 * Target: rideId (string), or { porterServiceId }, or { carPoolId }.
 * Opens system dialer with virtualNumber from POST /api/call/initiate.
 */

import { useState, useCallback } from 'react';
import { Linking } from 'react-native';
import { useAlert } from '@/context/alert-context';
import { initiateCall } from '@/lib/api/communication';

export type CallTarget =
  | string
  | { porterServiceId: string }
  | { carPoolId: string; passengerId?: string }
  | null;

function toInitiateParams(
  t: CallTarget
): {
  rideId?: string;
  porterServiceId?: string;
  carPoolId?: string;
  passengerId?: string;
} | null {
  if (!t) return null;
  if (typeof t === 'string') return { rideId: t };
  if ('porterServiceId' in t && t.porterServiceId) return { porterServiceId: t.porterServiceId };
  if ('carPoolId' in t && t.carPoolId) {
    return { carPoolId: t.carPoolId, passengerId: t.passengerId };
  }
  return null;
}

export function useCall(target: CallTarget) {
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiate = useCallback(async (overrideTarget?: CallTarget) => {
    const params = toInitiateParams(overrideTarget ?? target);
    if (!params) return;
    setLoading(true);
    setError(null);
    try {
      const res = await initiateCall(params);
      if (!res.success) {
        const msg = res.error?.message ?? 'Failed to start call.';
        setError(msg);
        showAlert('Call Failed', msg);
        return;
      }
      const data = res.data;
      if (!data) {
        setError('Call failed to connect.');
        showAlert('Call Failed', 'Call failed to connect. Please try again.');
        return;
      }
      if (data.virtualNumber) {
        const url = `tel:${data.virtualNumber}`;
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          setError('Cannot open dialer.');
          showAlert('Call Failed', 'Cannot open phone dialer.');
        }
      } else {
        setError('Call failed to connect.');
        showAlert('Call Failed', 'Call failed to connect. Please try again.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start call.';
      setError(msg);
      showAlert('Call Failed', msg);
    } finally {
      setLoading(false);
    }
  }, [target, showAlert]);

  return { initiate, loading, error };
}
