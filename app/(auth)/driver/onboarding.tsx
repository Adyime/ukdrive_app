/**
 * Driver Onboarding Screen
 * Multi-step form for driver registration.
 * Progress is persisted so user can resume after refresh.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Keyboard } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import { ImagePickerComponent } from "@/components/ui/image-picker";
import { useAlert } from "@/context/alert-context";
import { onboardDriver, type GenderOption } from "@/lib/api/auth";
import { uploadDocumentImage } from "@/lib/api/storage";
import { getVehicleOptions, type VehiclePurpose } from "@/lib/api/vehicle-options";
import { useAuth } from "@/context/auth-context";
import {
  getDriverOnboardingContext,
  getDriverOnboardingDraft,
  saveDriverOnboardingDraft,
  clearDriverOnboardingContext,
  type DriverOnboardingDraft,
} from "@/lib/storage";

const DRAFT_SAVE_DEBOUNCE_MS = 1500;
const GENDER_OPTIONS: GenderOption[] = ["Male", "Female", "Others"];

// Driver flow brand color (matches send-otp, verify-otp)
const BRAND_PURPLE = "#843FE3";

export default function DriverOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    phone?: string;
    onboardingToken?: string;
  }>();
  const { login } = useAuth();
  const { showAlert } = useAlert();
  // Use state so we can hydrate from storage when params missing (e.g. after refresh)
  const [phone, setPhone] = useState(params.phone ?? "");
  const [onboardingToken, setOnboardingToken] = useState(
    params.onboardingToken ?? ""
  );
  const [contextChecked, setContextChecked] = useState(false);
  const draftSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Personal details
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<GenderOption | "">("");
  const [email, setEmail] = useState("");

  // Vehicle data
  const [vehicleSubcategoryId, setVehicleSubcategoryId] = useState<
    string | null
  >(null);
  const [vehicleOptions, setVehicleOptions] = useState<
    {
      id: string;
      label: string;
      categoryName: string;
      subcategoryName: string;
      supportedPurposes: VehiclePurpose[];
    }[]
  >([]);
  const [vehicleOptionsLoading, setVehicleOptionsLoading] = useState(true);
  const [driverPurpose, setDriverPurpose] = useState<VehiclePurpose>("both");
  const [vehicleRegistration, setVehicleRegistration] = useState("");

  const groupedVehicleOptions = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string;
        label: string;
        categoryName: string;
        subcategoryName: string;
        supportedPurposes: VehiclePurpose[];
      }[]
    >();

    for (const option of vehicleOptions) {
      const key = option.categoryName.trim() || "Other";
      const current = groups.get(key) ?? [];
      current.push(option);
      groups.set(key, current);
    }

    return Array.from(groups.entries())
      .map(([categoryName, options]) => ({
        categoryName,
        options: [...options].sort((a, b) =>
          a.subcategoryName.localeCompare(b.subcategoryName)
        ),
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [vehicleOptions]);

  const selectedVehicleOption = useMemo(() => {
    return vehicleOptions.find((opt) => opt.id === vehicleSubcategoryId) ?? null;
  }, [vehicleOptions, vehicleSubcategoryId]);

  const selectedCategoryName = useMemo(() => {
    return (
      selectedVehicleOption?.categoryName ??
      groupedVehicleOptions[0]?.categoryName ??
      ""
    );
  }, [groupedVehicleOptions, selectedVehicleOption?.categoryName]);

  const selectedCategoryOptions = useMemo(() => {
    return (
      groupedVehicleOptions.find(
        (group) => group.categoryName === selectedCategoryName
      )?.options ?? []
    );
  }, [groupedVehicleOptions, selectedCategoryName]);

  // Auto-reset driverPurpose when subcategory changes and current purpose isn't supported
  useEffect(() => {
    const selectedOption = selectedVehicleOption;
    if (!selectedOption) return;
    const supported = selectedOption.supportedPurposes;
    // If current purpose is supported (or "both" is supported), do nothing
    if (supported.includes("both") || supported.includes(driverPurpose)) return;
    // Reset to the first supported purpose
    setDriverPurpose(supported[0] ?? "both");
  }, [driverPurpose, selectedVehicleOption]);
  const [rcNumber, setRcNumber] = useState("");
  const [vehicleOwnerName, setVehicleOwnerName] = useState("");

  // Documents
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseImageUrl, setLicenseImageUrl] = useState("");
  const [licenseBackImageUrl, setLicenseBackImageUrl] = useState("");
  const [aadhaarImageUrl, setAadhaarImageUrl] = useState("");
  const [aadhaarBackImageUrl, setAadhaarBackImageUrl] = useState("");
  const [rcImageUrl, setRcImageUrl] = useState("");
  const [rcBackImageUrl, setRcBackImageUrl] = useState("");

  // Upload states
  const [uploadingLicenseFront, setUploadingLicenseFront] = useState(false);
  const [uploadingLicenseBack, setUploadingLicenseBack] = useState(false);
  const [uploadingAadhaarFront, setUploadingAadhaarFront] = useState(false);
  const [uploadingAadhaarBack, setUploadingAadhaarBack] = useState(false);
  const [uploadingRcFront, setUploadingRcFront] = useState(false);
  const [uploadingRcBack, setUploadingRcBack] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Multi-step flow: 1 = info + vehicle type + service purpose, 2 = vehicle details + owner, 3 = documents
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Keyboard height so we can add bottom padding and keep the Next/Submit button visible
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const bottomFormPadding =
    Platform.OS === "android"
      ? Math.max(insets.bottom + 24, 72)
      : insets.bottom + 24;

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Persist form draft so user can resume; debounced
  useEffect(() => {
    if (!phone || !onboardingToken) return;
    if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
    draftSaveTimeout.current = setTimeout(() => {
      const draft: DriverOnboardingDraft = {
        fullName,
        gender,
        email,
        vehicleSubcategoryId,
        driverPurpose,
        vehicleRegistration,
        rcNumber,
        vehicleOwnerName,
        licenseNumber,
        licenseImageUrl,
        licenseBackImageUrl,
        aadhaarImageUrl,
        aadhaarBackImageUrl,
        rcImageUrl,
        rcBackImageUrl,
      };
      saveDriverOnboardingDraft(draft);
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
    };
  }, [
    phone,
    onboardingToken,
    fullName,
    gender,
    email,
    vehicleSubcategoryId,
    driverPurpose,
    vehicleRegistration,
    rcNumber,
    vehicleOwnerName,
    licenseNumber,
    licenseImageUrl,
    licenseBackImageUrl,
    aadhaarImageUrl,
    aadhaarBackImageUrl,
    rcImageUrl,
    rcBackImageUrl,
  ]);

  // Restore phone/token from params or from persisted onboarding context (resume after refresh)
  useEffect(() => {
    if (params.phone && params.onboardingToken) {
      setPhone(params.phone);
      setOnboardingToken(params.onboardingToken);
      setContextChecked(true);
      return;
    }
    getDriverOnboardingContext().then((ctx) => {
      setContextChecked(true);
      if (ctx?.phone && ctx?.onboardingToken) {
        setPhone(ctx.phone);
        setOnboardingToken(ctx.onboardingToken);
      } else if (!params.phone && !params.onboardingToken) {
        router.replace("/(auth)/driver/send-otp");
      }
    });
  }, [params.phone, params.onboardingToken, router]);

  // Load persisted draft once we have phone + token
  useEffect(() => {
    if (!phone || !onboardingToken) return;
    getDriverOnboardingDraft().then((draft) => {
      if (!draft) return;
      setFullName(draft.fullName ?? "");
      setGender((draft.gender as GenderOption) ?? "");
      setEmail(draft.email ?? "");
      setVehicleSubcategoryId(draft.vehicleSubcategoryId);
      setDriverPurpose((draft.driverPurpose as VehiclePurpose) ?? "both");
      setVehicleRegistration(draft.vehicleRegistration ?? "");
      setRcNumber(draft.rcNumber ?? "");
      setVehicleOwnerName(draft.vehicleOwnerName ?? "");
      setLicenseNumber(draft.licenseNumber ?? "");
      setLicenseImageUrl(draft.licenseImageUrl ?? "");
      setLicenseBackImageUrl(draft.licenseBackImageUrl ?? "");
      setAadhaarImageUrl(draft.aadhaarImageUrl ?? "");
      setAadhaarBackImageUrl(draft.aadhaarBackImageUrl ?? "");
      setRcImageUrl(draft.rcImageUrl ?? "");
      setRcBackImageUrl(draft.rcBackImageUrl ?? "");
    });
  }, [phone, onboardingToken]);

  useEffect(() => {
    getVehicleOptions("ride").then((res) => {
      setVehicleOptionsLoading(false);
      if (res.success && res.data?.categories) {
        const flat: {
          id: string;
          label: string;
          categoryName: string;
          subcategoryName: string;
          supportedPurposes: VehiclePurpose[];
        }[] = [];
        for (const cat of res.data.categories) {
          for (const sub of cat.subcategories) {
            flat.push({
              id: sub.id,
              label:
                cat.name + (sub.name !== "Standard" ? ` – ${sub.name}` : ""),
              categoryName: cat.name,
              subcategoryName: sub.name,
              supportedPurposes: sub.supportedPurposes ?? ["both"],
            });
          }
        }
        if (flat.length > 0) {
          setVehicleOptions(flat);
          setVehicleSubcategoryId(flat[0].id);
        }
      }
    });
  }, []);

  const validateStep1 = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = "Full name is required";
    if (!gender) newErrors.gender = "Gender is required";
    if (email?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email))
        newErrors.email = "Please enter a valid email address";
    }
    if (!vehicleSubcategoryId)
      newErrors.vehicleSubcategoryId = "Vehicle category and subcategory are required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!vehicleRegistration.trim()) {
      newErrors.vehicleRegistration = "Vehicle registration number is required";
    } else {
      const regRegex = /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/;
      if (!regRegex.test(vehicleRegistration.trim())) {
        newErrors.vehicleRegistration = "Invalid format (e.g., DL01AB1234)";
      }
    }
    if (!rcNumber.trim()) newErrors.rcNumber = "RC number is required";
    if (!vehicleOwnerName.trim())
      newErrors.vehicleOwnerName = "Vehicle owner name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = "Full name is required";
    if (!gender) newErrors.gender = "Gender is required";
    if (email?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email))
        newErrors.email = "Please enter a valid email address";
    }
    if (!vehicleSubcategoryId)
      newErrors.vehicleSubcategoryId = "Vehicle category and subcategory are required";
    if (!vehicleRegistration.trim()) {
      newErrors.vehicleRegistration = "Vehicle registration number is required";
    } else {
      const regRegex = /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/;
      if (!regRegex.test(vehicleRegistration.trim())) {
        newErrors.vehicleRegistration = "Invalid format (e.g., DL01AB1234)";
      }
    }
    if (!rcNumber.trim()) newErrors.rcNumber = "RC number is required";
    if (!vehicleOwnerName.trim())
      newErrors.vehicleOwnerName = "Vehicle owner name is required";
    if (!licenseNumber.trim())
      newErrors.licenseNumber = "License number is required";
    if (!licenseImageUrl.trim())
      newErrors.licenseImageUrl = "License image is required";
    if (!licenseBackImageUrl.trim())
      newErrors.licenseBackImageUrl = "License back image is required";
    if (!aadhaarImageUrl.trim())
      newErrors.aadhaarImageUrl = "Aadhaar image is required";
    if (!aadhaarBackImageUrl.trim())
      newErrors.aadhaarBackImageUrl = "Aadhaar back image is required";
    if (!rcImageUrl.trim()) newErrors.rcImageUrl = "RC image is required";
    if (!rcBackImageUrl.trim()) newErrors.rcBackImageUrl = "RC back image is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const handleBack = () => {
    setErrors({});
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleSubmit = async (options?: {
    forceLogin?: boolean;
    sessionTakeoverToken?: string;
  }) => {
    if (!phone || !onboardingToken) return;

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // Prepare data matching the schema exactly
      const personalDetails: {
        fullName: string;
        gender: GenderOption;
        email?: string;
      } = {
        fullName: fullName.trim(),
        gender: gender as GenderOption,
      };

      // Only include email if it's provided and not empty
      const trimmedEmail = email.trim();
      if (trimmedEmail) {
        personalDetails.email = trimmedEmail;
      }

      const vehicleSubcategoryIdToSend = vehicleSubcategoryId?.trim() || null;
      if (!vehicleSubcategoryIdToSend) {
        setErrors((prev) => ({
          ...prev,
          vehicleSubcategoryId: "Vehicle category and subcategory are required",
        }));
        setLoading(false);
        return;
      }

      const requestData = {
        personalDetails,
        vehicleData: {
          vehicleSubcategoryId: vehicleSubcategoryIdToSend,
          vehicleRegistration: vehicleRegistration.trim().toUpperCase(),
          rcNumber: rcNumber.trim(),
          vehicleOwnerName: vehicleOwnerName.trim(),
          driverPurpose,
        },
        documents: {
          licenseNumber: licenseNumber.trim(),
          licenseImageUrl: licenseImageUrl.trim(),
          licenseBackImageUrl: licenseBackImageUrl.trim(),
          aadhaarImageUrl: aadhaarImageUrl.trim(),
          aadhaarBackImageUrl: aadhaarBackImageUrl.trim(),
          rcImageUrl: rcImageUrl.trim(),
          rcBackImageUrl: rcBackImageUrl.trim(),
        },
      };

      // Log request in development
      if (__DEV__) {
        console.log("[Driver Onboarding] Sending request:", {
          ...requestData,
          documents: {
            ...requestData.documents,
            // Don't log full URLs/keys, just indicate presence
            licenseImageUrl: requestData.documents.licenseImageUrl ? "***" : "",
            licenseBackImageUrl: requestData.documents.licenseBackImageUrl
              ? "***"
              : "",
            aadhaarImageUrl: requestData.documents.aadhaarImageUrl ? "***" : "",
            aadhaarBackImageUrl: requestData.documents.aadhaarBackImageUrl
              ? "***"
              : "",
            rcImageUrl: requestData.documents.rcImageUrl ? "***" : "",
            rcBackImageUrl: requestData.documents.rcBackImageUrl ? "***" : "",
          },
        });
      }

      const response = await onboardDriver(requestData, onboardingToken, options);

      if (response.success && response.data) {
        const data = response.data as {
          tokens?: { accessToken: string; refreshToken: string };
          user?: any;
          requiresSessionTakeover?: boolean;
          sessionTakeoverToken?: string;
        };

        if (
          data.requiresSessionTakeover &&
          data.sessionTakeoverToken &&
          !options?.forceLogin
        ) {
          showAlert(
            "Continue Login?",
            "This number is already logged in on another device. Continue and logout old device?",
            [
              {
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Continue",
                onPress: () => {
                  void handleSubmit({
                    forceLogin: true,
                    sessionTakeoverToken: data.sessionTakeoverToken,
                  });
                },
              },
            ],
            { brandColorOverride: BRAND_PURPLE }
          );
          return;
        }

        if (data.tokens && data.user) {
          await clearDriverOnboardingContext();
          await login(data.tokens, data.user, "driver");
          router.replace("/(tabs)");
        }
      } else {
        const takeoverError =
          response.error &&
          typeof response.error === "object"
            ? (response.error as {
                code?: string;
                message?: string;
                requiresSessionTakeover?: boolean;
                sessionTakeoverToken?: string;
                details?: unknown;
              })
            : undefined;
        const takeoverDetails =
          takeoverError?.details && typeof takeoverError.details === "object"
            ? (takeoverError.details as {
                requiresSessionTakeover?: boolean;
                sessionTakeoverToken?: string;
              })
            : undefined;
        const sessionTakeoverToken =
          takeoverError?.sessionTakeoverToken ??
          takeoverDetails?.sessionTakeoverToken;
        const requiresSessionTakeover =
          (takeoverError?.requiresSessionTakeover === true ||
            takeoverDetails?.requiresSessionTakeover === true ||
            takeoverError?.code === "SESSION_TAKEOVER_REQUIRED") &&
          !!sessionTakeoverToken;

        if (requiresSessionTakeover && !options?.forceLogin) {
          showAlert(
            "Continue Login?",
            "This number is already logged in on another device. Continue and logout old device?",
            [
              {
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Continue",
                onPress: () => {
                  void handleSubmit({
                    forceLogin: true,
                    sessionTakeoverToken,
                  });
                },
              },
            ],
            { brandColorOverride: BRAND_PURPLE }
          );
          return;
        }

        // Session expired: redirect to login immediately so user can verify phone again
        const err = response.error as
          | { code?: string; message?: string }
          | undefined;
        const isSessionExpired =
          err?.code === "UNAUTHORIZED" ||
          (typeof err?.message === "string" &&
            /expired|verify your phone|invalid onboarding/i.test(err.message));
        if (isSessionExpired) {
          setLoading(false);
          await clearDriverOnboardingContext();
          router.replace("/(auth)/driver/send-otp");
          return;
        }

        // Extract validation errors from response
        const newErrors: Record<string, string> = {};
        let generalMessage = "Onboarding failed. Please try again.";

        if (response.error) {
          // Log full error in development
          if (__DEV__) {
            console.error("[Driver Onboarding] API Error:", response.error);
          }

          // Extract validation error details
          if (
            typeof response.error === "object" &&
            "details" in response.error &&
            Array.isArray(response.error.details)
          ) {
            // Map validation errors to form fields
            response.error.details.forEach((detail: any) => {
              if (detail.field && detail.message) {
                // Map nested field paths to form state keys
                const fieldPath = detail.field;

                // Handle nested paths like "personalDetails.fullName"
                if (fieldPath.startsWith("personalDetails.")) {
                  const field = fieldPath.replace("personalDetails.", "");
                  newErrors[field] = detail.message;
                } else if (fieldPath.startsWith("vehicleData.")) {
                  const field = fieldPath.replace("vehicleData.", "");
                  newErrors[field] = detail.message;
                } else if (fieldPath.startsWith("documents.")) {
                  const field = fieldPath.replace("documents.", "");
                  newErrors[field] = detail.message;
                } else {
                  // Direct field mapping
                  newErrors[fieldPath] = detail.message;
                }
              }
            });

            // Set general message if we have validation errors
            if (Object.keys(newErrors).length > 0) {
              generalMessage = "Please fix the errors below and try again.";
            }
          }

          // Set general error message if available
          if (
            typeof response.error === "object" &&
            "message" in response.error
          ) {
            generalMessage = String(response.error.message);
          }
        }

        setErrors({
          ...newErrors,
          general: generalMessage,
        });
      }
    } catch (err) {
      if (__DEV__) {
        console.error("[Driver Onboarding] Unexpected error:", err);
      }
      setErrors({
        general: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!contextChecked || !phone || !onboardingToken) {
    return null;
  }

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ backgroundColor: "#fff" }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow items-center px-6"
          contentContainerStyle={{
            paddingTop: 20,
            paddingBottom: bottomFormPadding + keyboardHeight,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step indicator — 3 dots, same color code as login */}
          <View className="flex-row items-center justify-center w-full mb-6 gap-2">
            {([1, 2, 3] as const).map((s) => (
              <View
                key={s}
                style={{
                  width: s === step ? 24 : 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: s <= step ? BRAND_PURPLE : "#E5E7EB",
                }}
              />
            ))}
          </View>

          {/* Header — step-specific title and subtitle */}
          <View className="w-full mb-3">
            <Text
              style={{ fontFamily: "Figtree_700Bold" }}
              className="mb-3 w-full text-2xl text-left text-black"
            >
              {step === 1 && "Your details & vehicle"}
              {step === 2 && "Vehicle details"}
              {step === 3 && "Documents"}
            </Text>
            <Text
              style={{ fontFamily: "Figtree_400Regular" }}
              className="mb-3 w-full text-base text-left text-gray-900"
            >
              {step === 1 &&
                "Enter your info and choose vehicle type and service."}
              {step === 2 && "Registration, RC number and owner name."}
              {step === 3 && "Upload documents required for verification."}
            </Text>
          </View>

          <View
            className="w-full bg-white pb-8"
            style={{ backgroundColor: "#fff" }}
          >
            {/* ——— Step 1: Personal + Vehicle Type + Service Purpose ——— */}
            {step === 1 && (
              <>
                <View className="mb-6">
                  <Input
                    label="Full Name"
                    placeholder="enter your full name"
                    value={fullName}
                    onChangeText={setFullName}
                    error={errors.fullName}
                    className="mb-4"
                    autoCapitalize="words"
                  />
                  <View className="mb-4">
                    <Text
                      style={{ fontFamily: "Figtree_500Medium" }}
                      className="text-sm text-gray-700 mb-2"
                    >
                      Gender
                    </Text>
                    <View className="flex-row flex-wrap">
                      {GENDER_OPTIONS.map((option, index) => {
                        const isSelected = gender === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            onPress={() => setGender(option)}
                            activeOpacity={0.8}
                            style={{
                              paddingVertical: 10,
                              paddingHorizontal: 16,
                              borderRadius: 8,
                              marginLeft: index > 0 ? 8 : 0,
                              marginBottom: 8,
                              backgroundColor: isSelected
                                ? BRAND_PURPLE
                                : "transparent",
                              borderWidth: 2,
                              borderColor: isSelected ? BRAND_PURPLE : "#D1D5DB",
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: "Figtree_600SemiBold",
                                fontSize: 14,
                                color: isSelected ? "#fff" : "#374151",
                              }}
                            >
                              {option}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {errors.gender && (
                      <Text
                        style={{ fontFamily: "Figtree_400Regular" }}
                        className="text-sm text-red-500 mt-1"
                      >
                        {errors.gender}
                      </Text>
                    )}
                  </View>
                  <Input
                    label="Email (Optional)"
                    placeholder="enter your email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    error={errors.email}
                  />
                </View>
                <View className="mb-6">
                  <Text
                    style={{ fontFamily: "Figtree_600SemiBold" }}
                    className="text-lg text-gray-900 dark:text-white mb-4"
                  >
                    Vehicle Information
                  </Text>
                  <View className="mb-4">
                    <Text
                      style={{ fontFamily: "Figtree_500Medium" }}
                      className="text-sm text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Vehicle Category
                    </Text>
                    {vehicleOptionsLoading ? (
                      <Text
                        style={{ fontFamily: "Figtree_400Regular" }}
                        className="text-gray-500 dark:text-gray-400 text-sm"
                      >
                        Loading options...
                      </Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="mb-2"
                      >
                        <View className="flex-row">
                          {groupedVehicleOptions.map((group, index) => {
                            const isSelected =
                              selectedCategoryName === group.categoryName;
                            return (
                              <TouchableOpacity
                                key={group.categoryName}
                                onPress={() => {
                                  const firstOption = group.options[0];
                                  if (!firstOption) return;
                                  setVehicleSubcategoryId(firstOption.id);
                                }}
                                activeOpacity={0.8}
                                style={{
                                  paddingVertical: 10,
                                  paddingHorizontal: 16,
                                  borderRadius: 8,
                                  marginLeft: index > 0 ? 8 : 0,
                                  backgroundColor: isSelected
                                    ? BRAND_PURPLE
                                    : "transparent",
                                  borderWidth: 2,
                                  borderColor: isSelected
                                    ? BRAND_PURPLE
                                    : "#D1D5DB",
                                }}
                              >
                                <Text
                                  style={{
                                    fontFamily: "Figtree_600SemiBold",
                                    fontSize: 14,
                                    color: isSelected ? "#fff" : "#374151",
                                  }}
                                >
                                  {group.categoryName}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    )}
                  </View>
                  <View className="mb-4">
                    <Text
                      style={{ fontFamily: "Figtree_500Medium" }}
                      className="text-sm text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Vehicle Subcategory
                    </Text>
                    {vehicleOptionsLoading ? (
                      <Text
                        style={{ fontFamily: "Figtree_400Regular" }}
                        className="text-gray-500 dark:text-gray-400 text-sm"
                      >
                        Loading options...
                      </Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="mb-2"
                      >
                        <View className="flex-row">
                          {selectedCategoryOptions.map((opt, index) => {
                            const isSelected = vehicleSubcategoryId === opt.id;
                            return (
                              <TouchableOpacity
                                key={opt.id}
                                onPress={() => {
                                  setVehicleSubcategoryId(opt.id);
                                }}
                                activeOpacity={0.8}
                                style={{
                                  paddingVertical: 10,
                                  paddingHorizontal: 16,
                                  borderRadius: 8,
                                  marginLeft: index > 0 ? 8 : 0,
                                  backgroundColor: isSelected
                                    ? BRAND_PURPLE
                                    : "transparent",
                                  borderWidth: 2,
                                  borderColor: isSelected
                                    ? BRAND_PURPLE
                                    : "#D1D5DB",
                                }}
                              >
                                <Text
                                  style={{
                                    fontFamily: "Figtree_600SemiBold",
                                    fontSize: 14,
                                    color: isSelected ? "#fff" : "#374151",
                                  }}
                                >
                                  {opt.subcategoryName}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    )}
                    {errors.vehicleSubcategoryId && (
                      <Text
                        style={{ fontFamily: "Figtree_400Regular" }}
                        className="text-sm text-red-500 mt-1"
                      >
                        {errors.vehicleSubcategoryId}
                      </Text>
                    )}
                  </View>
                  <View className="mb-4">
                    <Text
                      style={{ fontFamily: "Figtree_500Medium" }}
                      className="text-sm text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Service Purpose
                    </Text>
                    <Text
                      style={{ fontFamily: "Figtree_400Regular" }}
                      className="text-xs text-gray-500 dark:text-gray-400 mb-2"
                    >
                      What type of services will you provide with this subcategory?
                    </Text>
                    <View className="flex-row flex-wrap">
                      {(() => {
                        const selectedOption = selectedVehicleOption;
                        const supported = selectedOption?.supportedPurposes ?? [
                          "both",
                        ];
                        if (supported.includes("both"))
                          return [
                            "passenger",
                            "delivery",
                            "both",
                          ] as VehiclePurpose[];
                        return supported;
                      })().map((purpose, index) => {
                        const isSelected = driverPurpose === purpose;
                        const purposeLabels: Record<VehiclePurpose, string> = {
                          passenger: "Passenger Rides",
                          delivery: "Delivery / Parcel",
                          both: "Both",
                        };
                        return (
                          <TouchableOpacity
                            key={purpose}
                            onPress={() => setDriverPurpose(purpose)}
                            activeOpacity={0.8}
                            style={{
                              paddingVertical: 10,
                              paddingHorizontal: 16,
                              borderRadius: 8,
                              marginLeft: index > 0 ? 8 : 0,
                              marginBottom: 8,
                              backgroundColor: isSelected
                                ? BRAND_PURPLE
                                : "transparent",
                              borderWidth: 2,
                              borderColor: isSelected
                                ? BRAND_PURPLE
                                : "#D1D5DB",
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: "Figtree_600SemiBold",
                                fontSize: 14,
                                color: isSelected ? "#fff" : "#374151",
                              }}
                            >
                              {purposeLabels[purpose]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {errors.driverPurpose && (
                      <Text
                        style={{ fontFamily: "Figtree_400Regular" }}
                        className="text-sm text-red-500 mt-1"
                      >
                        {errors.driverPurpose}
                      </Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleNext}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: BRAND_PURPLE,
                    borderRadius: 8,
                    paddingVertical: 14,
                    paddingHorizontal: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                  }}
                >
                  <Text
                    style={{ fontFamily: "Figtree_600SemiBold" }}
                    className="text-base tracking-widest text-white"
                  >
                    Next
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* ——— Step 2: Vehicle Registration, RC, Owner Name ——— */}
            {step === 2 && (
              <>
                <View className="mb-6">
                  <Input
                    label="Vehicle Registration"
                    placeholder="DL01AB1234"
                    value={vehicleRegistration}
                    onChangeText={setVehicleRegistration}
                    error={errors.vehicleRegistration}
                    className="mb-4"
                    autoCapitalize="characters"
                  />
                  <Input
                    label="RC Number"
                    placeholder="RC number"
                    value={rcNumber}
                    onChangeText={setRcNumber}
                    error={errors.rcNumber}
                    className="mb-4"
                  />
                  <Input
                    label="Vehicle Owner Name"
                    placeholder="Owner name"
                    value={vehicleOwnerName}
                    onChangeText={setVehicleOwnerName}
                    error={errors.vehicleOwnerName}
                    autoCapitalize="words"
                  />
                </View>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleBack}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      borderRadius: 8,
                      paddingVertical: 14,
                      borderWidth: 2,
                      borderColor: BRAND_PURPLE,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        color: BRAND_PURPLE,
                        fontSize: 16,
                      }}
                    >
                      Back
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleNext}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      backgroundColor: BRAND_PURPLE,
                      borderRadius: 8,
                      paddingVertical: 14,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{ fontFamily: "Figtree_600SemiBold" }}
                      className="text-base tracking-widest text-white"
                    >
                      Next
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ——— Step 3: Documents ——— */}
            {step === 3 && (
              <>
                <View className="mb-6">
                  <Text
                    style={{ fontFamily: "Figtree_600SemiBold" }}
                    className="text-lg text-gray-900 dark:text-white mb-4"
                  >
                    Documents
                  </Text>
                  <Text
                    style={{ fontFamily: "Figtree_400Regular" }}
                    className="text-sm text-gray-600 dark:text-gray-400 mb-4"
                  >
                    Please upload clear photos of your documents. Front and back
                    images are required for verification.
                  </Text>
                  <Input
                    label="License Number"
                    placeholder="License number"
                    value={licenseNumber}
                    onChangeText={setLicenseNumber}
                    error={errors.licenseNumber}
                    className="mb-4"
                  />
                  <ImagePickerComponent
                    label="License Front Image"
                    value={licenseImageUrl}
                    onChange={setLicenseImageUrl}
                    error={errors.licenseImageUrl}
                    documentType="license"
                    onUploadStart={() => setUploadingLicenseFront(true)}
                    onUploadComplete={(objectKey) => {
                      setUploadingLicenseFront(false);
                      setLicenseImageUrl(objectKey);
                    }}
                    onUploadError={(error) => {
                      setUploadingLicenseFront(false);
                      setErrors((prev) => ({
                        ...prev,
                        licenseImageUrl: error,
                      }));
                    }}
                    onSessionExpired={async () => {
                      await clearDriverOnboardingContext();
                      router.replace("/(auth)/driver/send-otp");
                    }}
                    uploadFunction={(file) =>
                      uploadDocumentImage(file, "license", onboardingToken)
                    }
                    disabled={
                      loading ||
                      uploadingLicenseFront ||
                      uploadingLicenseBack ||
                      uploadingAadhaarFront ||
                      uploadingAadhaarBack ||
                      uploadingRcFront ||
                      uploadingRcBack
                    }
                  />
                  <ImagePickerComponent
                    label="License Back Image"
                    value={licenseBackImageUrl}
                    onChange={setLicenseBackImageUrl}
                    error={errors.licenseBackImageUrl}
                    documentType="license"
                    onUploadStart={() => setUploadingLicenseBack(true)}
                    onUploadComplete={(objectKey) => {
                      setUploadingLicenseBack(false);
                      setLicenseBackImageUrl(objectKey);
                    }}
                    onUploadError={(error) => {
                      setUploadingLicenseBack(false);
                      setErrors((prev) => ({
                        ...prev,
                        licenseBackImageUrl: error,
                      }));
                    }}
                    onSessionExpired={async () => {
                      await clearDriverOnboardingContext();
                      router.replace("/(auth)/driver/send-otp");
                    }}
                    uploadFunction={(file) =>
                      uploadDocumentImage(file, "license", onboardingToken)
                    }
                    disabled={
                      loading ||
                      uploadingLicenseFront ||
                      uploadingLicenseBack ||
                      uploadingAadhaarFront ||
                      uploadingAadhaarBack ||
                      uploadingRcFront ||
                      uploadingRcBack
                    }
                  />
                  <ImagePickerComponent
                    label="Aadhaar Front Image"
                    value={aadhaarImageUrl}
                    onChange={setAadhaarImageUrl}
                    error={errors.aadhaarImageUrl}
                    documentType="aadhaar"
                    onUploadStart={() => setUploadingAadhaarFront(true)}
                    onUploadComplete={(objectKey) => {
                      setUploadingAadhaarFront(false);
                      setAadhaarImageUrl(objectKey);
                    }}
                    onUploadError={(error) => {
                      setUploadingAadhaarFront(false);
                      setErrors((prev) => ({
                        ...prev,
                        aadhaarImageUrl: error,
                      }));
                    }}
                    onSessionExpired={async () => {
                      await clearDriverOnboardingContext();
                      router.replace("/(auth)/driver/send-otp");
                    }}
                    uploadFunction={(file) =>
                      uploadDocumentImage(file, "aadhaar", onboardingToken)
                    }
                    disabled={
                      loading ||
                      uploadingLicenseFront ||
                      uploadingLicenseBack ||
                      uploadingAadhaarFront ||
                      uploadingAadhaarBack ||
                      uploadingRcFront ||
                      uploadingRcBack
                    }
                  />
                  <ImagePickerComponent
                    label="Aadhaar Back Image"
                    value={aadhaarBackImageUrl}
                    onChange={setAadhaarBackImageUrl}
                    error={errors.aadhaarBackImageUrl}
                    documentType="aadhaar"
                    onUploadStart={() => setUploadingAadhaarBack(true)}
                    onUploadComplete={(objectKey) => {
                      setUploadingAadhaarBack(false);
                      setAadhaarBackImageUrl(objectKey);
                    }}
                    onUploadError={(error) => {
                      setUploadingAadhaarBack(false);
                      setErrors((prev) => ({
                        ...prev,
                        aadhaarBackImageUrl: error,
                      }));
                    }}
                    onSessionExpired={async () => {
                      await clearDriverOnboardingContext();
                      router.replace("/(auth)/driver/send-otp");
                    }}
                    uploadFunction={(file) =>
                      uploadDocumentImage(file, "aadhaar", onboardingToken)
                    }
                    disabled={
                      loading ||
                      uploadingLicenseFront ||
                      uploadingLicenseBack ||
                      uploadingAadhaarFront ||
                      uploadingAadhaarBack ||
                      uploadingRcFront ||
                      uploadingRcBack
                    }
                  />
                  <ImagePickerComponent
                    label="RC Front Image"
                    value={rcImageUrl}
                    onChange={setRcImageUrl}
                    error={errors.rcImageUrl}
                    documentType="rc"
                    onUploadStart={() => setUploadingRcFront(true)}
                    onUploadComplete={(objectKey) => {
                      setUploadingRcFront(false);
                      setRcImageUrl(objectKey);
                    }}
                    onUploadError={(error) => {
                      setUploadingRcFront(false);
                      setErrors((prev) => ({ ...prev, rcImageUrl: error }));
                    }}
                    onSessionExpired={async () => {
                      await clearDriverOnboardingContext();
                      router.replace("/(auth)/driver/send-otp");
                    }}
                    uploadFunction={(file) =>
                      uploadDocumentImage(file, "rc", onboardingToken)
                    }
                    disabled={
                      loading ||
                      uploadingLicenseFront ||
                      uploadingLicenseBack ||
                      uploadingAadhaarFront ||
                      uploadingAadhaarBack ||
                      uploadingRcFront ||
                      uploadingRcBack
                    }
                  />
                  <ImagePickerComponent
                    label="RC Back Image"
                    value={rcBackImageUrl}
                    onChange={setRcBackImageUrl}
                    error={errors.rcBackImageUrl}
                    documentType="rc"
                    onUploadStart={() => setUploadingRcBack(true)}
                    onUploadComplete={(objectKey) => {
                      setUploadingRcBack(false);
                      setRcBackImageUrl(objectKey);
                    }}
                    onUploadError={(error) => {
                      setUploadingRcBack(false);
                      setErrors((prev) => ({ ...prev, rcBackImageUrl: error }));
                    }}
                    onSessionExpired={async () => {
                      await clearDriverOnboardingContext();
                      router.replace("/(auth)/driver/send-otp");
                    }}
                    uploadFunction={(file) =>
                      uploadDocumentImage(file, "rc", onboardingToken)
                    }
                    disabled={
                      loading ||
                      uploadingLicenseFront ||
                      uploadingLicenseBack ||
                      uploadingAadhaarFront ||
                      uploadingAadhaarBack ||
                      uploadingRcFront ||
                      uploadingRcBack
                    }
                  />
                </View>

                {errors.general && (
                  <Text
                    style={{ fontFamily: "Figtree_400Regular" }}
                    className="text-sm text-red-500 mb-4"
                  >
                    {errors.general}
                  </Text>
                )}

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleBack}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      borderRadius: 8,
                      paddingVertical: 14,
                      borderWidth: 2,
                      borderColor: BRAND_PURPLE,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        color: BRAND_PURPLE,
                        fontSize: 16,
                      }}
                    >
                      Back
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      void handleSubmit();
                    }}
                    disabled={
                      loading ||
                      uploadingLicenseFront ||
                      uploadingLicenseBack ||
                      uploadingAadhaarFront ||
                      uploadingAadhaarBack ||
                      uploadingRcFront ||
                      uploadingRcBack
                    }
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      backgroundColor: BRAND_PURPLE,
                      borderRadius: 8,
                      paddingVertical: 14,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {loading ? (
                      <View className="flex-row items-center">
                        <ActivityIndicator
                          size="small"
                          color="#ffffff"
                          style={{ marginRight: 8 }}
                        />
                        <Text
                          style={{ fontFamily: "Figtree_600SemiBold" }}
                          className="text-base tracking-widest text-white"
                        >
                          Submitting...
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={{ fontFamily: "Figtree_600SemiBold" }}
                        className="text-base tracking-widest text-white"
                      >
                        Complete
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                {loading && <Loading message="Submitting..." />}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
