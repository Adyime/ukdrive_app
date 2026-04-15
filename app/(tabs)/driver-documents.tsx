import { Loading } from "@/components/ui/loading";
import { LocalizedText as Text } from "@/components/localized-text";
import { ImagePickerComponent } from "@/components/ui/image-picker";
import { useToast } from "@/components/ui/toast";
import {
  getDriverDocumentsForVerification, resubmitDriverDocument, type DriverDocumentType, type DriverDocumentReviewStatus, } from "@/lib/api/driver";
import { uploadDocumentImage } from "@/lib/api/storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type DocumentDraft = Record<DriverDocumentType, { front: string; back: string }>;

const BRAND_PURPLE = "#843FE3";

const DOC_CONFIG: { type: DriverDocumentType; label: string }[] = [
  { type: "license", label: "Driving License" },
  { type: "aadhaar", label: "Aadhaar Card" },
  { type: "rc", label: "Vehicle RC" },
];

function statusStyles(status: DriverDocumentReviewStatus) {
  if (status === "approved") {
    return { bg: "#ECFDF3", border: "#ABEFC6", text: "#067647", label: "Approved" };
  }
  if (status === "rejected") {
    return { bg: "#FEF3F2", border: "#FECDCA", text: "#B42318", label: "Rejected" };
  }
  return { bg: "#FFFAEB", border: "#FEDF89", text: "#B54708", label: "Pending" };
}

