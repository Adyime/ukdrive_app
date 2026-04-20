/**
 * Account Screen — Uber-inspired dark design
 * Brand orange #F36D14 accent (matches home page)
 */

import { useEffect, useState } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, ScrollView, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { useToast } from "@/components/ui/toast";
import { requestAccountDeletion, updateProfileImage } from "@/lib/api/auth";
import { uploadProfileImage } from "@/lib/api/storage";
import { getLanguageLabel } from "@/lib/i18n/translations";
import { useLanguage } from "@/context/language-context";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";
const BG_DARK = "#ffffff";
const TEXT_PRIMARY = "#000000ff";
const TEXT_SECONDARY = "#000000ff";

// ─── Quick-action card ────────────────────────────────────────────────
function QuickAction({
  icon,
  label,
  onPress,
  accentColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accentColor: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: accentColor,
        borderRadius: 14,
        paddingVertical: 18,
        paddingHorizontal: 16,
        marginHorizontal: 5,
      }}
    >
      <Ionicons name={icon} size={22} color="#FFFFFF" />
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: 14,
          fontFamily: "Figtree_600SemiBold",
          marginTop: 10,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Simple flat menu row ─────────────────────────────────────────────
function MenuItem({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
        paddingHorizontal: 4,
      }}
    >
      <Ionicons
        name={icon}
        size={22}
        color={TEXT_SECONDARY}
        style={{ width: 32 }}
      />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text
          style={{
            color: TEXT_PRIMARY,
            fontSize: 16,
            fontFamily: "Figtree_400Regular",
          }}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: TEXT_SECONDARY,
              fontSize: 13,
              fontFamily: "Figtree_400Regular",
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Thin divider ─────────────────────────────────────────────────────
function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: "rgba(255,255,255,0.06)",
        marginLeft: 44,
      }}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════
