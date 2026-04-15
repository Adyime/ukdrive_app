/**
 * Communication API
 * Chat (history, send, conversation) and Call (initiate) for active rides.
 */

import { get, post } from '../api';

// ============================================
// Types
// ============================================

export type ChatMessageStatus = 'SENT' | 'DELIVERED' | 'READ';
export type ChatSenderType = 'passenger' | 'driver';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: ChatSenderType;
  senderId: string;
  content: string;
  status: ChatMessageStatus;
  sentAt: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatHistoryMeta {
  hasMore: boolean;
  nextBefore?: string;
}

export interface InitiateCallResult {
  connectionId: string;
  virtualNumber?: string;
  pin: string;
  duration: string;
}

// ============================================
// Chat
// ============================================

/**
 * GET /api/chat/:rideId/conversation
 * Get or create the conversation; returns conversationId for Realtime subscription.
 */
export async function getChatConversation(rideId: string) {
  return get<{ conversationId: string }>(`/api/chat/${rideId}/conversation`);
}

/**
 * GET /api/chat/:rideId/history
 * Paginated chat history. Use before (message id) for load-more.
 */
export async function getChatHistory(
  rideId: string,
  limit: number = 50,
  before?: string
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return get<{ messages: ChatMessage[] }>(`/api/chat/${rideId}/history?${params.toString()}`);
}

/**
 * POST /api/chat/:rideId/messages
 * Send a message.
 */
export async function sendChatMessage(rideId: string, content: string) {
  return post<ChatMessage>(`/api/chat/${rideId}/messages`, { content });
}

// --- Porter ---

export async function getChatConversationPorter(porterServiceId: string) {
  return get<{ conversationId: string }>(`/api/chat/porter/${porterServiceId}/conversation`);
}

export async function getChatHistoryPorter(
  porterServiceId: string,
  limit: number = 50,
  before?: string
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return get<{ messages: ChatMessage[] }>(`/api/chat/porter/${porterServiceId}/history?${params.toString()}`);
}

export async function sendChatMessagePorter(porterServiceId: string, content: string) {
  return post<ChatMessage>(`/api/chat/porter/${porterServiceId}/messages`, { content });
}

// --- CarPool ---

export async function getChatConversationCarPool(carPoolId: string, passengerId: string) {
  const params = new URLSearchParams({ passengerId });
  return get<{ conversationId: string }>(`/api/chat/car-pool/${carPoolId}/conversation?${params.toString()}`);
}

export async function getChatHistoryCarPool(
  carPoolId: string,
  passengerId: string,
  limit: number = 50,
  before?: string
) {
  const params = new URLSearchParams({ passengerId, limit: String(limit) });
  if (before) params.set('before', before);
  return get<{ messages: ChatMessage[] }>(`/api/chat/car-pool/${carPoolId}/history?${params.toString()}`);
}

export async function sendChatMessageCarPool(carPoolId: string, passengerId: string, content: string) {
  const params = new URLSearchParams({ passengerId });
  return post<ChatMessage>(`/api/chat/car-pool/${carPoolId}/messages?${params.toString()}`, { content });
}

// ============================================
// Call
// ============================================

/**
 * POST /api/call/initiate
 * Body: exactly one of { rideId }, { porterServiceId }, { carPoolId }.
 * Optional: passengerId with carPoolId for driver->specific passenger calls.
 * Returns virtualNumber to dial via Linking.openURL('tel:...').
 */
export async function initiateCall(params: {
  rideId?: string;
  porterServiceId?: string;
  carPoolId?: string;
  passengerId?: string;
}) {
  return post<InitiateCallResult>('/api/call/initiate', params);
}