export default function DriverDocumentsScreen() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [submittingType, setSubmittingType] = useState<DriverDocumentType | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [documents, setDocuments] = useState<Awaited<
    ReturnType<typeof getDriverDocumentsForVerification>
  >["data"] | null>(null);
  const [draft, setDraft] = useState<DocumentDraft>({
    license: { front: "", back: "" },
    aadhaar: { front: "", back: "" },
    rc: { front: "", back: "" },
  });
  const [preview, setPreview] = useState<DocumentDraft>({
    license: { front: "", back: "" },
    aadhaar: { front: "", back: "" },
    rc: { front: "", back: "" },
  });

  const isAnyUploadInProgress = useMemo(
    () => Object.values(uploading).some(Boolean),
    [uploading]
  );

  const setUploadState = (type: DriverDocumentType, side: "front" | "back", value: boolean) => {
    setUploading((prev) => ({ ...prev, [`${type}:${side}`]: value }));
  };

  const loadDocuments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setReloading(true);
    else setLoading(true);
    try {
      const response = await getDriverDocumentsForVerification();
      if (!response.success || !response.data) {
        const message =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String(response.error.message)
            : "Failed to load documents.";
        toast.error(message);
        return;
      }

      setDocuments(response.data);
      setDraft({
        license: {
          front: response.data.documents.license.front_image || "",
          back: response.data.documents.license.back_image || "",
        },
        aadhaar: {
          front: response.data.documents.aadhaar.front_image || "",
          back: response.data.documents.aadhaar.back_image || "",
        },
        rc: {
          front: response.data.documents.rc.front_image || "",
          back: response.data.documents.rc.back_image || "",
        },
      });
      setPreview({
        license: {
          front:
            response.data.documents.license.front_preview_url ||
            response.data.documents.license.front_image ||
            "",
          back:
            response.data.documents.license.back_preview_url ||
            response.data.documents.license.back_image ||
            "",
        },
        aadhaar: {
          front:
            response.data.documents.aadhaar.front_preview_url ||
            response.data.documents.aadhaar.front_image ||
            "",
          back:
            response.data.documents.aadhaar.back_preview_url ||
            response.data.documents.aadhaar.back_image ||
            "",
        },
        rc: {
          front:
            response.data.documents.rc.front_preview_url ||
            response.data.documents.rc.front_image ||
            "",
          back:
            response.data.documents.rc.back_preview_url ||
            response.data.documents.rc.back_image ||
            "",
        },
      });
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments])
  );

  const handleResubmit = async (type: DriverDocumentType) => {
    if (!documents) return;

    const frontImage = draft[type].front.trim();
    const backImage = draft[type].back.trim();
    if (!frontImage || !backImage) {
      toast.warning("Please upload both front and back images before resubmitting.");
      return;
    }

    setSubmittingType(type);
    try {
      const response = await resubmitDriverDocument(type, {
        frontImage,
        backImage,
      });
      if (!response.success) {
        const message =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String(response.error.message)
            : "Failed to resubmit document.";
        toast.error(message);
        return;
      }

      toast.success("Document resubmitted for approval.");
      await loadDocuments(true);
    } finally {
      setSubmittingType(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Loading message="Loading documents..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 py-3 border-b border-gray-200 bg-white">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={{ color: BRAND_PURPLE, fontFamily: "Figtree_600SemiBold" }}>
              Back
            </Text>
          </TouchableOpacity>
          <Text style={{ fontFamily: "Figtree_600SemiBold", fontSize: 16 }}>
            Driver Documents
          </Text>
          <TouchableOpacity
            onPress={() => loadDocuments(true)}
            activeOpacity={0.8}
            disabled={reloading}
          >
            <Text style={{ color: BRAND_PURPLE, fontFamily: "Figtree_600SemiBold" }}>
              {reloading ? "Refreshing..." : "Refresh"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 py-4">
        <Text
          style={{ fontFamily: "Figtree_400Regular" }}
          className="text-sm text-gray-600 mb-4"
        >
          Review each document status. Rejected documents can be replaced and re-submitted.
        </Text>

        {DOC_CONFIG.map((config) => {
          const doc = documents?.documents[config.type];
          if (!doc) return null;
          const statusUi = statusStyles(doc.status);
          const canResubmit =
            doc.status === "rejected" &&
            draft[config.type].front.trim().length > 0 &&
            draft[config.type].back.trim().length > 0;

          return (
            <View
              key={config.type}
              className="mb-5 rounded-2xl border border-gray-200 bg-white p-4"
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text style={{ fontFamily: "Figtree_600SemiBold", fontSize: 16 }}>
                  {config.label}
                </Text>
                <View
                  style={{
                    backgroundColor: statusUi.bg,
                    borderColor: statusUi.border,
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      color: statusUi.text,
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 12,
                    }}
                  >
                    {statusUi.label}
                  </Text>
                </View>
              </View>

              {doc.status === "rejected" && doc.rejection_reason ? (
                <Text
                  style={{ fontFamily: "Figtree_500Medium" }}
                  className="text-sm text-red-600 mb-3"
                >
                  {doc.rejection_reason}
                </Text>
              ) : null}

              <ImagePickerComponent
                label="Front Image"
                value={draft[config.type].front}
                previewUri={preview[config.type].front}
                onChange={(value) => {
                  setDraft((prev) => ({
                    ...prev,
                    [config.type]: { ...prev[config.type], front: value },
                  }));
                  setPreview((prev) => ({
                    ...prev,
                    [config.type]: { ...prev[config.type], front: value },
                  }));
                }}
                documentType={config.type}
                onUploadStart={() => setUploadState(config.type, "front", true)}
                onUploadComplete={() => setUploadState(config.type, "front", false)}
                onUploadError={() => setUploadState(config.type, "front", false)}
                uploadFunction={(file) => uploadDocumentImage(file, config.type)}
                disabled={submittingType !== null}
              />

              <ImagePickerComponent
                label="Back Image"
                value={draft[config.type].back}
                previewUri={preview[config.type].back}
                onChange={(value) => {
                  setDraft((prev) => ({
                    ...prev,
                    [config.type]: { ...prev[config.type], back: value },
                  }));
                  setPreview((prev) => ({
                    ...prev,
                    [config.type]: { ...prev[config.type], back: value },
                  }));
                }}
                documentType={config.type}
                onUploadStart={() => setUploadState(config.type, "back", true)}
                onUploadComplete={() => setUploadState(config.type, "back", false)}
                onUploadError={() => setUploadState(config.type, "back", false)}
                uploadFunction={(file) => uploadDocumentImage(file, config.type)}
                disabled={submittingType !== null}
              />

              {doc.status === "rejected" ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => handleResubmit(config.type)}
                  disabled={
                    !canResubmit ||
                    submittingType !== null ||
                    isAnyUploadInProgress
                  }
                  style={{
                    marginTop: 4,
                    backgroundColor: BRAND_PURPLE,
                    borderRadius: 10,
                    paddingVertical: 12,
                    opacity:
                      !canResubmit || submittingType !== null || isAnyUploadInProgress
                        ? 0.55
                        : 1,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      textAlign: "center",
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    {submittingType === config.type
                      ? "Submitting..."
                      : "Resubmit for Approval"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
