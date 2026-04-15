/**
 * Chat modal for active ride: message list, input, send.
 * Uses useChat; matches existing modal styling (slide, pageSheet).
 * When brandColor is provided (e.g. ride: orange for passenger, purple for driver), header and bubbles use it.
 */

import React, { useCallback, useRef, useState } from "react";
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, Modal, TouchableOpacity, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ChatMessage } from "@/lib/api/communication";
import { useChat } from "@/hooks/use-chat";

const DEFAULT_BRAND = "#10B981";

export interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
  /** For ride chat. */
  rideId?: string;
  /** For porter chat. */
  porterServiceId?: string;
  /** For car-pool chat. */
  carPoolId?: string;
  /** Required for car-pool per-passenger chat. */
  passengerId?: string;
  otherPartyName: string;
  userType: "passenger" | "driver";
  /** Ride: passenger orange #F36D14, driver purple #843FE3. Omit for porter/generic. */
  brandColor?: string;
  enabled?: boolean;
  onNewMessageWhenNotFocused?: (msg: ChatMessage) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

export function ChatModal({
  visible,
  onClose,
  rideId,
  porterServiceId,
  carPoolId,
  passengerId,
  otherPartyName,
  userType,
  brandColor = DEFAULT_BRAND,
  enabled = true,
  onNewMessageWhenNotFocused,
}: ChatModalProps) {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const lastSendAt = useRef<number>(0);
  const SEND_DEBOUNCE_MS = 400;
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 12 : 8);

  const chatTarget = rideId
    ? rideId
    : porterServiceId
    ? { porterServiceId }
    : carPoolId && passengerId
    ? { carPoolId, passengerId }
    : null;

  const { messages, loading, sending, error, sendMessage, loadMore } = useChat(
    chatTarget,
    {
      enabled: !!chatTarget && enabled,
      isChatFocused: visible,
      onNewMessageWhenNotFocused,
    }
  );

  const handleSend = useCallback(() => {
    const t = input.trim();
    if (!t || sending) return;
    if (Date.now() - lastSendAt.current < SEND_DEBOUNCE_MS) return;
    lastSendAt.current = Date.now();
    sendMessage(t);
    setInput("");
  }, [input, sending, sendMessage]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isMe = item.senderType === userType;
      return (
        <View
          style={[
            styles.bubbleWrap,
            isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther,
          ]}
        >
          <View
            style={[
              styles.bubble,
              isMe
                ? [styles.bubbleMe, { backgroundColor: brandColor }]
                : styles.bubbleOther,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                isMe ? styles.bubbleTextMe : styles.bubbleTextOther,
              ]}
            >
              {item.content}
            </Text>
            <Text
              style={[
                styles.bubbleTime,
                isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther,
              ]}
            >
              {formatTime(item.sentAt)}
            </Text>
          </View>
        </View>
      );
    },
    [userType, brandColor]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[styles.safe, { backgroundColor: "#fff" }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboard}
        >
          {/* Header — brand color for ride chat */}
          <View style={[styles.header, { backgroundColor: brandColor }]}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Chat with {otherPartyName}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <View style={styles.messages}>
            {loading && messages.length === 0 ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={brandColor} />
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={48}
                  color="#9CA3AF"
                  style={{ marginBottom: 12 }}
                />
                <Text style={styles.emptyTitle}>No messages yet.</Text>
                <Text style={styles.emptySub}>
                  Say hi to get the conversation started.
                </Text>
              </View>
            ) : (
              <FlatList
                data={messages}
                renderItem={renderItem}
                keyExtractor={(m) => m.id}
                inverted
                onEndReached={() => loadMore()}
                onEndReachedThreshold={0.25}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={styles.listContent}
              />
            )}
          </View>

          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Input */}
          <View style={[styles.inputWrap, { paddingBottom: bottomInset }]}>
            <TextInput
              style={styles.input}
              placeholder="Message..."
              placeholderTextColor="#9CA3AF"
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              editable={!sending && enabled}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!input.trim() || sending}
              style={[styles.sendBtn, { backgroundColor: brandColor }]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboard: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  closeBtn: { padding: 8, marginRight: -8 },
  messages: {
    flex: 1,
    paddingHorizontal: 16,
    minHeight: 0,
    backgroundColor: "#F9FAFB",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#6B7280",
    marginTop: 8,
    fontSize: 14,
  },
  listContent: {
    paddingVertical: 16,
    paddingBottom: 16,
    flexGrow: 1,
  },
  bubbleWrap: { marginBottom: 12, maxWidth: "85%" },
  bubbleWrapMe: { alignSelf: "flex-end" },
  bubbleWrapOther: { alignSelf: "flex-start" },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: "#E5E7EB",
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: "#fff" },
  bubbleTextOther: { color: "#111827" },
  bubbleTime: { fontSize: 11, marginTop: 4 },
  bubbleTimeMe: { color: "rgba(255,255,255,0.85)" },
  bubbleTimeOther: { color: "#6B7280" },
  errorWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FEF2F2",
  },
  errorText: { fontSize: 14, color: "#DC2626" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
    color: "#111827",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 96,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: { textAlign: "center", color: "#6B7280", fontSize: 16 },
  emptySub: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 14,
    marginTop: 4,
  },
});
