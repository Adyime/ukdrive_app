/**
 * Notifications API
 * Handles all notification-related API calls
 */

import { get, post, patch, del } from '../api';

// ============================================
// Types
// ============================================

export interface Notification {
  id: string;
  userId: string;
  userType: 'passenger' | 'driver';
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface PaginatedNotifications {
  notifications: Notification[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface UnreadCountResponse {
  count: number;
}

export interface DeviceTokenPayload {
  playerId: string;
  platform: 'android' | 'ios';
}

// ============================================
// API Functions
// ============================================

/**
 * Get paginated list of notifications
 */
export async function getNotifications(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedNotifications> {
  const response = await get<PaginatedNotifications>(
    `/api/notifications?page=${page}&limit=${limit}`
  );
  // get() returns ApiResponse<T>, so data is in response.data
  const data = response?.data;
  // Ensure we always return a valid structure even if API returns unexpected data
  return {
    notifications: data?.notifications ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    limit: data?.limit ?? limit,
    hasMore: data?.hasMore ?? false,
  };
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(): Promise<number> {
  const response = await get<UnreadCountResponse>('/api/notifications/unread-count');
  // get() returns ApiResponse<T>, so data is in response.data
  return response?.data?.count ?? 0;
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string): Promise<Notification | null> {
  const response = await patch<Notification>(`/api/notifications/${notificationId}/read`, {});
  return response?.data ?? null;
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(): Promise<{ markedCount: number }> {
  const response = await patch<{ markedCount: number }>('/api/notifications/read-all', {});
  return response?.data ?? { markedCount: 0 };
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  await del(`/api/notifications/${notificationId}`);
}

/**
 * Register device token for push notifications
 */
export async function registerDeviceToken(payload: DeviceTokenPayload): Promise<void> {
  await post('/api/notifications/device-token', payload);
}

/**
 * Unregister device token (call on logout)
 */
export async function unregisterDeviceToken(platform?: 'android' | 'ios'): Promise<void> {
  const query = platform ? `?platform=${platform}` : '';
  await del(`/api/notifications/device-token${query}`);
}

