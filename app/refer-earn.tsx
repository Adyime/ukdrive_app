/**
 * Refer & Earn Screen
 * Shows user's referral code (copy/share), redeem section with validation.
 * Uses parallel API calls, defensive response handling, and locks redeem when already redeemed.
 */

import { useState, useCallback, useEffect } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, ScrollView, TouchableOpacity, ActivityIndicator, Share, StyleSheet } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getMyReferralCode,
  getReferralStatus,
  redeemReferralCode,
} from "@/lib/api/referral";

const BRAND_ORANGE = "#F36D14";

// ---------------------------------------------------------------------------
// ReferralCard – reusable card: large code, copy + share (disabled until code loaded)
// ---------------------------------------------------------------------------
function ReferralCard({
  referralCode,
  onCopy,
  onShare,
  loading,
}: {
  referralCode: string | null;
  onCopy: () => void;
  onShare: () => void;
  loading: boolean;
}) {
  const disabled = !referralCode || loading;
  return (
    <View style={styles.codeCard}>
      <Text style={styles.codeLabel}>Your referral code</Text>
      <Text style={styles.codeValue}>{referralCode || "—"}</Text>
      <View style={styles.codeActions}>
        <TouchableOpacity
          style={[styles.codeButton, disabled && styles.codeButtonDisabled]}
          onPress={onCopy}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <Ionicons
            name="copy-outline"
            size={18}
            color={disabled ? "#9CA3AF" : "#FFFFFF"}
          />
          <Text
            style={[
              styles.codeButtonText,
              disabled && styles.codeButtonTextDisabled,
            ]}
          >
            Copy
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.codeButton, disabled && styles.codeButtonDisabled]}
          onPress={onShare}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <Ionicons
            name="share-outline"
            size={18}
            color={disabled ? "#9CA3AF" : "#FFFFFF"}
          />
          <Text
            style={[
              styles.codeButtonText,
              disabled && styles.codeButtonTextDisabled,
            ]}
          >
            Share
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ReferEarnScreen
// ---------------------------------------------------------------------------
export default function ReferEarnScreen() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [isRedeemed, setIsRedeemed] = useState(false);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemError, setRedeemError] = useState("");
  const [redeemSuccess, setRedeemSuccess] = useState(false);

  // Load my code and status in parallel; defensive response handling
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [codeRes, statusRes] = await Promise.all([
        getMyReferralCode(),
        getReferralStatus(),
      ]);

      if (codeRes.success && codeRes.data?.referralCode) {
        setReferralCode(codeRes.data.referralCode);
      } else {
        toast.error(
          codeRes.error?.message || "Failed to load referral code"
        );
      }

      // Status: if 404/NOT_FOUND (endpoint missing on older backend), treat as not redeemed
      if (statusRes?.success && typeof statusRes.data?.isRedeemed === "boolean") {
        setIsRedeemed(statusRes.data.isRedeemed);
      } else if (statusRes?.error?.code === "NOT_FOUND") {
        setIsRedeemed(false);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopy = useCallback(async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(referralCode);
    toast.success("Referral code copied");
  }, [referralCode, toast]);

  const handleShare = useCallback(async () => {
    if (!referralCode) return;
    try {
      await Share.share({
        message: `Join this app & get ₹50 bonus! Use my code: ${referralCode}`,
        title: "Refer & Earn",
      });
    } catch {
      // User cancelled or share failed – no toast needed for cancel
    }
  }, [referralCode]);

  // Validation: required, min 6, alphanumeric only, not own code (case-insensitive)
  const handleRedeem = useCallback(async () => {
    if (redeemLoading) return;
    if (isRedeemed) return;

    const trimmed = redeemInput.trim();
    setRedeemError("");
    setRedeemSuccess(false);

    if (!trimmed) {
      setRedeemError("Enter a referral code");
      return;
    }
    if (trimmed.length < 6) {
      setRedeemError("Referral code must be at least 6 characters");
      return;
    }
    if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
      setRedeemError("Referral code can only contain letters and numbers");
      return;
    }
    if (
      referralCode &&
      trimmed.toLowerCase() === referralCode.toLowerCase()
    ) {
      setRedeemError("You cannot use your own referral code");
      return;
    }

    setRedeemLoading(true);
    try {
      const res = await redeemReferralCode(trimmed);
      if (res.success) {
        toast.success("Referral redeemed successfully!");
        setIsRedeemed(true);
        setRedeemInput("");
        setRedeemError("");
        setRedeemSuccess(true);
        return;
      }
      if (res.error?.code === "ALREADY_REDEEMED") {
        toast.error("Referral already redeemed");
        setIsRedeemed(true);
        setRedeemSuccess(false);
        return;
      }
      toast.error(res.error?.message || "Invalid code");
      setRedeemError(res.error?.message || "Invalid code");
    } catch {
      toast.error("Network error. Please retry.");
      setRedeemError("Network error. Please retry.");
    } finally {
      setRedeemLoading(false);
    }
  }, [
    redeemLoading,
    redeemInput,
    referralCode,
    isRedeemed,
    toast,
  ]);

  const Header = () => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.headerBack}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Refer & Earn</Text>
    </View>
  );

  if (loading && !referralCode) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND_ORANGE} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Text style={styles.heroTitle}>Start with ₹50!</Text>
        <Text style={styles.heroLine}>New User Bonus: ₹50</Text>
        <Text style={styles.heroLine}>
          Referral Reward: ₹20 (only for you)
        </Text>

        {/* Referral code card or fallback */}
        {referralCode ? (
          <ReferralCard
            referralCode={referralCode}
            onCopy={handleCopy}
            onShare={handleShare}
            loading={loading}
          />
        ) : (
          <Text style={styles.mutedText}>
            Referral code not available
          </Text>
        )}

        {/* Redeem section */}
        <View style={styles.redeemSection}>
          <Text style={styles.redeemTitle}>
            Have a referral ID? Redeem now
          </Text>
          {isRedeemed ? (
            <>
              <Text style={styles.redeemedMessage}>
                Referral already redeemed
              </Text>
              {redeemSuccess && (
                <Text style={styles.successText}>
                  Referral applied successfully!
                </Text>
              )}
            </>
          ) : (
            <>
              <View style={styles.redeemInputWrap}>
                <Input
                  label="Enter referral ID"
                  value={redeemInput}
                  onChangeText={(t) => {
                    setRedeemInput(t);
                    setRedeemError("");
                  }}
                  placeholder="Enter referral code"
                  editable={!isRedeemed}
                  error={redeemError || undefined}
                  focusColor={BRAND_ORANGE}
                />
              </View>
              <Button
                onPress={handleRedeem}
                loading={redeemLoading}
                disabled={isRedeemed || redeemLoading}
                className="mt-2"
              >
                Redeem
              </Button>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerBack: {
    marginRight: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Figtree_700Bold",
    color: "#111827",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 14,
    color: "#6B7280",
    fontFamily: "Figtree_400Regular",
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: "Figtree_700Bold",
    color: "#111827",
    marginBottom: 8,
  },
  heroLine: {
    fontSize: 15,
    fontFamily: "Figtree_400Regular",
    color: "#6B7280",
    marginBottom: 4,
  },
  codeCard: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: 20,
    padding: 24,
    marginTop: 20,
    marginBottom: 24,
    shadowColor: BRAND_ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  codeLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontFamily: "Figtree_400Regular",
    marginBottom: 6,
  },
  codeValue: {
    color: "#FFFFFF",
    fontSize: 30,
    fontFamily: "Figtree_700Bold",
    letterSpacing: 4,
  },
  codeActions: {
    flexDirection: "row",
    marginTop: 20,
    gap: 10,
  },
  codeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 12,
    paddingVertical: 12,
  },
  codeButtonDisabled: {
    opacity: 0.6,
  },
  codeButtonText: {
    color: "#FFFFFF",
    fontFamily: "Figtree_600SemiBold",
    fontSize: 14,
    marginLeft: 6,
  },
  codeButtonTextDisabled: {
    color: "#E5E7EB",
  },
  mutedText: {
    marginTop: 20,
    marginBottom: 24,
    fontSize: 14,
    fontFamily: "Figtree_400Regular",
    color: "#6B7280",
  },
  redeemSection: {
    backgroundColor: "#F9FAFB",
    borderRadius: 20,
    padding: 20,
  },
  redeemTitle: {
    fontSize: 16,
    fontFamily: "Figtree_700Bold",
    color: "#111827",
    marginBottom: 14,
  },
  redeemInputWrap: {
    marginBottom: 12,
  },
  redeemedMessage: {
    fontSize: 14,
    fontFamily: "Figtree_500Medium",
    color: "#6B7280",
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    fontFamily: "Figtree_600SemiBold",
    color: "#16A34A",
  },
});
