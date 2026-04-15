/**
 * Storage API
 * Handles file uploads via presigned URLs (original flow that works with existing RustFS config).
 * App requests presigned URL from API, then PUTs the file directly to that URL.
 */

import { post } from '../api';

export interface PresignedUrlRequest {
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentType: 'license' | 'aadhaar' | 'rc' | 'profile';
  category: 'verification' | 'profile';
}

export interface PresignedUrlResponse {
  presignedUrl: string;
  objectKey: string;
  bucket: string;
  publicUrl: string;
  expiresIn: number;
}

/**
 * Get presigned URL for file upload
 */
export async function getPresignedUrl(
  data: PresignedUrlRequest,
  onboardingToken?: string
): Promise<{ success: boolean; data?: PresignedUrlResponse; error?: unknown }> {
  const headers = onboardingToken
    ? ({
        "X-Onboarding-Token": onboardingToken,
      } as HeadersInit)
    : undefined;
  return post<PresignedUrlResponse>(
    '/api/storage/presigned-url',
    data,
    headers
  );
}

/**
 * Upload file to presigned URL (direct to storage)
 */
export async function uploadFileToPresignedUrl(
  presignedUrl: string,
  file: { uri: string; type: string; name: string }
): Promise<{ success: boolean; error?: unknown }> {
  try {
    const response = await fetch(file.uri);
    const blob = await response.blob();

    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!uploadResponse.ok) {
      return {
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
        },
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to upload file',
      },
    };
  }
}

/**
 * Upload document image: get presigned URL from API, then upload directly to storage.
 */
async function uploadImageByCategory(
  file: { uri: string; type: string; name: string },
  documentType: 'license' | 'aadhaar' | 'rc' | 'profile',
  category: 'verification' | 'profile',
  onboardingToken?: string
): Promise<{ success: boolean; objectKey?: string; error?: unknown }> {
  try {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const fileSize = blob.size;

    const presignedResult = await getPresignedUrl(
      {
        fileName: file.name,
        mimeType: file.type,
        fileSize,
        documentType,
        category,
      },
      onboardingToken
    );

    if (!presignedResult.success || !presignedResult.data) {
      return {
        success: false,
        error: presignedResult.error ?? { code: 'PRESIGNED_URL_FAILED', message: 'Failed to get upload URL' },
      };
    }

    // Use the presigned URL exactly as returned (includes query params). Do not use publicUrl for upload.
    const presignedUrl = presignedResult.data.presignedUrl;
    if (!presignedUrl || typeof presignedUrl !== 'string' || !presignedUrl.includes('X-Amz-')) {
      return {
        success: false,
        error: { code: 'PRESIGNED_URL_FAILED', message: 'Invalid presigned URL from server' },
      };
    }

    const uploadResult = await uploadFileToPresignedUrl(presignedUrl, file);

    if (!uploadResult.success) {
      return {
        success: false,
        error: uploadResult.error ?? { code: 'UPLOAD_FAILED', message: 'Failed to upload file' },
      };
    }

    return {
      success: true,
      objectKey: presignedResult.data.objectKey,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: error instanceof Error ? error.message : 'Failed to upload document',
      },
    };
  }
}

/**
 * Upload verification document image.
 */
export async function uploadDocumentImage(
  file: { uri: string; type: string; name: string },
  documentType: 'license' | 'aadhaar' | 'rc',
  onboardingToken?: string
): Promise<{ success: boolean; objectKey?: string; error?: unknown }> {
  return uploadImageByCategory(file, documentType, 'verification', onboardingToken);
}

/**
 * Upload profile image.
 */
export async function uploadProfileImage(
  file: { uri: string; type: string; name: string }
): Promise<{ success: boolean; objectKey?: string; error?: unknown }> {
  return uploadImageByCategory(file, 'profile', 'profile');
}

