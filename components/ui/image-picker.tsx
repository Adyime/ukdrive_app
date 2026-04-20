/**
 * Image Picker Component
 * Handles image selection and preview for document uploads
 */

import { useEffect, useState } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, Image, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useToast } from "@/components/ui/toast";
import { Button } from "./button";
import { Loading } from "./loading";

export interface ImagePickerProps {
  label: string;
  value?: string; // Image URI or object key
  previewUri?: string; // Optional display URL (e.g. presigned GET URL)
  onChange: (uri: string) => void;
  error?: string;
  documentType: "license" | "aadhaar" | "rc";
  onUploadStart?: () => void;
  onUploadComplete?: (objectKey: string) => void;
  onUploadError?: (error: string) => void;
  /** When upload fails due to expired session (401), OK button will call this so user can go back to login */
  onSessionExpired?: () => void;
  uploadFunction?: (file: {
    uri: string;
    type: string;
    name: string;
  }) => Promise<{ success: boolean; objectKey?: string; error?: unknown }>;
  disabled?: boolean;
}

export function ImagePickerComponent({
  label,
  value,
  previewUri,
  onChange,
  error,
  documentType,
  onUploadStart,
  onUploadComplete,
  onUploadError,
  onSessionExpired,
  uploadFunction,
  disabled = false,
}: ImagePickerProps) {
  const toast = useToast();
  const isSessionExpiredError = (msg: string) =>
    /expired|verify your phone|401|unauthorized/i.test(msg);

  const [imageUri, setImageUri] = useState<string | null>(value || null);
  const [uploading, setUploading] = useState(false);
  const [uploadedObjectKey, setUploadedObjectKey] = useState<string | null>(
    null
  );

  const isDisplayableUri = (uri: string) =>
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("data:");

  useEffect(() => {
    const sourceUri = (previewUri || value || "").trim();
    if (!sourceUri) {
      setImageUri(null);
      return;
    }

    // Avoid overriding local preview with raw object keys.
    if (isDisplayableUri(sourceUri)) {
      setImageUri(sourceUri);
    }
  }, [previewUri, value]);

  const pickImage = async () => {
    if (disabled || uploading) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        legacy: false,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const fileName =
          asset.fileName ||
          (uri.includes("/") ? uri.split("/").pop() : null) ||
          `${documentType}-${Date.now()}.jpg`;

        setImageUri(uri);
        onChange(uri);

        // If upload function is provided, upload the image
        if (uploadFunction) {
          await uploadImage(uri, asset.mimeType || "image/jpeg", fileName);
        }
      }
    } catch (error) {
      console.error("Error picking image:", error);
      toast.error("Failed to pick image. Please try again.");
    }
  };

  const takePhoto = async () => {
    if (disabled || uploading) return;

    // Request camera permission
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        toast.warning("Camera permission is needed to take photos.");
        return;
      }
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const fileName =
          asset.fileName ||
          (uri.includes("/") ? uri.split("/").pop() : null) ||
          `${documentType}-${Date.now()}.jpg`;

        setImageUri(uri);
        onChange(uri);

        // If upload function is provided, upload the image
        if (uploadFunction) {
          await uploadImage(uri, asset.mimeType || "image/jpeg", fileName);
        }
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      toast.error("Failed to take photo. Please try again.");
    }
  };

  const uploadImage = async (
    uri: string,
    mimeType: string,
    fileName: string
  ) => {
    if (!uploadFunction) return;

    setUploading(true);
    onUploadStart?.();

    try {
      const result = await uploadFunction({
        uri,
        type: mimeType,
        name: fileName,
      });

      if (result.success && result.objectKey) {
        setUploadedObjectKey(result.objectKey);
        onChange(result.objectKey); // Update with object key
        onUploadComplete?.(result.objectKey);
      } else {
        const errorMessage =
          result.error &&
          typeof result.error === "object" &&
          "message" in result.error
            ? String(result.error.message)
            : "Failed to upload image";
        onUploadError?.(errorMessage);
        // Session expired: redirect to login automatically (no need to tap OK)
        if (onSessionExpired && isSessionExpiredError(errorMessage)) {
          onSessionExpired();
          setUploading(false);
          return;
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to upload image";
      onUploadError?.(errorMessage);
      // Session expired: redirect to login automatically
      if (onSessionExpired && isSessionExpiredError(errorMessage)) {
        onSessionExpired();
        setUploading(false);
        return;
      }
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setImageUri(null);
    setUploadedObjectKey(null);
    onChange("");
  };

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </Text>

      {imageUri ? (
        <View className="mb-2">
          <View className="relative rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
            <Image
              source={{ uri: imageUri }}
              className="w-full h-48"
              resizeMode="cover"
            />
            {uploading && (
              <View className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loading message="Uploading..." />
              </View>
            )}
            {uploadedObjectKey && !uploading && (
              <View className="absolute top-2 right-2 bg-green-500 px-2 py-1 rounded">
                <Text className="text-white text-xs font-medium">Uploaded</Text>
              </View>
            )}
          </View>
          <View className="flex-row gap-2 mt-2">
            <Button
              onPress={removeImage}
              variant="outline"
              size="sm"
              disabled={uploading || disabled}
              className="flex-1"
            >
              Remove
            </Button>
            {!uploadedObjectKey && uploadFunction && (
              <Button
                onPress={() =>
                  uploadImage(imageUri, "image/jpeg", `${documentType}.jpg`)
                }
                variant="primary"
                size="sm"
                disabled={uploading || disabled}
                loading={uploading}
                className="flex-1"
              >
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            )}
          </View>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Button
            onPress={pickImage}
            variant="outline"
            size="sm"
            disabled={uploading || disabled}
            className="flex-1"
          >
            Choose from Gallery
          </Button>
          <Button
            onPress={takePhoto}
            variant="outline"
            size="sm"
            disabled={uploading || disabled}
            className="flex-1"
          >
            Take Photo
          </Button>
        </View>
      )}

      {error && <Text className="text-sm text-red-500 mt-1">{error}</Text>}
    </View>
  );
}
