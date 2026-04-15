/**
 * useChat — Fetch history, subscribe to Realtime, send messages.
 * Target: rideId (string), or { porterServiceId }, or { carPoolId }.
 * Uses GET /conversation for conversationId when available; supports /history workaround.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  getChatConversation,
  getChatHistory,
  sendChatMessage,
  getChatConversationPorter,
  getChatHistoryPorter,
  sendChatMessagePorter,
  getChatConversationCarPool,
  getChatHistoryCarPool,
  sendChatMessageCarPool,
  type ChatMessage,
  type ChatHistoryMeta,
} from '@/lib/api/communication';
import {
  subscribeToChatMessages,
  unsubscribeChannel,
  type ChatMessageRow,
} from '@/lib/supabase';

export type ChatTarget = string | { porterServiceId: string } | { carPoolId: string; passengerId: string } | null;

function resolveChatTarget(t: ChatTarget): { id: string; api: 'ride' | 'porter' | 'carPool'; passengerId?: string } | null {
  if (!t) return null;
  if (typeof t === 'string') return { id: t, api: 'ride' };
  if ('porterServiceId' in t && t.porterServiceId) return { id: t.porterServiceId, api: 'porter' };
  if ('carPoolId' in t && t.carPoolId) return { id: t.carPoolId, api: 'carPool', passengerId: t.passengerId };
  return null;
}

function mapRowToMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type as 'passenger' | 'driver',
    senderId: row.sender_id,
    content: row.content,
    status: row.status as ChatMessage['status'],
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UseChatOptions {
  enabled?: boolean;
  isChatFocused?: boolean;
  onNewMessageWhenNotFocused?: (msg: ChatMessage) => void;
}

/** Poll interval when chat is open (focused) */
const POLL_FOCUSED_MS = 5_000;
/** Poll interval when chat is closed (background) */
const POLL_BACKGROUND_MS = 8_000;

