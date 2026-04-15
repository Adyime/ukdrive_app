/**
 * Referral Screen (Passenger only) — Uber-style white + brand orange
 */

import { useState, useCallback, useEffect } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Share } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getReferral,
  getReferralStatus,
  redeemReferralCode,
  type ReferralResponse,
} from "@/lib/api/referral";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; label: string }> = {
    REWARDED: { bg: "#F0FDF4", text: "#16A34A", label: "Rewarded" },
    QUALIFIED: { bg: "#EFF6FF", text: "#2563EB", label: "Qualified" },
    PENDING: { bg: "#FFFBEB", text: "#D97706", label: "Pending" },
  };
  const cfg = configs[status] ?? {
    bg: "#F3F4F6",
    text: "#6B7280",
    label: status,
  };
  return (
    <View
      style={{
        backgroundColor: cfg.bg,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontFamily: "Figtree_600SemiBold",
          color: cfg.text,
        }}
      >
        {cfg.label}
      </Text>
    </View>
  );
}

function StatBox({
  value,
  label,
  bg,
  textColor,
}: {
  value: number;
  label: string;
  bg: string;
  textColor: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        paddingVertical: 16,
        backgroundColor: bg,
        borderRadius: 14,
        marginHorizontal: 4,
      }}
    >
      <Text
        style={{
          fontSize: 24,
          fontFamily: "Figtree_700Bold",
          color: textColor,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Figtree_400Regular",
          color: "#9CA3AF",
          marginTop: 3,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function ReferralScreen() {
  const { userType } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [isRedeemed, setIsRedeemed] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const fetchReferral = useCallback(async () => {
    try {
      setError(null);
      const [referralRes, statusRes] = await Promise.all([
        getReferral(),
        getReferralStatus(),
      ]);
      if (referralRes.success && referralRes.data) {
        setData(referralRes.data);
      } else {
        setError(
          (referralRes.error as { message?: string })?.message ||
            "Failed to load referral info"
        );
        setData(null);
      }
      // Status: if 404/NOT_FOUND (endpoint missing on older backend), treat as not redeemed
      if (statusRes?.success && statusRes.data != null) {
        setIsRedeemed(statusRes.data.isRedeemed ?? false);
      } else if (statusRes?.error?.code === "NOT_FOUND") {
        setIsRedeemed(false);
      }
    } catch {
      setError("Something went wrong");
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReferral();
  }, [fetchReferral]);

  const copyCode = useCallback(async () => {
    if (!data?.referralCode) return;
    await Clipboard.setStringAsync(data.referralCode);
    toast.success("Referral code copied to clipboard.");
  }, [data?.referralCode]);

  const shareCode = useCallback(async () => {
    if (!data?.referralCode) return;
    try {
      await Share.share({
        message: `Use my UK Drive referral code ${data.referralCode} when you sign up!`,
        title: "UK Drive Referral",
      });
    } catch {}
  }, [data?.referralCode]);

  const handleRedeem = useCallback(async () => {
    if (redeemLoading) return;
    if (isRedeemed) return;
    const trimmed = redeemInput.trim();
    setRedeemError(null);
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
      data?.referralCode &&
      trimmed.toLowerCase() === data.referralCode.toLowerCase()
    ) {
      setRedeemError("You cannot use your own referral code");
      return;
    }
    setRedeemLoading(true);
    try {
      const res = await redeemReferralCode(trimmed);
      if (res?.success) {
        toast.success("Referral redeemed successfully!");
        setIsRedeemed(true);
        setRedeemInput("");
        setRedeemError(null);
        return;
      }
      if (res?.error?.code === "ALREADY_REDEEMED") {
        toast.error("Referral already redeemed");
        setIsRedeemed(true);
        return;
      }
      const msg = res?.error?.message ?? "Invalid code";
      toast.error(msg);
      setRedeemError(msg);
    } catch {
      toast.error("Network error. Please try again.");
      setRedeemError("Network error. Please try again.");
    } finally {
      setRedeemLoading(false);
    }
  }, [
    redeemLoading,
    redeemInput,
    data?.referralCode,
    isRedeemed,
    toast,
  ]);

  useEffect(() => {
    if (userType === "passenger") fetchReferral();
    else setLoading(false);
  }, [fetchReferral, userType]);

  // Shared header
  const Header = () => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
      }}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        style={{ marginRight: 14 }}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text
        style={{
          fontSize: 22,
          fontFamily: "Figtree_700Bold",
          color: "#111827",
        }}
      >
        Referral
      </Text>
    </View>
  );

  if (userType === "driver") {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        edges={["top"]}
      >
        <Header />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: "#EDE4FB",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Ionicons name="people-outline" size={38} color={BRAND_PURPLE} />
          </View>
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Figtree_700Bold",
              color: "#111827",
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            Passengers Only
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Figtree_400Regular",
              color: "#6B7280",
              textAlign: "center",
            }}
          >
            Referrals are available for passengers only.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      edges={["top"]}
    >
      <Header />

      {loading && !data ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={BRAND_ORANGE} />
          <Text
            style={{
              marginTop: 14,
              color: "#6B7280",
              fontFamily: "Figtree_400Regular",
              fontSize: 14,
            }}
          >
            Loading referral info…
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={BRAND_ORANGE}
              colors={[BRAND_ORANGE]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {error && (
            <View
              style={{
                marginBottom: 16,
                padding: 14,
                backgroundColor: "#FEE2E2",
                borderRadius: 14,
              }}
            >
              <Text
                style={{
                  color: "#991B1B",
                  fontFamily: "Figtree_400Regular",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            </View>
          )}

          {data && (
            <>
              {/* Code card */}
              <View
                style={{
                  backgroundColor: BRAND_ORANGE,
                  borderRadius: 20,
                  padding: 24,
                  marginBottom: 16,
                  shadowColor: BRAND_ORANGE,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.3,
                  shadowRadius: 10,
                  elevation: 6,
                }}
              >
                <Text
                  style={{
                    color: "rgba(255,255,255,0.8)",
                    fontSize: 13,
                    fontFamily: "Figtree_400Regular",
                    marginBottom: 6,
                  }}
                >
                  Your referral code
                </Text>
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 30,
                    fontFamily: "Figtree_700Bold",
                    letterSpacing: 4,
                  }}
                >
                  {data.referralCode}
                </Text>
                <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={copyCode}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(255,255,255,0.22)",
                      borderRadius: 12,
                      paddingVertical: 12,
                    }}
                  >
                    <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 14,
                        marginLeft: 6,
                      }}
                    >
                      Copy
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={shareCode}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(255,255,255,0.22)",
                      borderRadius: 12,
                      paddingVertical: 12,
                    }}
                  >
                    <Ionicons name="share-outline" size={18} color="#FFFFFF" />
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 14,
                        marginLeft: 6,
                      }}
                    >
                      Share
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Progress stats */}
              <View
                style={{
                  backgroundColor: "#F9FAFB",
                  borderRadius: 20,
                  padding: 20,
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Figtree_700Bold",
                    color: "#111827",
                    marginBottom: 14,
                  }}
                >
                  Progress
                </Text>
                <View style={{ flexDirection: "row" }}>
                  <StatBox
                    value={data.progress.total}
                    label="Total"
                    bg="#FFFFFF"
                    textColor="#111827"
                  />
                  <StatBox
                    value={data.progress.pending}
                    label="Pending"
                    bg="#FFFBEB"
                    textColor="#D97706"
                  />
                  <StatBox
                    value={data.progress.qualified}
                    label="Qualified"
                    bg="#EFF6FF"
                    textColor="#2563EB"
                  />
                  <StatBox
                    value={data.progress.rewarded}
                    label="Rewarded"
                    bg="#F0FDF4"
                    textColor="#16A34A"
                  />
                </View>
              </View>

              {/* Redeem section: below stats */}
              <View
                style={{
                  backgroundColor: "#F9FAFB",
                  borderRadius: 20,
                  padding: 20,
                  marginTop: 16,
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Figtree_700Bold",
                    color: "#111827",
                    marginBottom: 14,
                  }}
                >
                  Have a referral ID?
                </Text>
                {isRedeemed ? (
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Figtree_500Medium",
                      color: "#6B7280",
                    }}
                  >
                    Referral already redeemed
                  </Text>
                ) : (
                  <>
                    <View style={{ marginBottom: 12 }}>
                      <Input
                        label="Enter referral ID"
                        value={redeemInput}
                        onChangeText={(t) => {
                          setRedeemInput(t);
                          setRedeemError(null);
                        }}
                        placeholder="Enter referral code"
                        editable={!isRedeemed}
                        error={redeemError ?? undefined}
                        focusColor={BRAND_ORANGE}
                      />
                    </View>
                    <Button
                      onPress={handleRedeem}
                      loading={redeemLoading}
                      disabled={isRedeemed || redeemLoading}
                      className="mt-1"
                    >
                      Redeem
                    </Button>
                  </>
                )}
              </View>

              {/* Reward info */}
              {data?.rewardInfo && (
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 20,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontFamily: "Figtree_700Bold",
                      color: "#111827",
                      marginBottom: 8,
                    }}
                  >
                    Reward
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Figtree_400Regular",
                      color: "#6B7280",
                      lineHeight: 20,
                    }}
                  >
                    {data?.rewardInfo?.description}
                  </Text>
                </View>
              )}

              {/* Referrals list */}
              {(data?.referrals?.length ?? 0) > 0 && (
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 20,
                    overflow: "hidden",
                    paddingHorizontal: 20,
                    paddingTop: 20,
                    paddingBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontFamily: "Figtree_700Bold",
                      color: "#111827",
                      marginBottom: 12,
                    }}
                  >
                    Referrals
                  </Text>
                  {(data?.referrals ?? []).slice(0, 20).map((r) => (
                    <View
                      key={r.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 12,
                        borderTopWidth: 1,
                        borderTopColor: "#F3F4F6",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: "Figtree_400Regular",
                          color: "#6B7280",
                        }}
                      >
                        {new Date(r.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                      <StatusBadge status={r.status} />
                    </View>
                  ))}
                  {(data?.referrals?.length ?? 0) > 20 && (
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Figtree_400Regular",
                        color: "#9CA3AF",
                        paddingBottom: 12,
                      }}
                    >
                      +{(data?.referrals?.length ?? 0) - 20} more
                    </Text>
                  )}
                </View>
              )}
            </>
          )}

          {!loading && !data && !error && (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: "#FFF0E8",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <Ionicons
                  name="git-network-outline"
                  size={38}
                  color={BRAND_ORANGE}
                />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Figtree_700Bold",
                  color: "#111827",
                  marginBottom: 6,
                }}
              >
                No referral data
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "Figtree_400Regular",
                  color: "#6B7280",
                  textAlign: "center",
                }}
              >
                Your referral info will appear here.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
