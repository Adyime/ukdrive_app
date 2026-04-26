/**
 * Wallet Top-Up Screen
 * Allows users to add money to their wallet using Razorpay
 * 
 * CRITICAL: Never trust Razorpay success callback alone.
 * Poll backend for payment confirmation via webhook.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, AppState } from "react-native";
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth-context';
import { useWallet } from '@/hooks/useWallet';
import { createTopupOrder, getOrderStatus } from '@/lib/api/payment';
import { dispatchWalletUpdated } from '@/lib/events';
import {
  openCheckout,
  isUserCancellation,
  getErrorMessage,
} from '@/lib/services/razorpay';

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

// ============================================
// Constants
// ============================================

const MIN_AMOUNT = 10;
const MAX_AMOUNT = 50000;
const QUICK_AMOUNTS = [100, 500, 1000, 2000];
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 30; // 1 minute max polling

// ============================================
// Types
// ============================================

type TopupState = 'input' | 'creating' | 'checkout' | 'polling' | 'success' | 'error';

// ============================================
// Main Component
// ============================================

export default function WalletTopupScreen() {
  const { user, userType } = useAuth();
  const { formattedBalance, refreshBalance } = useWallet({ fetchTransactions: false });

  const brandColor = userType === 'driver' ? BRAND_PURPLE : BRAND_ORANGE;
  const lightBrandBg = userType === 'driver' ? '#F3EEFE' : '#FFF0E8';

  // Form state
  const [amount, setAmount] = useState<string>('');
  const [state, setState] = useState<TopupState>('input');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showIosResumeHint, setShowIosResumeHint] = useState(false);

  // Polling refs
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollAttemptsRef = useRef<number>(0);
  const currentOrderIdRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const leftAppDuringCheckoutRef = useRef(false);

  // Parse amount
  const numericAmount = parseFloat(amount) || 0;
  const isValidAmount = numericAmount >= MIN_AMOUNT && numericAmount <= MAX_AMOUNT;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (state !== 'checkout') {
      leftAppDuringCheckoutRef.current = false;
      setShowIosResumeHint(false);
    }
  }, [state]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (state !== 'checkout') {
        leftAppDuringCheckoutRef.current = false;
        return;
      }

      if (
        previousState === 'active' &&
        (nextState === 'inactive' || nextState === 'background')
      ) {
        leftAppDuringCheckoutRef.current = true;
        return;
      }

      if (leftAppDuringCheckoutRef.current && nextState === 'active') {
        setShowIosResumeHint(true);
      }
    });

    return () => subscription.remove();
  }, [state]);

  /**
   * Handle quick amount selection
   */
  const handleQuickAmount = useCallback((value: number) => {
    setAmount(value.toString());
    setErrorMessage(null);
  }, []);

  /**
   * Handle amount input change
   */
  const handleAmountChange = useCallback((text: string) => {
    // Only allow numbers and one decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    
    setAmount(cleaned);
    setErrorMessage(null);
  }, []);

  /**
   * Start polling for order status
   */
  const startPolling = useCallback((orderId: string) => {
    currentOrderIdRef.current = orderId;
    pollAttemptsRef.current = 0;

    pollIntervalRef.current = setInterval(async () => {
      pollAttemptsRef.current += 1;

      try {
        const response = await getOrderStatus(orderId);

        if (response.success && response.data) {
          if (response.data.isPaid) {
            // Payment confirmed by backend
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
            setState('success');
            await refreshBalance();
            dispatchWalletUpdated();
            return;
          }

          if (response.data.status === 'FAILED' || response.data.status === 'EXPIRED') {
            // Payment failed
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
            setState('error');
            setErrorMessage('Payment failed or expired. Please try again.');
            return;
          }
        }

        // Check max attempts
        if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          setState('error');
          setErrorMessage('Payment verification timed out. If amount was debited, it will be credited to your wallet shortly.');
        }
      } catch (err) {
        console.error('[TopUp] Polling error:', err);
        // Continue polling on error
      }
    }, POLL_INTERVAL);
  }, [refreshBalance]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  /**
   * Handle top-up process
   */
  const handleTopup = useCallback(async () => {
    if (!isValidAmount) {
      setErrorMessage(`Enter amount between ₹${MIN_AMOUNT} and ₹${MAX_AMOUNT.toLocaleString()}`);
      return;
    }

    setErrorMessage(null);
    setShowIosResumeHint(false);
    setState('creating');

    try {
      // Step 1: Create order on backend
      const orderResponse = await createTopupOrder(numericAmount);

      if (!orderResponse.success || !orderResponse.data) {
        const errMsg = (orderResponse.error as any)?.message || 'Failed to create payment order';
        setState('error');
        setErrorMessage(errMsg);
        return;
      }

      const order = orderResponse.data.order;

      // Step 2: Open Razorpay checkout
      setState('checkout');

      const checkoutResult = await openCheckout({
        orderId: order.razorpayOrderId,
        keyId: order.keyId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        description: `Wallet Top-up ₹${numericAmount}`,
        prefill: {
          name: user?.fullName || '',
          contact: user?.phone || '',
        },
      });

      if (checkoutResult.success) {
        // Step 3: Payment initiated, start polling
        // DO NOT trust this callback - backend webhook is the source of truth
        setState('polling');
        startPolling(order.orderId);
      } else {
        // Payment cancelled or failed in Razorpay
        setState('input');
        
        if (isUserCancellation(checkoutResult)) {
          // User cancelled - just go back to input state
          setErrorMessage(null);
        } else {
          setErrorMessage(getErrorMessage(checkoutResult));
        }
      }
    } catch (err) {
      console.error('[TopUp] Error:', err);
      setState('error');
      setErrorMessage('An unexpected error occurred. Please try again.');
    }
  }, [isValidAmount, numericAmount, user, startPolling]);

  /**
   * Handle try again
   */
  const handleTryAgain = useCallback(() => {
    stopPolling();
    setState('input');
    setErrorMessage(null);
  }, [stopPolling]);

  /**
   * Handle done (success)
   */
  const handleDone = useCallback(() => {
    router.back();
  }, []);

  // ============================================
  // Render Helpers
  // ============================================

  const renderInputState = () => (
    <>
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          borderRadius: 20,
          backgroundColor: brandColor,
          padding: 20,
          shadowColor: brandColor,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.28,
          shadowRadius: 10,
          elevation: 6,
        }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, fontFamily: 'Figtree_400Regular' }}>
          Current Balance
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 30, fontFamily: 'Figtree_700Bold', marginTop: 6 }}>
          {formattedBalance}
        </Text>
      </View>

      <View style={{ marginHorizontal: 20, marginTop: 24 }}>
        <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>
          Enter Amount
        </Text>
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            backgroundColor: '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            minHeight: 72,
          }}
        >
          <Text style={{ fontSize: 34, fontFamily: 'Figtree_700Bold', color: '#9CA3AF' }}>₹</Text>
          <TextInput
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="0"
            keyboardType="decimal-pad"
            style={{
              flex: 1,
              marginLeft: 8,
              fontSize: 34,
              fontFamily: 'Figtree_700Bold',
              color: '#111827',
              paddingVertical: 14,
            }}
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <Text style={{ marginTop: 10, fontSize: 13, fontFamily: 'Figtree_400Regular', color: '#6B7280' }}>
          Min ₹{MIN_AMOUNT} • Max ₹{MAX_AMOUNT.toLocaleString()}
        </Text>
      </View>

      <View style={{ marginHorizontal: 20, marginTop: 28 }}>
        <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>
          Quick Select
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {QUICK_AMOUNTS.map((value) => {
            const selected = numericAmount === value;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => handleQuickAmount(value)}
                activeOpacity={0.8}
                style={{
                  minWidth: 84,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? lightBrandBg : '#FFFFFF',
                  borderColor: selected ? brandColor : '#E5E7EB',
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: 'Figtree_600SemiBold',
                    color: selected ? brandColor : '#374151',
                  }}
                >
                  ₹{value}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {errorMessage && (
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 16,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#FECACA',
            backgroundColor: '#FEF2F2',
          }}
        >
          <Text style={{ textAlign: 'center', color: '#B91C1C', fontSize: 13, fontFamily: 'Figtree_400Regular' }}>
            {errorMessage}
          </Text>
        </View>
      )}

      <View style={{ marginHorizontal: 20, marginTop: 26, marginBottom: 28 }}>
        <TouchableOpacity
          onPress={handleTopup}
          disabled={!isValidAmount}
          activeOpacity={0.85}
          style={{
            paddingVertical: 15,
            borderRadius: 12,
            backgroundColor: isValidAmount ? brandColor : '#E5E7EB',
          }}
        >
          <Text
            style={{
              textAlign: 'center',
              fontSize: 17,
              fontFamily: 'Figtree_700Bold',
              color: isValidAmount ? '#FFFFFF' : '#9CA3AF',
            }}
          >
            Add ₹{numericAmount > 0 ? numericAmount.toLocaleString() : '0'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderProcessingState = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 48 }}>
      <ActivityIndicator size="large" color={brandColor} />
      <Text style={{ marginTop: 16, fontSize: 20, fontFamily: 'Figtree_700Bold', color: '#111827' }}>
        {state === 'creating' && 'Creating payment order...'}
        {state === 'checkout' && 'Opening payment gateway...'}
        {state === 'polling' && 'Verifying payment...'}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, textAlign: 'center', fontFamily: 'Figtree_400Regular', color: '#6B7280' }}>
        {state === 'polling' && 'Please wait while we confirm your payment'}
      </Text>
      {state === 'checkout' && Platform.OS === 'ios' && (
        <Text style={{ marginTop: 8, fontSize: 13, textAlign: 'center', fontFamily: 'Figtree_400Regular', color: '#6B7280' }}>
          {showIosResumeHint
            ? 'Returned from checkout. If payment did not finish, go back and retry.'
            : 'If checkout opens in another screen, return to UK Drive to continue verification.'}
        </Text>
      )}
    </View>
  );

  const renderSuccessState = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 48 }}>
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 42,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: lightBrandBg,
          marginBottom: 16,
        }}
      >
        <Ionicons name="checkmark" size={48} color={brandColor} />
      </View>
      <Text style={{ fontSize: 28, fontFamily: 'Figtree_700Bold', color: '#111827' }}>
        Payment Successful!
      </Text>
      <Text style={{ marginTop: 8, fontSize: 17, color: '#4B5563', fontFamily: 'Figtree_400Regular' }}>
        ₹{numericAmount.toLocaleString()} added to wallet
      </Text>

      <TouchableOpacity
        onPress={handleDone}
        activeOpacity={0.85}
        style={{ marginTop: 28, paddingHorizontal: 36, paddingVertical: 15, backgroundColor: brandColor, borderRadius: 12 }}
      >
        <Text style={{ color: '#FFFFFF', fontFamily: 'Figtree_700Bold', fontSize: 17 }}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 48 }}>
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 42,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FEF2F2',
          marginBottom: 16,
        }}
      >
        <Ionicons name="close" size={48} color="#EF4444" />
      </View>
      <Text style={{ fontSize: 28, fontFamily: 'Figtree_700Bold', color: '#111827' }}>
        Payment Failed
      </Text>
      {errorMessage && (
        <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 15, color: '#6B7280', fontFamily: 'Figtree_400Regular' }}>
          {errorMessage}
        </Text>
      )}

      <TouchableOpacity
        onPress={handleTryAgain}
        activeOpacity={0.85}
        style={{ marginTop: 28, paddingHorizontal: 36, paddingVertical: 15, backgroundColor: brandColor, borderRadius: 12 }}
      >
        <Text style={{ color: '#FFFFFF', fontFamily: 'Figtree_700Bold', fontSize: 17 }}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#F3F4F6',
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            disabled={state !== 'input' && state !== 'success' && state !== 'error'}
            style={{ marginRight: 14 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={state === 'input' || state === 'success' || state === 'error' ? '#111827' : '#D1D5DB'}
            />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, color: '#111827', fontFamily: 'Figtree_700Bold' }}>
            Top Up Wallet
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {state === 'input' && renderInputState()}
          {(state === 'creating' || state === 'checkout' || state === 'polling') && renderProcessingState()}
          {state === 'success' && renderSuccessState()}
          {state === 'error' && renderErrorState()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