export function useChat(target: ChatTarget, options: UseChatOptions = {}) {
  const { enabled = true, isChatFocused = false, onNewMessageWhenNotFocused } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meta, setMeta] = useState<ChatHistoryMeta>({ hasMore: false });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const onNewRef = useRef(onNewMessageWhenNotFocused);
  const isFocusedRef = useRef(isChatFocused);
  const sendLockRef = useRef(false);

  // Track IDs we have already seen so we can detect genuinely new messages
  // from both the Realtime path and the polling/refresh path.
  const knownIdsRef = useRef<Set<string>>(new Set());
  // Track IDs of messages *we* sent so we don't popup-notify ourselves.
  const sentByMeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onNewRef.current = onNewMessageWhenNotFocused;
  }, [onNewMessageWhenNotFocused]);
  useEffect(() => {
    isFocusedRef.current = isChatFocused;
  }, [isChatFocused]);

  /**
   * Notify the parent about a genuinely new message from the *other* party.
   * Skips messages we sent ourselves.
   */
  const notifyIfNew = useCallback((msg: ChatMessage) => {
    if (sentByMeIdsRef.current.has(msg.id)) return;
    if (knownIdsRef.current.has(msg.id)) return;
    knownIdsRef.current.add(msg.id);
    onNewRef.current?.(msg);
  }, []);

  const refresh = useCallback(async () => {
    const r = resolveChatTarget(target);
    if (!r || !enabled) return;
    const { id, api, passengerId } = r;
    setLoading(true);
    setError(null);
    try {
      const getConv =
        api === 'ride'
          ? () => getChatConversation(id)
          : api === 'porter'
            ? () => getChatConversationPorter(id)
            : () => getChatConversationCarPool(id, passengerId!);
      const getHist =
        api === 'ride'
          ? (l: number, b?: string) => getChatHistory(id, l, b)
          : api === 'porter'
            ? (l: number, b?: string) => getChatHistoryPorter(id, l, b)
            : (l: number, b?: string) => getChatHistoryCarPool(id, passengerId!, l, b);
      const [convRes, histRes] = await Promise.all([getConv(), getHist(50)]);
      if (convRes.success && convRes.data?.conversationId) {
        setConversationId(convRes.data.conversationId);
      }
      const rawMessages =
        (histRes.success && histRes.data && 'messages' in histRes.data && Array.isArray(histRes.data.messages)
          ? histRes.data.messages
          : Array.isArray(histRes.data)
            ? histRes.data
            : []) as ChatMessage[];
      if (histRes.success) {
        // Detect genuinely new messages (not yet known) and notify the parent.
        // This covers the case where Supabase Realtime is unavailable and
        // polling is the only way to discover new messages.
        for (const msg of rawMessages) {
          notifyIfNew(msg);
        }
        // After notification, mark every message as known.
        for (const msg of rawMessages) {
          knownIdsRef.current.add(msg.id);
        }

        // API returns newest-first (sentAt desc). For FlatList inverted: [newest, ..., oldest] → oldest at top, newest at bottom.
        setMessages([...rawMessages]);
        const m = histRes.meta as (ChatHistoryMeta & { conversationId?: string }) | undefined;
        setMeta({ hasMore: m?.hasMore ?? false, nextBefore: m?.nextBefore });
        if (!convRes.data?.conversationId && m?.conversationId) {
          setConversationId(m.conversationId);
        }
      }
    } catch {
      setError('Failed to load chat.');
    } finally {
      setLoading(false);
    }
  }, [target, enabled, notifyIfNew]);

  useEffect(() => {
    const r = resolveChatTarget(target);
    if (!r || !enabled) {
      setConversationId(null);
      setMessages([]);
      setMeta({ hasMore: false });
      knownIdsRef.current.clear();
      sentByMeIdsRef.current.clear();
      return;
    }
    refresh();
  }, [target, enabled, refresh]);

  // Refetch when user opens the chat so messages sent by the other party while closed are loaded
  const prevFocusRef = useRef(false);
  useEffect(() => {
    const becameFocused = isChatFocused && !prevFocusRef.current;
    prevFocusRef.current = isChatFocused;
    if (becameFocused && enabled && resolveChatTarget(target)) refresh();
  }, [isChatFocused, enabled, target, refresh]);

  // Poll for new messages — both when focused (fast) and in background (slower).
  // This ensures notifications work even when Supabase Realtime is unavailable.
  useEffect(() => {
    if (!enabled || !resolveChatTarget(target)) return;
    const interval = isChatFocused ? POLL_FOCUSED_MS : POLL_BACKGROUND_MS;
    const id = setInterval(refresh, interval);
    return () => clearInterval(id);
  }, [isChatFocused, enabled, target, refresh]);

  // Realtime: subscribe when we have conversationId
  useEffect(() => {
    if (!conversationId || !enabled) return;
    const channel = subscribeToChatMessages(
      conversationId,
      (row) => {
        const msg = mapRowToMessage(row);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [msg, ...prev];
        });
        // Notify for messages from the other party that we haven't seen yet.
        notifyIfNew(msg);
      },
      undefined,
      (e) => setError(e.message)
    );
    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId, enabled, notifyIfNew]);

  // If we never got conversationId from /conversation, try from first message (workaround)
  useEffect(() => {
    if (conversationId || !enabled || messages.length === 0) return;
    const cid = messages[0]?.conversationId;
    if (cid) setConversationId(cid);
  }, [conversationId, enabled, messages]);

  const loadMore = useCallback(async () => {
    const r = resolveChatTarget(target);
    if (!r || !meta.hasMore || meta.nextBefore == null || loading) return;
    const { id, api, passengerId } = r;
    setLoading(true);
    setError(null);
    try {
      const getHist =
        api === 'ride'
          ? () => getChatHistory(id, 50, meta.nextBefore)
          : api === 'porter'
            ? () => getChatHistoryPorter(id, 50, meta.nextBefore)
            : () => getChatHistoryCarPool(id, passengerId!, 50, meta.nextBefore);
      const res = await getHist();
      if (res.success && res.data?.messages) {
        // Older messages loaded via pagination — mark as known but don't notify.
        for (const msg of res.data.messages) {
          knownIdsRef.current.add(msg.id);
        }
        // API returns batch in desc order. Append to end so oldest-of-batch appears at top (inverted list).
        setMessages((prev) => [...prev, ...res.data.messages]);
        const m = res.meta as ChatHistoryMeta | undefined;
        setMeta({ hasMore: m?.hasMore ?? false, nextBefore: m?.nextBefore });
      }
    } catch {
      setError('Failed to load more.');
    } finally {
      setLoading(false);
    }
  }, [target, meta.hasMore, meta.nextBefore, loading]);

  const sendMessage = useCallback(
    async (content: string) => {
      const r = resolveChatTarget(target);
      if (!r || !content.trim() || sendLockRef.current) return;
      const { id, api, passengerId } = r;
      sendLockRef.current = true;
      setSending(true);
      setError(null);
      try {
        const send =
          api === 'ride'
            ? () => sendChatMessage(id, content.trim())
            : api === 'porter'
              ? () => sendChatMessagePorter(id, content.trim())
              : () => sendChatMessageCarPool(id, passengerId!, content.trim());
        const res = await send();
        if (res.success && res.data) {
          const msg = res.data;
          // Track this message as self-sent so Realtime/polling don't notify us.
          sentByMeIdsRef.current.add(msg.id);
          knownIdsRef.current.add(msg.id);
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [msg, ...prev];
          });
          if (!conversationId && msg.conversationId) setConversationId(msg.conversationId);
        } else {
          setError(res.error?.message ?? 'Failed to send.');
        }
      } catch {
        setError('Failed to send.');
      } finally {
        setSending(false);
        sendLockRef.current = false;
      }
    },
    [target, conversationId]
  );

  return {
    messages,
    meta,
    loading,
    sending,
    error,
    sendMessage,
    loadMore,
    refresh,
  };
}
