import { useCallback, useEffect, useMemo, useState } from "react";
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  ActivityIndicator, Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import { ImagePickerComponent } from "@/components/ui/image-picker";
import {
  getDriverProfile,
  type DriverProfileResponse,
  updateDriverVehicle,
} from "@/lib/api/driver";
import { uploadDocumentImage } from "@/lib/api/storage";
import {
  getVehicleOptions,
  type VehiclePurpose,
} from "@/lib/api/vehicle-options";

const BRAND_PURPLE = "#843FE3";

type DriverVehicleOption = {
  id: string;
  label: string;
  categoryName: string;
  subcategoryName: string;
  supportedPurposes: VehiclePurpose[];
};

function supportsPurpose(
  option: DriverVehicleOption,
  purpose: VehiclePurpose
): boolean {
  if (purpose === "both") return option.supportedPurposes.includes("both");
  return (
    option.supportedPurposes.includes("both") ||
    option.supportedPurposes.includes(purpose)
  );
}

function buildSubcategoryLabel(profile: DriverProfileResponse | null): string {
  if (!profile?.vehicleSubcategory) return "No subcategory assigned";
  const categoryName = profile.vehicleSubcategory.category?.name;
  const subcategoryName = profile.vehicleSubcategory.name;
  return categoryName ? `${categoryName} - ${subcategoryName}` : subcategoryName;
}

function buildCurrentVehicleTypeLabel(profile: DriverProfileResponse | null): string {
  const categoryName = profile?.vehicleSubcategory?.category?.name?.trim();
  if (categoryName) return categoryName;
  const subcategoryName = profile?.vehicleSubcategory?.name?.trim();
  if (subcategoryName) return subcategoryName;
  return "Not set";
}

function formatPurposeLabel(purpose: VehiclePurpose | null | undefined): string {
  if (!purpose) return "Not set";
  if (purpose === "passenger") return "Passenger";
  if (purpose === "delivery") return "Delivery";
  return "Both";
}

function buildRequestedSubcategoryLabel(profile: DriverProfileResponse | null): string {
  const pending = profile?.vehicleChangeRequest?.target?.vehicleSubcategory;
  if (!pending) return "No requested subcategory";
  const categoryName = pending.category?.name;
  return categoryName ? `${categoryName} - ${pending.name}` : pending.name;
}

function buildRequestedVehicleTypeLabel(profile: DriverProfileResponse | null): string {
  const pendingTarget = profile?.vehicleChangeRequest?.target;
  const categoryName = pendingTarget?.vehicleSubcategory?.category?.name?.trim();
  if (categoryName) return categoryName;
  const subcategoryName = pendingTarget?.vehicleSubcategory?.name?.trim();
  if (subcategoryName) return subcategoryName;
  return "Not set";
}

function buildVehicleRequestStatusUi(status: "pending" | "approved" | "rejected") {
  if (status === "approved") {
    return { bg: "#ECFDF3", border: "#ABEFC6", text: "#067647", label: "Approved" };
  }
  if (status === "rejected") {
    return { bg: "#FEF3F2", border: "#FECDCA", text: "#B42318", label: "Rejected" };
  }
  return { bg: "#EFF8FF", border: "#B2DDFF", text: "#175CD3", label: "Pending Review" };
}

