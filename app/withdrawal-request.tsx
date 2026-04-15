/**
 * Withdrawal Request Screen
 * Allows drivers to request withdrawal of their wallet balance
 *
 * Validation is handled by backend - display errors directly
 */

import { useState, useCallback } from "react";
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/context/auth-context";
import { useWallet } from "@/hooks/useWallet";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import {
  formatAmount,
  type BankDetails,
  type WithdrawalMethod,
} from "@/lib/api/wallet";

// ============================================
// Constants
// ============================================

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 50000;

// ============================================
// Main Component
// ============================================

export default function WithdrawalRequestScreen() {
  const { userType } = useAuth();
  const isDriver = userType === "driver";

  const {
    balance,
    formattedBalance,
    loading: walletLoading,
    refreshBalance,
  } = useWallet({ fetchTransactions: false });
  const {
    requestWithdrawal,
    isSubmitting,
    error: withdrawalError,
  } = useWithdrawals({ autoFetch: false });

  // Form state
  const [amount, setAmount] = useState<string>("");
  const [withdrawalMethod, setWithdrawalMethod] =
    useState<WithdrawalMethod>("BANK");
  const [upiId, setUpiId] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState<string>("");
  const [ifscCode, setIfscCode] = useState<string>("");
  const [accountHolderName, setAccountHolderName] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Parse amount
  const numericAmount = parseFloat(amount) || 0;

  // Validation
  const isValidAmount =
    numericAmount >= MIN_AMOUNT &&
    numericAmount <= MAX_AMOUNT &&
    numericAmount <= balance;
  const isValidAccountNumber =
    accountNumber.length >= 9 && accountNumber.length <= 18;
  const accountNumbersMatch = accountNumber === confirmAccountNumber;
  const isValidIfsc = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase());
  const isValidName = accountHolderName.trim().length >= 2;
  const isUpiMethod = withdrawalMethod === "UPI";
  const isValidUpi = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(
    upiId.trim()
  );
  const isValidBankDetails =
    isValidAccountNumber && accountNumbersMatch && isValidIfsc && isValidName;

  const canSubmit =
    isValidAmount &&
    (isUpiMethod ? isValidUpi : isValidBankDetails) &&
    !isSubmitting;

  /**
   * Handle amount change
   */
  const handleAmountChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    setAmount(cleaned);
    setLocalError(null);
  }, []);

  /**
   * Handle max amount
   */
  const handleMaxAmount = useCallback(() => {
    const maxWithdrawable = Math.min(balance, MAX_AMOUNT);
    setAmount(maxWithdrawable.toString());
    setLocalError(null);
  }, [balance]);

  /**
   * Handle IFSC change (auto uppercase)
   */
  const handleIfscChange = useCallback((text: string) => {
    setIfscCode(
      text
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 11)
    );
    setLocalError(null);
  }, []);

  /**
   * Handle submission
   */
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setLocalError(null);

    // Client-side validation messages
    if (!isValidAmount) {
      if (numericAmount > balance) {
        setLocalError("Amount exceeds available balance");
      } else {
        setLocalError(
          `Amount must be between ₹${MIN_AMOUNT} and ₹${MAX_AMOUNT.toLocaleString()}`
        );
      }
      return;
    }

    let result = null;

    if (isUpiMethod) {
      if (!upiId.trim()) {
        setLocalError("UPI ID is required");
        return;
      }

      if (!isValidUpi) {
        setLocalError("Invalid UPI ID format");
        return;
      }

      result = await requestWithdrawal(numericAmount, {
        withdrawalMethod: "UPI",
        upiId: upiId.trim(),
      });
    } else {
      if (!accountNumbersMatch) {
        setLocalError("Account numbers do not match");
        return;
      }

      if (!isValidIfsc) {
        setLocalError("Invalid IFSC code format");
        return;
      }

      const bankDetails: BankDetails = {
        accountNumber: accountNumber,
        ifscCode: ifscCode.toUpperCase(),
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim() || undefined,
      };

      result = await requestWithdrawal(numericAmount, {
        withdrawalMethod: "BANK",
        bankDetails,
      });
    }

    if (result) {
      setSuccess(true);
      // Refresh wallet balance after successful withdrawal request
      await refreshBalance();
    }
  }, [
    canSubmit,
    isValidAmount,
    numericAmount,
    balance,
    isUpiMethod,
    upiId,
    isValidUpi,
    accountNumbersMatch,
    isValidIfsc,
    accountNumber,
    ifscCode,
    accountHolderName,
    bankName,
    requestWithdrawal,
    refreshBalance,
  ]);

  // Redirect non-drivers (after all hooks to satisfy rules-of-hooks)
  if (!isDriver) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
        <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center px-8">
          Only drivers can request withdrawals
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ backgroundColor: "#843FE3" }}
          className="mt-4 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-medium">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Success state
  if (success) {
    return (
      <SafeAreaView
        className="flex-1 bg-gray-50 dark:bg-gray-900"
        edges={["top", "bottom"]}
      >
        <View className="flex-1 items-center justify-center px-6">
          <View
            className="rounded-full items-center justify-center"
            style={{ width: 96, height: 96, backgroundColor: "#EDE4FB" }}
          >
            <Ionicons name="checkmark-circle" size={64} color="#843FE3" />
          </View>

          <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-6 text-center">
            Request Submitted!
          </Text>
          <Text className="text-base text-gray-500 dark:text-gray-400 mt-2 text-center">
            Your withdrawal request for {formatAmount(numericAmount)} has been
            submitted for review.
          </Text>
          <Text className="text-sm text-gray-400 dark:text-gray-500 mt-4 text-center">
            You will be notified once it is processed.
          </Text>

          <TouchableOpacity
            onPress={() => router.replace("/withdrawal-history")}
            style={{ backgroundColor: "#843FE3" }}
            className="mt-8 px-8 py-4 rounded-xl"
          >
            <Text className="text-white font-semibold text-lg">
              View Withdrawal History
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-4 px-8 py-4"
          >
            <Text style={{ color: "#843FE3" }} className="font-medium">
              Back to Wallet
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-gray-50 dark:bg-gray-900"
      edges={["top"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <TouchableOpacity
            onPress={() => router.back()}
            disabled={isSubmitting}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={isSubmitting ? "#D1D5DB" : "#6B7280"}
            />
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-gray-900 dark:text-gray-100 ml-3">
            Request Withdrawal
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Balance Card */}
          <View
            style={{ backgroundColor: "#843FE3" }}
            className="mx-4 mt-4 p-4 rounded-xl"
          >
            <Text style={{ color: "#EDE4FB" }} className="text-sm">
              Available Balance
            </Text>
            {walletLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-white text-3xl font-bold">
                {formattedBalance}
              </Text>
            )}
          </View>

          {/* Amount Section */}
          <View className="mx-4 mt-6">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Withdrawal Amount
            </Text>
            <View className="flex-row items-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4">
              <Text className="text-2xl font-bold text-gray-400 dark:text-gray-500">
                ₹
              </Text>
              <TextInput
                value={amount}
                onChangeText={handleAmountChange}
                placeholder="0"
                keyboardType="decimal-pad"
                className="flex-1 text-2xl font-bold text-gray-900 dark:text-gray-100 py-4 ml-2"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                onPress={handleMaxAmount}
                style={{ backgroundColor: "#EDE4FB" }}
                className="px-3 py-1 rounded-lg"
              >
                <Text
                  style={{ color: "#843FE3" }}
                  className="font-medium text-sm"
                >
                  MAX
                </Text>
              </TouchableOpacity>
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Min ₹{MIN_AMOUNT} • Max ₹{MAX_AMOUNT.toLocaleString()}
            </Text>
          </View>

          {/* Method Section */}
          <View className="mx-4 mt-6">
            <Text className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Withdrawal Method
            </Text>

            <View className="flex-row mb-4">
              <TouchableOpacity
                onPress={() => {
                  setWithdrawalMethod("UPI");
                  setLocalError(null);
                }}
                style={{
                  backgroundColor: isUpiMethod ? "#EDE4FB" : "#FFFFFF",
                  borderColor: isUpiMethod ? "#843FE3" : "#E5E7EB",
                }}
                className="flex-1 py-3 px-4 rounded-xl border mr-2"
              >
                <Text
                  style={{ color: isUpiMethod ? "#843FE3" : "#6B7280" }}
                  className="text-center font-medium"
                >
                  UPI
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setWithdrawalMethod("BANK");
                  setLocalError(null);
                }}
                style={{
                  backgroundColor: !isUpiMethod ? "#EDE4FB" : "#FFFFFF",
                  borderColor: !isUpiMethod ? "#843FE3" : "#E5E7EB",
                }}
                className="flex-1 py-3 px-4 rounded-xl border ml-2"
              >
                <Text
                  style={{ color: !isUpiMethod ? "#843FE3" : "#6B7280" }}
                  className="text-center font-medium"
                >
                  Bank Transfer
                </Text>
              </TouchableOpacity>
            </View>

            {isUpiMethod ? (
              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  UPI ID
                </Text>
                <TextInput
                  value={upiId}
                  onChangeText={(text) => {
                    setUpiId(text.trim());
                    setLocalError(null);
                  }}
                  placeholder="example@upi"
                  autoCapitalize="none"
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-base text-gray-900 dark:text-gray-100"
                  placeholderTextColor="#9CA3AF"
                />
                {upiId.length > 0 && !isValidUpi && (
                  <Text className="text-xs text-red-500 mt-1">
                    Invalid UPI format (e.g., example@upi)
                  </Text>
                )}
              </View>
            ) : (
              <>
                <Text className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Bank Account Details
                </Text>

                {/* Account Number */}
                <View className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Account Number
                  </Text>
                  <TextInput
                    value={accountNumber}
                    onChangeText={(text) => {
                      setAccountNumber(text.replace(/[^0-9]/g, ""));
                      setLocalError(null);
                    }}
                    placeholder="Enter account number"
                    keyboardType="number-pad"
                    maxLength={18}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-base text-gray-900 dark:text-gray-100"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                {/* Confirm Account Number */}
                <View className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Confirm Account Number
                  </Text>
                  <TextInput
                    value={confirmAccountNumber}
                    onChangeText={(text) => {
                      setConfirmAccountNumber(text.replace(/[^0-9]/g, ""));
                      setLocalError(null);
                    }}
                    placeholder="Re-enter account number"
                    keyboardType="number-pad"
                    maxLength={18}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-base text-gray-900 dark:text-gray-100"
                    placeholderTextColor="#9CA3AF"
                  />
                  {confirmAccountNumber.length > 0 && !accountNumbersMatch && (
                    <Text className="text-xs text-red-500 mt-1">
                      Account numbers do not match
                    </Text>
                  )}
                </View>

                {/* IFSC Code */}
                <View className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    IFSC Code
                  </Text>
                  <TextInput
                    value={ifscCode}
                    onChangeText={handleIfscChange}
                    placeholder="e.g., HDFC0001234"
                    autoCapitalize="characters"
                    maxLength={11}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-base text-gray-900 dark:text-gray-100"
                    placeholderTextColor="#9CA3AF"
                  />
                  {ifscCode.length === 11 && !isValidIfsc && (
                    <Text className="text-xs text-red-500 mt-1">
                      Invalid IFSC format (e.g., HDFC0001234)
                    </Text>
                  )}
                </View>

                {/* Account Holder Name */}
                <View className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Account Holder Name
                  </Text>
                  <TextInput
                    value={accountHolderName}
                    onChangeText={(text) => {
                      setAccountHolderName(text);
                      setLocalError(null);
                    }}
                    placeholder="Enter name as per bank account"
                    autoCapitalize="words"
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-base text-gray-900 dark:text-gray-100"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                {/* Bank Name (Optional) */}
                <View className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Bank Name <Text className="text-gray-400">(Optional)</Text>
                  </Text>
                  <TextInput
                    value={bankName}
                    onChangeText={setBankName}
                    placeholder="e.g., HDFC Bank"
                    autoCapitalize="words"
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-base text-gray-900 dark:text-gray-100"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </>
            )}
          </View>

          {/* Error Messages */}
          {(localError || withdrawalError) && (
            <View className="mx-4 mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
              <Text className="text-red-600 dark:text-red-400 text-center">
                {localError || withdrawalError}
              </Text>
            </View>
          )}

          {/* Info Note */}
          <View className="mx-4 mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={20} color="#3B82F6" />
              <View className="flex-1 ml-2">
                <Text className="text-blue-700 dark:text-blue-300 text-sm">
                  Withdrawal requests are processed within 1-3 business days.
                  You will receive a notification once the transfer is
                  completed.
                </Text>
              </View>
            </View>
          </View>

          {/* Submit Button */}
          <View className="mx-4 mt-6">
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={{ backgroundColor: canSubmit ? "#843FE3" : "#D1D5DB" }}
              className="py-4 rounded-xl"
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text
                  className={`text-center text-lg font-semibold ${
                    canSubmit
                      ? "text-white"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  Request Withdrawal
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