export default function AccountScreen() {
  const { user, userType, logout, updateUser } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const toast = useToast();
  const { showAlert } = useAlert();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isUpdatingProfilePhoto, setIsUpdatingProfilePhoto] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const isDriver = userType === "driver";
  const isPassenger = userType === "passenger";

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.profileImageUrl]);

  // ── Logout ──
  const handleLogout = async () => {
    showAlert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            setIsLoggingOut(true);
            await logout();
          } catch (error) {
            console.error("Logout error:", error);
            toast.error("Failed to logout. Please try again.");
          } finally {
            setIsLoggingOut(false);
          }
        },
      },
    ]);
  };

  // ── Delete account ──
  const handleDeleteAccount = () => {
    showAlert(
      "Delete Account",
      "Are you sure you want to delete your account? This action will submit a deletion request to our team.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            showAlert(
              "Confirm Deletion",
              "This cannot be undone. Your account will be deactivated after admin review.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    if (!userType) return;
                    try {
                      setIsDeletingAccount(true);
                      const result = await requestAccountDeletion(userType);
                      if (result.success) {
                        toast.success(
                          "Your account deletion request has been submitted."
                        );
                        logout();
                      } else {
                        const errorMsg =
                          (result.error as any)?.message ||
                          "Failed to submit deletion request. Please try again.";
                        toast.error(errorMsg);
                      }
                    } catch (error) {
                      console.error("Delete account error:", error);
                      toast.error(
                        "Failed to submit deletion request. Please try again."
                      );
                    } finally {
                      setIsDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleUploadPhoto = async () => {
    if (!userType || !user || isUpdatingProfilePhoto) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        legacy: false,
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType || "image/jpeg";
      const fileName =
        asset.fileName ||
        (asset.uri.includes("/") ? asset.uri.split("/").pop() : null) ||
        `profile-${Date.now()}.jpg`;

      setIsUpdatingProfilePhoto(true);

      const uploadResult = await uploadProfileImage({
        uri: asset.uri,
        type: mimeType,
        name: fileName,
      });

      if (!uploadResult.success || !uploadResult.objectKey) {
        const message =
          uploadResult.error &&
          typeof uploadResult.error === "object" &&
          "message" in uploadResult.error
            ? String(uploadResult.error.message)
            : "Failed to upload profile photo.";
        toast.error(message);
        return;
      }

      const updateResult = await updateProfileImage(userType, uploadResult.objectKey);
      if (!updateResult.success || !updateResult.data) {
        const message =
          updateResult.error &&
          typeof updateResult.error === "object" &&
          "message" in updateResult.error
            ? String(updateResult.error.message)
            : "Failed to save profile photo.";
        toast.error(message);
        return;
      }

      await updateUser({
        ...user,
        profileImageUrl: updateResult.data.profileImageUrl,
      });
      toast.success("Profile photo updated.");
    } catch (err) {
      console.error("Profile photo upload error:", err);
      toast.error("Failed to update profile photo. Please try again.");
    } finally {
      setIsUpdatingProfilePhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!userType || !user || isUpdatingProfilePhoto) return;

    if (!user.profileImageUrl) {
      toast.warning("No profile photo to remove.");
      return;
    }

    try {
      setIsUpdatingProfilePhoto(true);
      const updateResult = await updateProfileImage(userType, null);
      if (!updateResult.success || !updateResult.data) {
        const message =
          updateResult.error &&
          typeof updateResult.error === "object" &&
          "message" in updateResult.error
            ? String(updateResult.error.message)
            : "Failed to remove profile photo.";
        toast.error(message);
        return;
      }

      await updateUser({
        ...user,
        profileImageUrl: null,
      });
      toast.success("Profile photo removed.");
    } catch (err) {
      console.error("Profile photo remove error:", err);
      toast.error("Failed to remove profile photo. Please try again.");
    } finally {
      setIsUpdatingProfilePhoto(false);
    }
  };

  const openProfilePhotoActions = () => {
    if (isUpdatingProfilePhoto) return;

    showAlert("Profile Photo", "Choose an action", [
      {
        text: "Upload Photo",
        onPress: handleUploadPhoto,
      },
      {
        text: "Remove Photo",
        style: "destructive",
        onPress: handleRemovePhoto,
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  const openLanguageSelector = () => {
    showAlert(t("Language"), t("Set your preferred language"), [
      {
        text: "English",
        onPress: () => setLanguage("en"),
      },
      {
        text: "हिंदी",
        onPress: () => setLanguage("hi"),
      },
      {
        text: t("Cancel"),
        style: "cancel",
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG_DARK }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile header ────────────────────────────────────── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 24,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: TEXT_PRIMARY,
                fontSize: 30,
                fontFamily: "Figtree_700Bold",
              }}
            >
              {user?.fullName || "UK Drive User"}
            </Text>
            {/* Account type + phone as subtitle */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <View
                style={{
                  backgroundColor: brandColor,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 12,
                  marginRight: 10,
                }}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 11,
                    fontFamily: "Figtree_600SemiBold",
                    textTransform: "capitalize",
                  }}
                >
                  {userType || "User"}
                </Text>
              </View>
              {user?.phone && (
                <Text
                  style={{
                    color: TEXT_SECONDARY,
                    fontSize: 14,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  {user.phone}
                </Text>
              )}
            </View>
          </View>

          {/* Avatar circle */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={openProfilePhotoActions}
            disabled={isUpdatingProfilePhoto}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: brandColor,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: brandColor,
              overflow: "hidden",
            }}
          >
            {user?.profileImageUrl && !avatarLoadFailed ? (
              <Image
                source={{ uri: String(user.profileImageUrl) }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <Ionicons name="person" size={28} color="#FFFFFF" />
            )}
            {isUpdatingProfilePhoto ? (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(0,0,0,0.35)",
                }}
              >
                <ActivityIndicator color="#FFFFFF" size="small" />
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* ── Quick-action grid (2 × 2) ─────────────────────────── */}
        <View style={{ paddingHorizontal: 15, marginBottom: 8 }}>
          {/* Row 1 */}
          <View style={{ flexDirection: "row", marginBottom: 10 }}>
            <QuickAction
              icon="help-circle-outline"
              label="Help"
              onPress={() => router.push("/support")}
              accentColor={brandColor}
            />
            <QuickAction
              icon="wallet-outline"
              label="Wallet"
              onPress={() => router.push("/wallet")}
              accentColor={brandColor}
            />
          </View>
          {/* Row 2 */}
          <View style={{ flexDirection: "row" }}>
            <QuickAction
              icon="time-outline"
              label="History"
              onPress={() => router.push("/(tabs)/history")}
              accentColor={brandColor}
            />
            {isPassenger ? (
              <QuickAction
                icon="people-outline"
                label="Referral"
                onPress={() => router.push("/referral")}
                accentColor={brandColor}
              />
            ) : (
              <QuickAction
                icon="car-outline"
                label="Manage Pool"
                onPress={() => router.push("/(tabs)/manage-car-pool")}
                accentColor={brandColor}
              />
            )}
          </View>
        </View>

        {/* ── Menu list ─────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <MenuItem
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push("/settings")}
          />
          <Divider />

          <MenuItem
            icon="language-outline"
            label="Language"
            subtitle={getLanguageLabel(language)}
            onPress={openLanguageSelector}
          />
          <Divider />

          <MenuItem
            icon="card-outline"
            label="Payment Methods"
            onPress={() => router.push("/payment-methods")}
          />
          <Divider />

          {/* <MenuItem
            icon="location-outline"
            label="Saved Addresses"
            onPress={() => router.push("/saved-addresses")}
          /> */}
          <Divider />

          {/* Driver-only: Manage Ride Share also in flat list */}
          {isDriver && (
            <>
              <MenuItem
                icon="car-sport-outline"
                label="Vehicle Type"
                subtitle="View/change vehicle, subcategory and purpose"
                onPress={() => router.push("/driver-vehicle")}
              />
              <Divider />
              <MenuItem
                icon="gift-outline"
                label="Rewards History"
                subtitle="Track mission rewards and earnings"
                onPress={() => router.push("/driver-rewards-history")}
              />
              <Divider />
            </>
          )}

          <MenuItem
            icon="information-circle-outline"
            label="About UK Drive"
            onPress={() => router.push("/about")}
          />
          <Divider />

          <MenuItem
            icon="document-text-outline"
            label="Terms & Conditions"
            onPress={() => router.push("/terms-conditions")}
          />
          <Divider />

          <MenuItem
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => router.push("/privacy-policy")}
          />
        </View>

        {/* ── Spacer ────────────────────────────────────────────── */}
        <View style={{ height: 32 }} />

        {/* ── Bottom actions ─────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20 }}>
          {/* Logout */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleLogout}
            disabled={isLoggingOut}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
            }}
          >
            <Ionicons
              name="log-out-outline"
              size={22}
              color="#EF4444"
              style={{ width: 32 }}
            />
            <Text
              style={{
                color: "#EF4444",
                fontSize: 16,
                fontFamily: "Figtree_400Regular",
                marginLeft: 8,
              }}
            >
              {isLoggingOut ? "Logging out…" : "Sign Out"}
            </Text>
          </TouchableOpacity>

          <Divider />

          {/* Delete account */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
            }}
          >
            <Ionicons
              name="trash-outline"
              size={22}
              color={TEXT_SECONDARY}
              style={{ width: 32 }}
            />
            <Text
              style={{
                color: TEXT_SECONDARY,
                fontSize: 16,
                fontFamily: "Figtree_400Regular",
                marginLeft: 8,
              }}
            >
              {isDeletingAccount ? "Submitting…" : "Delete Account"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── App branding ──────────────────────────────────────── */}
        <View style={{ alignItems: "center", marginTop: 32 }}>
          <Text
            style={{
              color: TEXT_SECONDARY,
              fontSize: 12,
              fontFamily: "Figtree_400Regular",
            }}
          >
            v1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
