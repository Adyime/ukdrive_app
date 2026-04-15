import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  CalendarDays,
  Car,
  Clock3,
  Download,
  Flag,
  MapPin,
  Package,
  RefreshCcw,
  Share2,
  User,
  Wallet,
} from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import RNBlobUtil from "react-native-blob-util";

import { useToast } from "@/components/ui/toast";
import { getAccessToken } from "@/lib/storage";
import {
  formatDistance,
  formatVehicleType,
  getRideById,
  type RideResponse,
} from "@/lib/api/ride";
import {
  formatWeight,
  getPorterPayment,
  getPorterServiceById,
  type PorterPayment,
  type PorterServiceResponse,
} from "@/lib/api/porter";
import {
  getCarPoolById,
  getCarPoolMemberPayment,
  type CarPoolMemberPayment,
  type CarPoolMemberResponse,
  type CarPoolResponse,
} from "@/lib/api/carPool";
import {
  getPaymentStatusLabel,
  getRidePayment,
  type RidePayment,
} from "@/lib/api/payment";
import { useAuth } from "@/context/auth-context";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";
const RUPEE = "\u20B9";

const WebViewModule = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-webview");
  } catch {
    return null;
  }
})();
const WebView = WebViewModule?.WebView ?? null;

type ViewerParams = {
  endpoint?: string | string[];
  title?: string | string[];
  fileName?: string | string[];
  templateType?: string | string[];
  rideId?: string | string[];
  porterId?: string | string[];
  carPoolId?: string | string[];
  memberId?: string | string[];
  docType?: string | string[];
};

type ResolveDocumentResult = {
  localUri: string | null;
  remoteUrl: string | null;
};

const getParamValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const sanitizeFileName = (name: string) =>
  name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

const ensurePdfFileName = (name: string) =>
  name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;

const getNameWithoutExtension = (name: string) =>
  name.replace(/\.[^/.]+$/, "");

const formatAmount = (value: number | null | undefined) =>
  `${RUPEE}${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return `${parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}, ${parsed.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })}`;
};

const buildAndroidPdfViewerUrl = (url: string) =>
  `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;

const buildPdfHtml = (base64: string) => `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #f3f4f6; }
      embed { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <embed src="data:application/pdf;base64,${base64}" type="application/pdf" />
  </body>
</html>
`;

const toBase64FromArrayBuffer = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    output +=
      chars[(n >> 18) & 63] +
      chars[(n >> 12) & 63] +
      chars[(n >> 6) & 63] +
      chars[n & 63];
  }

  if (i < bytes.length) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const n = (b0 << 16) | (b1 << 8);
    output += chars[(n >> 18) & 63];
    output += chars[(n >> 12) & 63];
    output += i + 1 < bytes.length ? chars[(n >> 6) & 63] : "=";
    output += "=";
  }

  return output;
};

async function ensureDownloadsDir(): Promise<string> {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) throw new Error("Storage directory unavailable");
  const downloadsDir = `${baseDir}downloads/`;
  await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true });
  return downloadsDir;
}

async function savePdfFromUrl(url: string, fileName: string): Promise<string> {
  const downloadsDir = await ensureDownloadsDir();
  const uri = `${downloadsDir}${sanitizeFileName(fileName)}`;
  await FileSystem.downloadAsync(url, uri);
  return uri;
}