export default function DriverVehicleScreen() {
  const { userType } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomScrollPadding =
    Platform.OS === "android"
      ? Math.max(insets.bottom + 24, 72)
      : insets.bottom + 24;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<DriverProfileResponse | null>(null);
  const [allVehicleOptions, setAllVehicleOptions] = useState<DriverVehicleOption[]>(
    []
  );
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
  const [selectedPurpose, setSelectedPurpose] = useState<VehiclePurpose>("both");
  const [rcImages, setRcImages] = useState<{ front: string; back: string }>({
    front: "",
    back: "",
  });
  const [requestedRegistration, setRequestedRegistration] = useState("");
  const [rcPreviews, setRcPreviews] = useState<{ front: string; back: string }>({
    front: "",
    back: "",
  });
  const [uploadingRc, setUploadingRc] = useState<{ front: boolean; back: boolean }>({
    front: false,
    back: false,
  });
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});

  const currentSubcategoryId = profile?.vehicleSubcategoryId ?? "";
  const currentPurpose = profile?.driverPurpose ?? "both";
  const subcategoryChanged =
    selectedSubcategoryId.length > 0 &&
    selectedSubcategoryId !== currentSubcategoryId;
  const purposeChanged = selectedPurpose !== currentPurpose;
  const hasChanges = subcategoryChanged || purposeChanged;
  const pendingVehicleChange = profile?.vehicleChangeRequest ?? null;
  const isUploadingRc = uploadingRc.front || uploadingRc.back;

  const visibleVehicleOptions = useMemo(
    () =>
      allVehicleOptions.filter((option) =>
        supportsPurpose(option, selectedPurpose)
      ),
    [allVehicleOptions, selectedPurpose]
  );

  const groupedVehicleOptions = useMemo(() => {
    const groups = new Map<string, DriverVehicleOption[]>();

    for (const option of visibleVehicleOptions) {
      const categoryKey = option.categoryName?.trim() || "Other";
      const current = groups.get(categoryKey) ?? [];
      current.push(option);
      groups.set(categoryKey, current);
    }

    return Array.from(groups.entries())
      .map(([categoryName, options]) => ({
        categoryName,
        options: [...options].sort((a, b) =>
          a.subcategoryName.localeCompare(b.subcategoryName)
        ),
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [visibleVehicleOptions]);

  const selectedOption = useMemo(
    () =>
      allVehicleOptions.find((opt) => opt.id === selectedSubcategoryId) ?? null,
    [allVehicleOptions, selectedSubcategoryId]
  );

  useEffect(() => {
    setExpandedCategories((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;

      const activeCategory =
        selectedOption?.categoryName ??
        groupedVehicleOptions[0]?.categoryName ??
        null;

      for (const group of groupedVehicleOptions) {
        if (Object.prototype.hasOwnProperty.call(prev, group.categoryName)) {
          next[group.categoryName] = prev[group.categoryName];
        } else {
          next[group.categoryName] = group.categoryName === activeCategory;
          changed = true;
        }
      }

      const prevKeys = Object.keys(prev);
      if (prevKeys.length !== Object.keys(next).length) {
        changed = true;
      }

      if (
        !changed &&
        prevKeys.every((key) => prev[key] === next[key])
      ) {
        return prev;
      }

      return next;
    });
  }, [groupedVehicleOptions, selectedOption?.categoryName]);

  const loadData = useCallback(async () => {
    if (userType !== "driver") return;

    setLoading(true);
    try {
      const [profileRes, rideOptionsRes, porterOptionsRes] = await Promise.all([
        getDriverProfile(),
        getVehicleOptions("ride"),
        getVehicleOptions("porter"),
      ]);

      if (!profileRes.success || !profileRes.data) {
        const message =
          (profileRes.error as { message?: string } | undefined)?.message ??
          "Failed to load driver vehicle details.";
        toast.error(message);
        return;
      }

      const profileData = profileRes.data;
      setProfile(profileData);
      setSelectedSubcategoryId(profileData.vehicleSubcategoryId ?? "");
      setSelectedPurpose(profileData.driverPurpose);
      const pendingDocs = profileData.vehicleChangeRequest?.documents;
      const pendingTarget = profileData.vehicleChangeRequest?.target;
      setRequestedRegistration(pendingTarget?.vehicleRegistration ?? "");
      setRcImages({
        front: pendingDocs?.front_image ?? "",
        back: pendingDocs?.back_image ?? "",
      });
      setRcPreviews({
        front:
          pendingDocs?.front_preview_url ??
          pendingDocs?.front_image ??
          "",
        back:
          pendingDocs?.back_preview_url ??
          pendingDocs?.back_image ??
          "",
      });

      const merged = new Map<string, DriverVehicleOption>();
      const appendOptions = (
        res: Awaited<ReturnType<typeof getVehicleOptions>>
      ) => {
        if (!res.success || !res.data?.categories) return;
        for (const category of res.data.categories) {
          for (const subcategory of category.subcategories) {
            if (merged.has(subcategory.id)) continue;
            merged.set(subcategory.id, {
              id: subcategory.id,
              label:
                category.name +
                (subcategory.name !== "Standard"
                  ? ` - ${subcategory.name}`
                  : ""),
              categoryName: category.name,
              subcategoryName: subcategory.name,
              supportedPurposes:
                subcategory.supportedPurposes?.length > 0
                  ? subcategory.supportedPurposes
                  : (["both"] as VehiclePurpose[]),
            });
          }
        }
      };

      appendOptions(rideOptionsRes);
      appendOptions(porterOptionsRes);

      const allOptions = Array.from(merged.values()).sort((a, b) =>
        a.label.localeCompare(b.label)
      );
      setAllVehicleOptions(allOptions);
    } catch (err) {
      console.error("Driver vehicle load error:", err);
      toast.error("Failed to load vehicle options.");
    } finally {
      setLoading(false);
    }
  }, [toast, userType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateVehicle = async () => {
    if (!profile) {
      toast.error("Driver profile is not available.");
      return;
    }

    if (!hasChanges) {
      toast.error("No changes selected.");
      return;
    }

    const targetSubcategoryId = subcategoryChanged
      ? selectedSubcategoryId
      : currentSubcategoryId;
    if (targetSubcategoryId) {
      const targetOption = allVehicleOptions.find(
        (option) => option.id === targetSubcategoryId
      );
      if (targetOption && !supportsPurpose(targetOption, selectedPurpose)) {
        toast.error(
          "Selected vehicle does not support the selected service purpose."
        );
        return;
      }
    }

    const payload: {
      vehicleSubcategoryId?: string;
      driverPurpose?: VehiclePurpose;
      vehicleRegistration?: string;
      rcImageUrl?: string;
      rcBackImageUrl?: string;
    } = {};
    if (subcategoryChanged) payload.vehicleSubcategoryId = selectedSubcategoryId;
    if (purposeChanged) payload.driverPurpose = selectedPurpose;

    if (subcategoryChanged) {
      const normalizedRegistration = requestedRegistration.trim().toUpperCase();
      if (!normalizedRegistration) {
        toast.error("Please enter the new vehicle registration number.");
        return;
      }
      if (!/^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/.test(normalizedRegistration)) {
        toast.error("Please enter a valid vehicle registration number.");
        return;
      }
      payload.vehicleRegistration = normalizedRegistration;

      const rcFront = rcImages.front.trim();
      const rcBack = rcImages.back.trim();
      if (!rcFront || !rcBack) {
        toast.error(
          "Please upload both front and back RC images to request vehicle change."
        );
        return;
      }
      payload.rcImageUrl = rcFront;
      payload.rcBackImageUrl = rcBack;
    }

    setSaving(true);
    try {
      const response = await updateDriverVehicle(payload);

      if (!response.success || !response.data) {
        const message =
          (response.error as { message?: string } | undefined)?.message ??
          "Failed to update vehicle.";
        toast.error(message);
        return;
      }

      toast.success(
        response.data.requiresVehicleReview
          ? "Vehicle change request submitted. Admin will review your RC documents."
          : "Vehicle purpose updated successfully."
      );
      await loadData();
    } catch (err) {
      console.error("Driver vehicle update error:", err);
      toast.error("Failed to update vehicle.");
    } finally {
      setSaving(false);
    }
  };

  if (userType !== "driver") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              color: "#111827",
              fontFamily: "Figtree_600SemiBold",
              textAlign: "center",
            }}
          >
            This section is available for drivers only.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.8}
            style={{
              marginTop: 16,
              backgroundColor: BRAND_PURPLE,
              borderRadius: 10,
              paddingVertical: 10,
              paddingHorizontal: 18,
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: "Figtree_600SemiBold",
                fontSize: 14,
              }}
            >
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }} edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 12,
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
          Vehicle Type
        </Text>
      </View>

      {loading ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="large" color={BRAND_PURPLE} />
          <Text
            style={{
              marginTop: 12,
              fontSize: 14,
              color: "#6B7280",
              fontFamily: "Figtree_500Medium",
            }}
          >
            Loading vehicle details...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: bottomScrollPadding,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              borderRadius: 14,
              backgroundColor: "#F9FAFB",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              padding: 14,
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: "#6B7280",
                fontFamily: "Figtree_500Medium",
                marginBottom: 6,
              }}
            >
              Current vehicle
            </Text>
            <Text
              style={{
                fontSize: 18,
                color: "#111827",
                fontFamily: "Figtree_700Bold",
              }}
            >
              {buildCurrentVehicleTypeLabel(profile)}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "#4B5563",
                fontFamily: "Figtree_500Medium",
                marginTop: 2,
              }}
            >
              {buildSubcategoryLabel(profile)}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: "#6B7280",
                fontFamily: "Figtree_400Regular",
                marginTop: 6,
              }}
            >
              Purpose: {formatPurposeLabel(profile?.driverPurpose)}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: "#6B7280",
                fontFamily: "Figtree_400Regular",
                marginTop: 4,
              }}
            >
              Registration: {profile?.vehicleRegistration ?? "Not set"}
            </Text>
          </View>

          {pendingVehicleChange ? (
            <View
              style={{
                borderRadius: 14,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#E5E7EB",
                padding: 14,
                marginBottom: 20,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: "#111827",
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  Vehicle Change Request
                </Text>
                <View
                  style={{
                    backgroundColor: buildVehicleRequestStatusUi(
                      pendingVehicleChange.status
                    ).bg,
                    borderColor: buildVehicleRequestStatusUi(
                      pendingVehicleChange.status
                    ).border,
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      color: buildVehicleRequestStatusUi(
                        pendingVehicleChange.status
                      ).text,
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 12,
                    }}
                  >
                    {buildVehicleRequestStatusUi(pendingVehicleChange.status).label}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontSize: 13,
                  color: "#4B5563",
                  fontFamily: "Figtree_500Medium",
                }}
              >
                Requested vehicle: {buildRequestedVehicleTypeLabel(profile)}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "#4B5563",
                  fontFamily: "Figtree_500Medium",
                  marginTop: 2,
                }}
              >
                {buildRequestedSubcategoryLabel(profile)}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: "#6B7280",
                  fontFamily: "Figtree_500Medium",
                  marginTop: 4,
                }}
              >
                Requested purpose:{" "}
                {formatPurposeLabel(
                  pendingVehicleChange.target.driverPurpose as VehiclePurpose | null
                )}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: "#6B7280",
                  fontFamily: "Figtree_500Medium",
                  marginTop: 2,
                }}
              >
                Requested registration:{" "}
                {pendingVehicleChange.target.vehicleRegistration ?? "Not provided"}
              </Text>
              {pendingVehicleChange.rejectionReason ? (
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "#B42318",
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  Rejection reason: {pendingVehicleChange.rejectionReason}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Text
            style={{
              fontSize: 15,
              color: "#111827",
              fontFamily: "Figtree_600SemiBold",
              marginBottom: 10,
            }}
          >
            Select service purpose
          </Text>
          <View style={{ flexDirection: "row", marginBottom: 18 }}>
            {(["passenger", "delivery", "both"] as VehiclePurpose[]).map(
              (purpose, index) => {
                const isSelected = selectedPurpose === purpose;
                const label =
                  purpose === "passenger"
                    ? "Passenger"
                    : purpose === "delivery"
                    ? "Delivery"
                    : "Both";
                return (
                  <TouchableOpacity
                    key={purpose}
                    activeOpacity={0.85}
                    onPress={() => setSelectedPurpose(purpose)}
                    style={{
                      borderWidth: 1.5,
                      borderColor: isSelected ? BRAND_PURPLE : "#E5E7EB",
                      backgroundColor: isSelected ? "#F4EEFF" : "#FFFFFF",
                      borderRadius: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginRight: index < 2 ? 8 : 0,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: "#111827",
                        fontFamily: "Figtree_600SemiBold",
                      }}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              }
            )}
          </View>

          <Text
            style={{
              fontSize: 15,
              color: "#111827",
              fontFamily: "Figtree_600SemiBold",
              marginBottom: 10,
            }}
          >
            Select new subcategory
          </Text>

          {visibleVehicleOptions.length === 0 ? (
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                padding: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: "#6B7280",
                  fontFamily: "Figtree_500Medium",
                }}
              >
                No compatible vehicle options found for the selected purpose.
              </Text>
            </View>
          ) : (
            <View style={{ marginBottom: 18 }}>
              {groupedVehicleOptions.map((group) => {
                const expanded = expandedCategories[group.categoryName] ?? false;

                return (
                  <View
                    key={group.categoryName}
                    style={{
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 12,
                      backgroundColor: "#FFFFFF",
                      marginBottom: 10,
                      overflow: "hidden",
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() =>
                        setExpandedCategories((prev) => ({
                          ...prev,
                          [group.categoryName]: !expanded,
                        }))
                      }
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: expanded ? "#F9FAFB" : "#FFFFFF",
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text
                          style={{
                            fontSize: 15,
                            color: "#111827",
                            fontFamily: "Figtree_700Bold",
                          }}
                        >
                          {group.categoryName}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#6B7280",
                            fontFamily: "Figtree_500Medium",
                            marginTop: 2,
                          }}
                        >
                          {group.options.length} subcategories
                        </Text>
                      </View>
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color="#6B7280"
                      />
                    </TouchableOpacity>

                    {expanded && (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingBottom: 10,
                          borderTopWidth: 1,
                          borderTopColor: "#F3F4F6",
                        }}
                      >
                        {group.options.map((option) => {
                          const isSelected = selectedSubcategoryId === option.id;
                          return (
                            <TouchableOpacity
                              key={option.id}
                              activeOpacity={0.85}
                              onPress={() => setSelectedSubcategoryId(option.id)}
                              style={{
                                borderWidth: 1.5,
                                borderColor: isSelected ? BRAND_PURPLE : "#E5E7EB",
                                backgroundColor: isSelected ? "#F4EEFF" : "#FFFFFF",
                                borderRadius: 10,
                                paddingVertical: 11,
                                paddingHorizontal: 10,
                                marginTop: 10,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 15,
                                  color: "#111827",
                                  fontFamily: "Figtree_600SemiBold",
                                }}
                              >
                                {option.subcategoryName}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: "#6B7280",
                                  fontFamily: "Figtree_500Medium",
                                  marginTop: 4,
                                }}
                              >
                                {option.categoryName} category
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {subcategoryChanged ? (
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                backgroundColor: "#FFFFFF",
                padding: 12,
                marginBottom: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: "#111827",
                  fontFamily: "Figtree_600SemiBold",
                  marginBottom: 6,
                }}
              >
                Re-submit vehicle documents (RC)
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: "#6B7280",
                  fontFamily: "Figtree_500Medium",
                  marginBottom: 8,
                }}
              >
                Vehicle type will update only after admin approves this RC front/back.
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "#111827",
                  fontFamily: "Figtree_600SemiBold",
                  marginBottom: 6,
                }}
              >
                New Vehicle Registration Number
              </Text>
              <TextInput
                value={requestedRegistration}
                onChangeText={(value) => setRequestedRegistration(value.toUpperCase())}
                placeholder="e.g. UK07AB1234"
                autoCapitalize="characters"
                editable={!saving}
                style={{
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  fontFamily: "Figtree_500Medium",
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 10,
                  backgroundColor: "#FFFFFF",
                }}
              />
              <ImagePickerComponent
                label="RC Front Image"
                value={rcImages.front}
                previewUri={rcPreviews.front}
                onChange={(value) => {
                  setRcImages((prev) => ({ ...prev, front: value }));
                  setRcPreviews((prev) => ({ ...prev, front: value }));
                }}
                documentType="rc"
                onUploadStart={() =>
                  setUploadingRc((prev) => ({ ...prev, front: true }))
                }
                onUploadComplete={() =>
                  setUploadingRc((prev) => ({ ...prev, front: false }))
                }
                onUploadError={() =>
                  setUploadingRc((prev) => ({ ...prev, front: false }))
                }
                uploadFunction={(file) => uploadDocumentImage(file, "rc")}
                disabled={saving}
              />
              <ImagePickerComponent
                label="RC Back Image"
                value={rcImages.back}
                previewUri={rcPreviews.back}
                onChange={(value) => {
                  setRcImages((prev) => ({ ...prev, back: value }));
                  setRcPreviews((prev) => ({ ...prev, back: value }));
                }}
                documentType="rc"
                onUploadStart={() =>
                  setUploadingRc((prev) => ({ ...prev, back: true }))
                }
                onUploadComplete={() =>
                  setUploadingRc((prev) => ({ ...prev, back: false }))
                }
                onUploadError={() =>
                  setUploadingRc((prev) => ({ ...prev, back: false }))
                }
                uploadFunction={(file) => uploadDocumentImage(file, "rc")}
                disabled={saving}
              />
            </View>
          ) : null}

          {selectedOption && selectedOption.id !== currentSubcategoryId && (
            <Text
              style={{
                fontSize: 13,
                color: "#4B5563",
                fontFamily: "Figtree_500Medium",
                marginBottom: 10,
              }}
            >
              Selected: {selectedOption.label}
            </Text>
          )}

          <TouchableOpacity
            onPress={handleUpdateVehicle}
            activeOpacity={0.85}
            disabled={!hasChanges || saving || isUploadingRc}
            style={{
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                !hasChanges || saving || isUploadingRc
                  ? "rgba(132,63,227,0.45)"
                  : BRAND_PURPLE,
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontFamily: "Figtree_700Bold",
                }}
              >
                {!hasChanges
                  ? "No Changes"
                  : subcategoryChanged
                  ? "Submit Vehicle Change Request"
                  : "Update Purpose"}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
