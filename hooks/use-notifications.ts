/**
 * Notifications Hook
 * Provides notification data and actions for the UI
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  type Notification,
  type PaginatedNotifications,
} from '../lib/api/notifications';
import { useAuth } from '../context/auth-context';
import { addNotificationEventListener } from '../lib/events';

// Return type for the hook
interface UseNotificationsResult {
  // Data
  notifications: Notification[];
  unreadCount: number;
  total: number;
  hasMore: boolean;
  page: number;
  
  // State
  isLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  error: string | null;
  
  // Actions
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (notificationId: string) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

// Page size for pagination
const PAGE_SIZE = 20;

/**
 * Hook to fetch and manage notifications
 * Only fetches when user is authenticated
 */
export function useNotifications(): UseNotificationsResult {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch notifications (first page or refresh)
   */
  const fetchNotifications = useCallback(async (isRefresh: boolean = false) => {
    // Don't fetch if not authenticated
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setTotal(0);
      setHasMore(false);
      setPage(1);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const result = await getNotifications(1, PAGE_SIZE);
      setNotifications(result?.notifications ?? []);
      setTotal(result?.total ?? 0);
      setHasMore(result?.hasMore ?? false);
      setPage(1);

      // Also refresh unread count
      const count = await getUnreadCount();
      setUnreadCount(count ?? 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load notifications';
      setError(message);
      if (__DEV__) {
        console.warn('[useNotifications] Fetch error:', err);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  /**
   * Load more notifications (pagination)
   */
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    try {
      setIsLoadingMore(true);
      setError(null);

      const nextPage = page + 1;
      const result = await getNotifications(nextPage, PAGE_SIZE);
      
      setNotifications(prev => [...prev, ...(result?.notifications ?? [])]);
      setTotal(prev => result?.total ?? prev);
      setHasMore(result?.hasMore ?? false);
      setPage(nextPage);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more notifications';
      setError(message);
      console.error('[useNotifications] Load more error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, hasMore, isLoadingMore]);

  /**
   * Mark a notification as read
   */
  const markRead = useCallback(async (notificationId: string) => {
    // Find the notification to check if it's already read
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || notification.isRead) {
      // Already read or not found - no action needed
      return;
    }

    try {
      await markAsRead(notificationId);
      
      // Update local state
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId
            ? { ...n, isRead: true, readAt: new Date().toISOString() }
            : n
        )
      );
      
      // Decrement unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('[useNotifications] Mark read error:', err);
      throw err;
    }
  }, [notifications]);

  /**
   * Mark all notifications as read
   */
  const markAllRead = useCallback(async () => {
    try {
      await markAllAsRead();
      
      // Update local state
      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      
      // Reset unread count
      setUnreadCount(0);
    } catch (err) {
      console.error('[useNotifications] Mark all read error:', err);
      throw err;
    }
  }, []);

  /**
   * Delete a notification
   */
  const remove = useCallback(async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
      
      // Update local state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setTotal(prev => prev - 1);
      
      // Update unread count if the notification was unread
      const notification = notifications.find(n => n.id === notificationId);
      if (notification && !notification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('[useNotifications] Delete error:', err);
      throw err;
    }
  }, [notifications]);

  /**
   * Refresh just the unread count
   */
  const refreshUnreadCount = useCallback(async () => {
    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      console.error('[useNotifications] Refresh unread count error:', err);
    }
  }, []);

  /**
   * Refresh handler
   */
  const refresh = useCallback(async () => {
    await fetchNotifications(true);
  }, [fetchNotifications]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications(false);
  }, [fetchNotifications]);

  // Listen for notification events to auto-refresh
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const cleanup = addNotificationEventListener(() => {
      fetchNotifications(true);
    });
    
    return cleanup;
  }, [isAuthenticated, fetchNotifications]);

  return {
    notifications,
    unreadCount,
    total,
    hasMore,
    page,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    refresh,
    loadMore,
    markRead,
    markAllRead,
    remove,
    refreshUnreadCount,
  };
}

/**
 * Simpler hook for just the unread count (e.g., for tab badge)
 * Only fetches when user is authenticated to prevent 401 errors
 */
export function useUnreadNotificationCount(): {
  count: number;
  refresh: () => Promise<void>;
} {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState<number>(0);

  const refresh = useCallback(async () => {
    // Don't fetch if not authenticated
    if (!isAuthenticated) {
      setCount(0);
      return;
    }
    
    try {
      const unread = await getUnreadCount();
      setCount(unread);
    } catch (err) {
      // Silently handle errors - user might be logging out
      // Don't throw or break the app
      if (__DEV__) {
        console.warn('[useUnreadNotificationCount] Error (ignored):', err);
      }
      // Reset count on error to avoid stale data
      setCount(0);
    }
  }, [isAuthenticated]);

  // Initial fetch and re-fetch when auth changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh periodically (every 30 seconds) only when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh, isAuthenticated]);

  // Listen for notification events to auto-refresh count
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const cleanup = addNotificationEventListener(refresh);
    return cleanup;
  }, [isAuthenticated, refresh]);

  return { count, refresh };
}