async function savePdfBase64(base64: string, fileName: string): Promise<string> {
  const downloadsDir = await ensureDownloadsDir();
  const uri = `${downloadsDir}${sanitizeFileName(fileName)}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

function getDurationLabel(ride: RideResponse): string {
  if (ride.startedAt && ride.completedAt) {
    const start = new Date(ride.startedAt).getTime();
    const end = new Date(ride.completedAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      const minutes = Math.max(1, Math.round((end - start) / 60000));
      return `${minutes} min`;
    }
  }
  return "N/A";
}

function getDurationFromTimes(
  start?: string | Date | null,
  end?: string | Date | null
): string {
  if (!start || !end) return "N/A";
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return "N/A";
  }
  return `${Math.max(1, Math.round((endTime - startTime) / 60000))} min`;
}

function normalizeVehicleLabel(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "any") return null;
  return trimmed;
}

function formatVehicleDisplayLabel(value?: string | null): string | null {
  const normalized = normalizeVehicleLabel(value);
  if (!normalized) return null;
  const key = normalized.toLowerCase();
  const knownVehicleTypes = new Set([
    "bike",
    "scooter",
    "erickshaw",
    "miniauto",
    "auto",
    "car",
    "cab",
    "motorcycle",
  ]);
  return knownVehicleTypes.has(key) ? formatVehicleType(key) : normalized;
}

function pickVehicleLabel(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    const label = formatVehicleDisplayLabel(value);
    if (label) return label;
  }
  return "N/A";
}

function getRideVehicleLabel(ride: RideResponse): string {
  return pickVehicleLabel(
    ride.driver?.vehicleSubcategoryName,
    ride.driver?.vehicleType,
    ride.vehicleSubcategoryName,
    ride.vehicleType
  );
}

export default function DocumentViewerScreen() {
  const { userType } = useAuth();
  const {
    endpoint,
    title,
    fileName,
    templateType,
    rideId,
    porterId,
    carPoolId,
    memberId,
    docType,
  } = useLocalSearchParams<ViewerParams>();
  const toast = useToast();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  const endpointValue = getParamValue(endpoint);
  const titleValue = getParamValue(title) || "Document";
  const fileNameValue = getParamValue(fileName) || "document.pdf";
  const templateTypeValue = getParamValue(templateType);
  const rideIdValue = getParamValue(rideId);
  const porterIdValue = getParamValue(porterId);
  const carPoolIdValue = getParamValue(carPoolId);
  const memberIdValue = getParamValue(memberId);
  const docTypeValue = getParamValue(docType);
  const isReceiptOrInvoice =
    docTypeValue === "receipt" || docTypeValue === "invoice";
  const isRideTemplateMode =
    templateTypeValue === "ride" &&
    Boolean(rideIdValue) &&
    isReceiptOrInvoice;
  const isPorterTemplateMode =
    templateTypeValue === "porter" &&
    Boolean(porterIdValue) &&
    isReceiptOrInvoice;
  const isCarPoolTemplateMode =
    templateTypeValue === "carpool" &&
    Boolean(carPoolIdValue) &&
    Boolean(memberIdValue) &&
    isReceiptOrInvoice;
  const isTemplateMode =
    isRideTemplateMode || isPorterTemplateMode || isCarPoolTemplateMode;

  const [docLoading, setDocLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerHtml, setViewerHtml] = useState<string | null>(null);
  const [localFileUri, setLocalFileUri] = useState<string | null>(null);
  const [remotePdfUrl, setRemotePdfUrl] = useState<string | null>(null);
  const [openingFallbackPreview, setOpeningFallbackPreview] = useState(false);
  const [hasTriedFallbackPreview, setHasTriedFallbackPreview] = useState(false);

  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [rideData, setRideData] = useState<RideResponse | null>(null);
  const [paymentData, setPaymentData] = useState<RidePayment | null>(null);
  const [porterData, setPorterData] = useState<PorterServiceResponse | null>(null);
  const [porterPaymentData, setPorterPaymentData] = useState<PorterPayment | null>(null);
  const [carPoolData, setCarPoolData] = useState<CarPoolResponse | null>(null);
  const [carPoolMemberData, setCarPoolMemberData] =
    useState<CarPoolMemberResponse | null>(null);
  const [carPoolPaymentData, setCarPoolPaymentData] =
    useState<CarPoolMemberPayment | null>(null);

  const canPreviewInApp = useMemo(
    () => Boolean(WebView) && (Boolean(viewerUrl) || Boolean(viewerHtml)),
    [viewerUrl, viewerHtml]
  );

  const resolveDocument = useCallback(
    async (silent = false): Promise<ResolveDocumentResult | null> => {
      if (!endpointValue) {
        if (!silent) setError("Document endpoint is missing.");
        return null;
      }

      try {
        if (!silent) {
          setDocLoading(true);
          setError(null);
          setViewerHtml(null);
          setViewerUrl(null);
          setLocalFileUri(null);
          setRemotePdfUrl(null);
          setHasTriedFallbackPreview(false);
        }

        const token = await getAccessToken();
        if (!token) throw new Error("Authentication required.");

        const endpointUrl = endpointValue.startsWith("http")
          ? endpointValue
          : `${API_BASE_URL}${endpointValue}`;

        const response = await fetch(endpointUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          let serverMessage: string | undefined;
          try {
            const result = await response.json();
            serverMessage = result?.error?.message || result?.message;
          } catch {
            serverMessage = undefined;
          }
          throw new Error(serverMessage || `Failed to load document (${response.status})`);
        }

        const contentType = (response.headers.get("content-type") || "").toLowerCase();

        if (contentType.includes("application/json")) {
          const result = await response.json();
          const rawUrl = result?.data?.url || result?.url;
          if (!rawUrl || typeof rawUrl !== "string") {
            throw new Error("Invalid document response.");
          }
          const url = rawUrl.startsWith("http") ? rawUrl : `${API_BASE_URL}${rawUrl}`;
          setRemotePdfUrl(url);
          setViewerUrl(Platform.OS === "android" ? buildAndroidPdfViewerUrl(url) : url);
          return { localUri: null, remoteUrl: url };
        }

        if (
          contentType.includes("application/pdf") ||
          contentType.includes("application/octet-stream")
        ) {
          const arrayBuffer = await response.arrayBuffer();
          const base64 = toBase64FromArrayBuffer(arrayBuffer);
          const uri = await savePdfBase64(base64, fileNameValue);
          setLocalFileUri(uri);
          if (WebView) {
            setViewerHtml(buildPdfHtml(base64));
          }
          return { localUri: uri, remoteUrl: null };
        }

        throw new Error("Unsupported document format.");
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "Unable to load document.");
        }
        return null;
      } finally {
        if (!silent) setDocLoading(false);
      }
    },
    [endpointValue, fileNameValue]
  );

  const loadRideTemplate = useCallback(async () => {
    if (!rideIdValue) return;
    try {
      setTemplateLoading(true);
      setTemplateError(null);
      const rideResponse = await getRideById(rideIdValue);
      if (!rideResponse.success || !rideResponse.data?.ride) {
        throw new Error("Unable to load ride details.");
      }
      const fetchedRide = rideResponse.data.ride;
      setRideData(fetchedRide);

      let fetchedPayment: RidePayment | null = null;
      try {
        const paymentResponse = await getRidePayment(rideIdValue);
        if (paymentResponse.success && paymentResponse.data?.payment) {
          fetchedPayment = paymentResponse.data.payment;
        }
      } catch {
        fetchedPayment = null;
      }
      setPaymentData(fetchedPayment);
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : "Unable to load document details."
      );
    } finally {
      setTemplateLoading(false);
    }
  }, [rideIdValue]);

  const loadPorterTemplate = useCallback(async () => {
    if (!porterIdValue) return;
    try {
      setTemplateLoading(true);
      setTemplateError(null);
      const serviceResponse = await getPorterServiceById(porterIdValue);
      if (!serviceResponse.success || !serviceResponse.data?.porterService) {
        throw new Error("Unable to load parcel details.");
      }
      setPorterData(serviceResponse.data.porterService);

      let fetchedPayment: PorterPayment | null = null;
      try {
        const paymentResponse = await getPorterPayment(porterIdValue);
        if (paymentResponse.success && paymentResponse.data?.payment) {
          fetchedPayment = paymentResponse.data.payment;
        }
      } catch {
        fetchedPayment = null;
      }
      setPorterPaymentData(fetchedPayment);
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : "Unable to load document details."
      );
    } finally {
      setTemplateLoading(false);
    }
  }, [porterIdValue]);

  const loadCarPoolTemplate = useCallback(async () => {
    if (!carPoolIdValue || !memberIdValue) return;
    try {
      setTemplateLoading(true);
      setTemplateError(null);
      const poolResponse = await getCarPoolById(carPoolIdValue);
      if (!poolResponse.success || !poolResponse.data) {
        throw new Error("Unable to load ride share details.");
      }
      const pool = poolResponse.data;
      const member = pool.members?.find((item) => item.id === memberIdValue) ?? null;
      if (!member) {
        throw new Error("Unable to load member details.");
      }
      setCarPoolData(pool);
      setCarPoolMemberData(member);

      let fetchedPayment: CarPoolMemberPayment | null = null;
      try {
        const paymentResponse = await getCarPoolMemberPayment(
          carPoolIdValue,
          memberIdValue
        );
        if (paymentResponse.success && paymentResponse.data?.payment) {
          fetchedPayment = paymentResponse.data.payment;
        }
      } catch {
        fetchedPayment = null;
      }
      setCarPoolPaymentData(fetchedPayment);
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : "Unable to load document details."
      );
    } finally {
      setTemplateLoading(false);
    }
  }, [carPoolIdValue, memberIdValue]);

  useEffect(() => {
    if (endpointValue) {
      void resolveDocument();
    }
  }, [endpointValue, resolveDocument]);

  useEffect(() => {
    if (isRideTemplateMode) {
      void loadRideTemplate();
      return;
    }
    if (isPorterTemplateMode) {
      void loadPorterTemplate();
      return;
    }
    if (isCarPoolTemplateMode) {
      void loadCarPoolTemplate();
    }
  }, [
    isRideTemplateMode,
    isPorterTemplateMode,
    isCarPoolTemplateMode,
    loadRideTemplate,
    loadPorterTemplate,
    loadCarPoolTemplate,
  ]);

  const openFallbackPreview = useCallback(async () => {
    try {
      setOpeningFallbackPreview(true);

      if (viewerUrl) {
        await WebBrowser.openBrowserAsync(viewerUrl);
        return;
      }

      if (remotePdfUrl) {
        const urlForFallback =
          Platform.OS === "android"
            ? buildAndroidPdfViewerUrl(remotePdfUrl)
            : remotePdfUrl;
        await WebBrowser.openBrowserAsync(urlForFallback);
        return;
      }

      if (localFileUri) {
        if (Platform.OS === "android") {
          const contentUri = await FileSystem.getContentUriAsync(localFileUri);
          await Linking.openURL(contentUri);
          return;
        }
        await Linking.openURL(localFileUri);
        return;
      }

      throw new Error("Document is not ready for preview.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open preview.");
    } finally {
      setOpeningFallbackPreview(false);
    }
  }, [localFileUri, remotePdfUrl, toast, viewerUrl]);

  useEffect(() => {
    if (isTemplateMode) return;
    if (docLoading || error || canPreviewInApp) return;
    if (hasTriedFallbackPreview) return;
    if (!viewerUrl && !remotePdfUrl && !localFileUri) return;
    setHasTriedFallbackPreview(true);
    void openFallbackPreview();
  }, [
    canPreviewInApp,
    docLoading,
    error,
    hasTriedFallbackPreview,
    isTemplateMode,
    localFileUri,
    openFallbackPreview,
    remotePdfUrl,
    viewerUrl,
  ]);

  const handleShare = useCallback(async () => {
    try {
      setSharing(true);

      let shareUri = localFileUri;
      let remoteUrl = remotePdfUrl;

      if (!shareUri && !remoteUrl && endpointValue) {
        const resolved = await resolveDocument(true);
        shareUri = resolved?.localUri ?? null;
        remoteUrl = resolved?.remoteUrl ?? null;
      }

      if (!shareUri && remoteUrl) {
        shareUri = await savePdfFromUrl(remoteUrl, fileNameValue);
        setLocalFileUri(shareUri);
      }

      if (shareUri) {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          throw new Error("Share is not available on this device.");
        }
        await Sharing.shareAsync(shareUri, {
          mimeType: "application/pdf",
          dialogTitle: `Share ${titleValue}`,
          UTI: "com.adobe.pdf",
        });
        return;
      }

      throw new Error("Document is not ready to share.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to share document.");
    } finally {
      setSharing(false);
    }
  }, [
    endpointValue,
    fileNameValue,
    localFileUri,
    remotePdfUrl,
    resolveDocument,
    titleValue,
    toast,
  ]);

  const handleDownload = useCallback(async () => {
    try {
      setDownloading(true);

      let resolvedLocalUri = localFileUri;
      let resolvedRemoteUrl = remotePdfUrl;

      if (!resolvedLocalUri && !resolvedRemoteUrl && endpointValue) {
        const resolved = await resolveDocument(true);
        resolvedLocalUri = resolved?.localUri ?? null;
        resolvedRemoteUrl = resolved?.remoteUrl ?? null;
      }

      const safeFileName = ensurePdfFileName(fileNameValue);

      if (Platform.OS === "android") {
        if (!endpointValue && !resolvedRemoteUrl) {
          throw new Error("Document is not ready to download.");
        }

        const endpointUrl = endpointValue
          ? endpointValue.startsWith("http")
            ? endpointValue
            : `${API_BASE_URL}${endpointValue}`
          : null;

        const downloadUrl = resolvedRemoteUrl || endpointUrl;
        if (!downloadUrl) {
          throw new Error("Document is not ready to download.");
        }

        // If we're downloading from protected API endpoint, pass bearer token.
        const authHeaders: Record<string, string> = {};
        if (!resolvedRemoteUrl) {
          const token = await getAccessToken();
          if (!token) {
            throw new Error("Authentication required.");
          }
          authHeaders.Authorization = `Bearer ${token}`;
        }

        const safeName = sanitizeFileName(safeFileName);
        const baseName = getNameWithoutExtension(safeName);

        const runDownload = async (targetName: string) => {
          const targetPath = `${RNBlobUtil.fs.dirs.DownloadDir}/${targetName}`;
          return RNBlobUtil.config({
            fileCache: false,
            addAndroidDownloads: {
              useDownloadManager: true,
              notification: true,
              mediaScannable: true,
              mime: "application/pdf",
              title: targetName,
              description: `${titleValue} downloaded`,
              path: targetPath,
            },
          }).fetch("GET", downloadUrl, authHeaders);
        };

        try {
          await runDownload(safeName);
        } catch {
          await runDownload(`${baseName}-${Date.now()}.pdf`);
        }

        toast.success(`${titleValue} downloaded to Downloads folder.`);
        return;
      }

      // iOS fallback: keep a local downloadable copy in app storage.
      if (!resolvedLocalUri && resolvedRemoteUrl) {
        resolvedLocalUri = await savePdfFromUrl(resolvedRemoteUrl, safeFileName);
        setLocalFileUri(resolvedLocalUri);
      }

      if (!resolvedLocalUri) {
        throw new Error("Document is not ready to download.");
      }

      toast.success(`${titleValue} downloaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download document.");
    } finally {
      setDownloading(false);
    }
  }, [
    endpointValue,
    fileNameValue,
    localFileUri,
    remotePdfUrl,
    resolveDocument,
    titleValue,
    toast,
  ]);

  const renderRideTemplate = () => {
    if (templateLoading) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={brandColor} />
          <Text
            style={{
              marginTop: 10,
              color: "#6B7280",
              fontSize: 14,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Loading {titleValue.toLowerCase()}...
          </Text>
        </View>
      );
    }

    if (templateError || !rideData) {
      return (
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
              color: "#DC2626",
              textAlign: "center",
              fontSize: 14,
              fontFamily: "Figtree_500Medium",
            }}
          >
            {templateError || "Unable to render document preview."}
          </Text>
          <TouchableOpacity
            onPress={() => void loadRideTemplate()}
            style={{
              marginTop: 14,
              backgroundColor: "#FFF7F2",
              borderWidth: 1,
              borderColor: "#FDE8D8",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                color: brandColor,
                fontSize: 14,
                fontFamily: "Figtree_600SemiBold",
              }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    const isInvoice = docTypeValue === "invoice";
    const totalFare = Number(rideData.fare || paymentData?.fareAmount || 0);
    const baseFare = Number(rideData.baseFare || 0);
    const taxesAndService = Math.max(0, totalFare - baseFare);
    const platformFee = Number(paymentData?.platformFeeAmount || 0);
    const platformFeePercent = Number(paymentData?.platformFeePercent || 0);
    const driverEarning = Number(
      paymentData?.driverEarningAmount || Math.max(0, totalFare - platformFee)
    );

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F9FAFB" }}
        contentContainerStyle={{ padding: 16, paddingBottom: 26 }}
      >
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
          }}
        >
          <Text
            style={{
              color: brandColor,
              fontSize: 13,
              fontFamily: "Figtree_700Bold",
              letterSpacing: 0.7,
            }}
          >
            {isInvoice ? "INVOICE" : "RECEIPT"}
          </Text>
          <Text
            style={{
              color: "#111827",
              fontSize: 20,
              fontFamily: "Figtree_700Bold",
              marginTop: 4,
            }}
          >
            {isInvoice ? "Trip Invoice" : "Trip Receipt"}
          </Text>
          <Text
            style={{
              color: "#6B7280",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
              marginTop: 6,
            }}
          >
            {formatDateTime(rideData.completedAt || rideData.requestedAt)}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 16, fontFamily: "Figtree_700Bold" }}
          >
            Trip Details
          </Text>

          <View style={{ flexDirection: "row", marginTop: 14 }}>
            <MapPin size={16} color="#16A34A" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 12,
                  fontFamily: "Figtree_500Medium",
                }}
              >
                Pickup
              </Text>
              <Text
                style={{
                  color: "#111827",
                  fontSize: 14,
                  fontFamily: "Figtree_600SemiBold",
                  marginTop: 2,
                }}
              >
                {rideData.pickupLocation}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", marginTop: 14 }}>
            <Flag size={16} color={brandColor} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 12,
                  fontFamily: "Figtree_500Medium",
                }}
              >
                Drop-off
              </Text>
              <Text
                style={{
                  color: "#111827",
                  fontSize: 14,
                  fontFamily: "Figtree_600SemiBold",
                  marginTop: 2,
                }}
              >
                {rideData.destination}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 16, fontFamily: "Figtree_700Bold" }}
          >
            Ride Information
          </Text>

          <View style={{ flexDirection: "row", marginTop: 12 }}>
            <Car size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Vehicle: {getRideVehicleLabel(rideData)}
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <User size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Driver: {rideData.driver?.fullName || "N/A"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <CalendarDays size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Date: {formatDateTime(rideData.completedAt || rideData.requestedAt)}
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <Clock3 size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Distance:{" "}
              {rideData.distance != null ? formatDistance(rideData.distance) : "N/A"} | Duration:{" "}
              {getDurationLabel(rideData)}
            </Text>
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 16, fontFamily: "Figtree_700Bold" }}
          >
            Fare Breakdown
          </Text>

          {isInvoice ? (
            <>
              <Row label="Base Fare" value={formatAmount(totalFare)} />
              <Row
                label={`Platform Fee (${platformFeePercent.toFixed(0)}%)`}
                value={formatAmount(platformFee)}
              />
              <Row label="Driver Earning" value={formatAmount(driverEarning)} />
              <Row
                label="Total Amount"
                value={formatAmount(totalFare)}
                bold
                topBorder
              />
            </>
          ) : (
            <>
              <Row label="Base Fare" value={formatAmount(baseFare)} />
              <Row label="Taxes and Service Charge" value={formatAmount(taxesAndService)} />
              <Row
                label="Total Fare"
                value={formatAmount(totalFare)}
                bold
                topBorder
              />
            </>
          )}
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Wallet size={16} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#111827",
                fontSize: 14,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Payment
            </Text>
          </View>
          <Text
            style={{
              marginTop: 8,
              color: "#374151",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Method: {paymentData?.paymentMethod || "N/A"}
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: "#374151",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Status: {paymentData ? getPaymentStatusLabel(paymentData.status) : "N/A"}
          </Text>
        </View>

        <Text
          style={{
            marginTop: 16,
            textAlign: "center",
            color: "#9CA3AF",
            fontSize: 12,
            fontFamily: "Figtree_500Medium",
          }}
        >
          This is a computer-generated {isInvoice ? "invoice" : "receipt"}.
        </Text>
      </ScrollView>
    );
  };

  const renderPorterTemplate = () => {
    if (templateLoading) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={brandColor} />
          <Text
            style={{
              marginTop: 10,
              color: "#6B7280",
              fontSize: 14,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Loading {titleValue.toLowerCase()}...
          </Text>
        </View>
      );
    }

    if (templateError || !porterData) {
      return (
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
              color: "#DC2626",
              textAlign: "center",
              fontSize: 14,
              fontFamily: "Figtree_500Medium",
            }}
          >
            {templateError || "Unable to render document preview."}
          </Text>
          <TouchableOpacity
            onPress={() => void loadPorterTemplate()}
            style={{
              marginTop: 14,
              backgroundColor: "#FFF7F2",
              borderWidth: 1,
              borderColor: "#FDE8D8",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                color: brandColor,
                fontSize: 14,
                fontFamily: "Figtree_600SemiBold",
              }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    const isInvoice = docTypeValue === "invoice";
    const totalFare = Number(porterData.fare || porterPaymentData?.fareAmount || 0);
    const baseFare = Number(porterData.baseFare || 0);
    const extraCharge = Math.max(0, totalFare - baseFare);
    const platformFee = Number(porterPaymentData?.platformFeeAmount || 0);
    const platformFeePercent = Number(porterPaymentData?.platformFeePercent || 0);
    const driverEarning = Number(
      porterPaymentData?.driverEarningAmount || Math.max(0, totalFare - platformFee)
    );
    const porterVehicle = pickVehicleLabel(
      porterData.driver?.vehicleSubcategoryName,
      porterData.driver?.vehicleType,
      porterData.vehicleSubcategoryName,
      porterData.vehicleType
    );

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F9FAFB" }}
        contentContainerStyle={{ padding: 16, paddingBottom: 26 }}
      >
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
          }}
        >
          <Text
            style={{
              color: brandColor,
              fontSize: 13,
              fontFamily: "Figtree_700Bold",
              letterSpacing: 0.7,
            }}
          >
            {isInvoice ? "INVOICE" : "RECEIPT"}
          </Text>
          <Text
            style={{
              color: "#111827",
              fontSize: 20,
              fontFamily: "Figtree_700Bold",
              marginTop: 4,
            }}
          >
            {isInvoice ? "Parcel Invoice" : "Parcel Receipt"}
          </Text>
          <Text
            style={{
              color: "#6B7280",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
              marginTop: 6,
            }}
          >
            {formatDateTime(porterData.deliveredAt || porterData.requestedAt)}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 16, fontFamily: "Figtree_700Bold" }}
          >
            Delivery Details
          </Text>

          <View style={{ flexDirection: "row", marginTop: 14 }}>
            <MapPin size={16} color="#16A34A" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 12,
                  fontFamily: "Figtree_500Medium",
                }}
              >
                Pickup
              </Text>
              <Text
                style={{
                  color: "#111827",
                  fontSize: 14,
                  fontFamily: "Figtree_600SemiBold",
                  marginTop: 2,
                }}
              >
                {porterData.pickupLocation}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", marginTop: 14 }}>
            <Flag size={16} color={brandColor} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 12,
                  fontFamily: "Figtree_500Medium",
                }}
              >
                Destination
              </Text>
              <Text
                style={{
                  color: "#111827",
                  fontSize: 14,
                  fontFamily: "Figtree_600SemiBold",
                  marginTop: 2,
                }}
              >
                {porterData.deliveryLocation}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 16, fontFamily: "Figtree_700Bold" }}
          >
            Service Information
          </Text>

          <View style={{ flexDirection: "row", marginTop: 12 }}>
            <Car size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Vehicle: {porterVehicle}
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <User size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Driver: {porterData.driver?.fullName || "N/A"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <Clock3 size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Distance:{" "}
              {porterData.distance != null ? formatDistance(porterData.distance) : "N/A"} | Duration:{" "}
              {getDurationFromTimes(
                porterData.pickedUpAt || porterData.acceptedAt || porterData.requestedAt,
                porterData.deliveredAt || porterPaymentData?.processedAt
              )}
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <Package size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Package: {porterData.packageType} | Weight:{" "}
              {formatWeight(porterData.packageWeight)}
            </Text>
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 16, fontFamily: "Figtree_700Bold" }}
          >
            Fare Breakdown
          </Text>
          {isInvoice ? (
            <>
              <Row label="Base Fare" value={formatAmount(totalFare)} />
              <Row
                label={`Platform Fee (${platformFeePercent.toFixed(0)}%)`}
                value={formatAmount(platformFee)}
              />
              <Row label="Driver Earning" value={formatAmount(driverEarning)} />
              <Row
                label="Total Amount"
                value={formatAmount(totalFare)}
                bold
                topBorder
              />
            </>
          ) : (
            <>
              <Row label="Base Fare" value={formatAmount(baseFare)} />
              <Row label="Extra Charges" value={formatAmount(extraCharge)} />
              <Row
                label="Total Fare"
                value={formatAmount(totalFare)}
                bold
                topBorder
              />
            </>
          )}
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Wallet size={16} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#111827",
                fontSize: 14,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Payment
            </Text>
          </View>
          <Text
            style={{
              marginTop: 8,
              color: "#374151",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Method: {porterPaymentData?.paymentMethod || "N/A"}
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: "#374151",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Status:{" "}
            {porterPaymentData
              ? getPaymentStatusLabel(porterPaymentData.status as any)
              : "N/A"}
          </Text>
        </View>
      </ScrollView>
    );
  };

  const renderCarPoolTemplate = () => {
    if (templateLoading) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={brandColor} />
          <Text
            style={{
              marginTop: 10,
              color: "#6B7280",
              fontSize: 14,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Loading {titleValue.toLowerCase()}...
          </Text>
        </View>
      );
    }

    if (templateError || !carPoolData || !carPoolMemberData) {
      return (
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
              color: "#DC2626",
              textAlign: "center",
              fontSize: 14,
              fontFamily: "Figtree_500Medium",
            }}
          >
            {templateError || "Unable to render document preview."}
          </Text>
          <TouchableOpacity
            onPress={() => void loadCarPoolTemplate()}
            style={{
              marginTop: 14,
              backgroundColor: "#FFF7F2",
              borderWidth: 1,
              borderColor: "#FDE8D8",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                color: brandColor,
                fontSize: 14,
                fontFamily: "Figtree_600SemiBold",
              }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    const isInvoice = docTypeValue === "invoice";
    const totalFare = Number(
      carPoolMemberData.fare || carPoolPaymentData?.fareAmount || 0
    );
    const platformFee = Number(carPoolPaymentData?.platformFeeAmount || 0);
    const platformFeePercent = Number(carPoolPaymentData?.platformFeePercent || 0);
    const driverEarning = Number(
      carPoolPaymentData?.driverEarningAmount || Math.max(0, totalFare - platformFee)
    );

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F9FAFB" }}
        contentContainerStyle={{ padding: 16, paddingBottom: 26 }}
      >
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
          }}
        >
          <Text
            style={{
              color: brandColor,
              fontSize: 13,
              fontFamily: "Figtree_700Bold",
              letterSpacing: 0.7,
            }}
          >
            {isInvoice ? "INVOICE" : "RECEIPT"}
          </Text>
          <Text
            style={{
              color: "#111827",
              fontSize: 20,
              fontFamily: "Figtree_700Bold",
              marginTop: 4,
            }}
          >
            {isInvoice ? "Ride Share Invoice" : "Ride Share Receipt"}
          </Text>
          <Text
            style={{
              color: "#6B7280",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
              marginTop: 6,
            }}
          >
            {formatDateTime(
              carPoolMemberData.droppedOffAt ||
                carPoolData.completedAt ||
                carPoolMemberData.requestedAt
            )}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 16, fontFamily: "Figtree_700Bold" }}
          >
            Trip Details
          </Text>

          <View style={{ flexDirection: "row", marginTop: 14 }}>
            <MapPin size={16} color="#16A34A" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 12,
                  fontFamily: "Figtree_500Medium",
                }}
              >
                Pickup
              </Text>
              <Text
                style={{
                  color: "#111827",
                  fontSize: 14,
                  fontFamily: "Figtree_600SemiBold",
                  marginTop: 2,
                }}
              >
                {carPoolMemberData.pickupLocation}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", marginTop: 14 }}>
            <Flag size={16} color={brandColor} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 12,
                  fontFamily: "Figtree_500Medium",
                }}
              >
                Drop-off
              </Text>
              <Text
                style={{
                  color: "#111827",
                  fontSize: 14,
                  fontFamily: "Figtree_600SemiBold",
                  marginTop: 2,
                }}
              >
                {carPoolMemberData.destinationLocation}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 16, fontFamily: "Figtree_700Bold" }}
          >
            Ride Information
          </Text>

          <View style={{ flexDirection: "row", marginTop: 12 }}>
            <Car size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Vehicle:{" "}
              {pickVehicleLabel(
                carPoolData.driver?.vehicleSubcategoryName,
                carPoolData.driver?.vehicleType,
                carPoolData.vehicleSubcategoryName,
                carPoolData.vehicleType
              )}
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <User size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Driver: {carPoolData.driver?.fullName || "N/A"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <CalendarDays size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Date:{" "}
              {formatDateTime(
                carPoolMemberData.droppedOffAt ||
                  carPoolData.completedAt ||
                  carPoolMemberData.requestedAt
              )}
            </Text>
          </View>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <Clock3 size={15} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#374151",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
            >
              Duration:{" "}
              {getDurationFromTimes(
                carPoolMemberData.pickedUpAt ||
                  carPoolMemberData.confirmedAt ||
                  carPoolMemberData.requestedAt,
                carPoolMemberData.droppedOffAt ||
                  carPoolData.completedAt ||
                  carPoolPaymentData?.processedAt
              )}
            </Text>
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 16, fontFamily: "Figtree_700Bold" }}
          >
            Fare Breakdown
          </Text>
          {isInvoice ? (
            <>
              <Row label="Base Fare" value={formatAmount(totalFare)} />
              <Row
                label={`Platform Fee (${platformFeePercent.toFixed(0)}%)`}
                value={formatAmount(platformFee)}
              />
              <Row label="Driver Earning" value={formatAmount(driverEarning)} />
              <Row
                label="Total Amount"
                value={formatAmount(totalFare)}
                bold
                topBorder
              />
            </>
          ) : (
            <>
              <Row label="Ride Fare" value={formatAmount(totalFare)} />
              <Row
                label="Total Fare"
                value={formatAmount(totalFare)}
                bold
                topBorder
              />
            </>
          )}
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            marginTop: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Wallet size={16} color="#6B7280" />
            <Text
              style={{
                marginLeft: 8,
                color: "#111827",
                fontSize: 14,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Payment
            </Text>
          </View>
          <Text
            style={{
              marginTop: 8,
              color: "#374151",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Method: {carPoolPaymentData?.paymentMethod || "N/A"}
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: "#374151",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Status:{" "}
            {carPoolPaymentData
              ? getPaymentStatusLabel(carPoolPaymentData.status as any)
              : "N/A"}
          </Text>
        </View>
      </ScrollView>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
        <View
          style={{
            height: 56,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#F3F4F6",
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 18,
            }}
          >
            <ArrowLeft size={20} color="#111827" />
          </TouchableOpacity>

          <Text
            style={{
              flex: 1,
              marginLeft: 6,
              fontSize: 17,
              color: "#111827",
              fontFamily: "Figtree_700Bold",
            }}
            numberOfLines={1}
          >
            {titleValue}
          </Text>

          <TouchableOpacity
            onPress={handleDownload}
            disabled={downloading || sharing}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 18,
              opacity: downloading || sharing ? 0.5 : 1,
              marginRight: 2,
            }}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={brandColor} />
            ) : (
              <Download size={18} color={brandColor} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing || downloading}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 18,
              opacity: sharing || downloading ? 0.5 : 1,
            }}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={brandColor} />
            ) : (
              <Share2 size={18} color={brandColor} />
            )}
          </TouchableOpacity>
        </View>

        {isTemplateMode ? (
          isRideTemplateMode
            ? renderRideTemplate()
            : isPorterTemplateMode
            ? renderPorterTemplate()
            : renderCarPoolTemplate()
        ) : (
          <>
            {docLoading && (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="large" color={brandColor} />
                <Text
                  style={{
                    marginTop: 10,
                    color: "#6B7280",
                    fontSize: 14,
                    fontFamily: "Figtree_500Medium",
                  }}
                >
                  Loading {titleValue.toLowerCase()}...
                </Text>
              </View>
            )}

            {!docLoading && error && (
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
                    color: "#DC2626",
                    textAlign: "center",
                    fontSize: 14,
                    fontFamily: "Figtree_500Medium",
                  }}
                >
                  {error}
                </Text>
                <TouchableOpacity
                  onPress={() => void resolveDocument()}
                  style={{
                    marginTop: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#FFF7F2",
                    borderWidth: 1,
                    borderColor: "#FDE8D8",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <RefreshCcw size={14} color={brandColor} />
                  <Text
                    style={{
                      color: brandColor,
                      fontSize: 14,
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    Retry
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {!docLoading && !error && canPreviewInApp && WebView && (
              <WebView
                source={viewerHtml ? { html: viewerHtml } : { uri: viewerUrl! }}
                style={{ flex: 1, backgroundColor: "#FFFFFF" }}
                originWhitelist={["*"]}
                startInLoadingState
                setSupportMultipleWindows={false}
                renderLoading={() => (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator size="large" color={brandColor} />
                  </View>
                )}
              />
            )}

            {!docLoading && !error && !canPreviewInApp && (
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
                    color: "#6B7280",
                    textAlign: "center",
                    fontSize: 14,
                    fontFamily: "Figtree_500Medium",
                  }}
                >
                  Opening preview in browser for this build...
                </Text>
                <TouchableOpacity
                  onPress={openFallbackPreview}
                  disabled={openingFallbackPreview}
                  style={{
                    marginTop: 14,
                    backgroundColor: "#FFF7F2",
                    borderWidth: 1,
                    borderColor: "#FDE8D8",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    opacity: openingFallbackPreview ? 0.6 : 1,
                  }}
                >
                  {openingFallbackPreview ? (
                    <ActivityIndicator size="small" color={brandColor} />
                  ) : (
                    <Text
                      style={{
                        color: brandColor,
                        fontSize: 14,
                        fontFamily: "Figtree_600SemiBold",
                      }}
                    >
                      Open Preview
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </>
  );
}

function Row({
  label,
  value,
  bold = false,
  topBorder = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  topBorder?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: topBorder ? 12 : 10,
        marginTop: topBorder ? 8 : 0,
        borderTopWidth: topBorder ? 1 : 0,
        borderTopColor: "#F3F4F6",
      }}
    >
      <Text
        style={{
          color: bold ? "#111827" : "#374151",
          fontSize: bold ? 16 : 14,
          fontFamily: bold ? "Figtree_700Bold" : "Figtree_500Medium",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: "#111827",
          fontSize: bold ? 16 : 14,
          fontFamily: bold ? "Figtree_700Bold" : "Figtree_600SemiBold",
        }}
      >
        {value}
      </Text>
    </View>
  );
}
