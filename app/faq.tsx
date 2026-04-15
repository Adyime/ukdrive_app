import { useEffect, useMemo, useState } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, ScrollView, TouchableOpacity, Linking } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/context/auth-context";

type FAQItem = {
  question: string;
  answer: string;
};

type FAQSection = {
  title: string;
  items: FAQItem[];
};

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";
const CARD_BG = "#FFFFFF";
const SECTION_BG = "#FFFFFF";

const PASSENGER_FAQ_SECTIONS: FAQSection[] = [
  {
    title: "General",
    items: [
      {
        question: "How do I book a ride?",
        answer:
          "Open the UKDrive app, enter your pickup and destination locations, select your vehicle type, and confirm your booking.",
      },
      {
        question: "What payment methods are accepted?",
        answer:
          "We accept UPI, credit/debit cards, digital wallets, and cash payments.",
      },
      {
        question: "How do I cancel a ride?",
        answer:
          "You can cancel a ride from the booking confirmation screen or by calling the driver directly.",
      },
    ],
  },
  {
    title: "Safety",
    items: [
      {
        question: "How do I ensure my safety during rides?",
        answer:
          "All our drivers are verified and background checked. You can share your ride details with family and use the SOS feature if needed.",
      },
      {
        question: "What should I do in case of emergency?",
        answer:
          "Use the SOS button in the app or call our emergency helpline at 09520559469 immediately.",
      },
      {
        question: "Are the vehicles safe and maintained?",
        answer:
          "Yes, all vehicles undergo regular safety checks and maintenance to ensure your safety.",
      },
    ],
  },
  {
    title: "Pricing",
    items: [
      {
        question: "How is the fare calculated?",
        answer:
          "Fare is calculated based on distance, time, vehicle type, and current demand. You can see the estimated fare before booking.",
      },
      {
        question: "Are there any night charges?",
        answer: "Yes, there are double charges from 10 PM to 5 AM for night rides.",
      },
      {
        question: "Can I get a refund if I cancel?",
        answer:
          "Refund policy depends on the cancellation time. Free cancellation is available within 2 minutes of booking.",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        question: "How do I update my profile?",
        answer:
          "Go to Profile > Edit Profile to update your personal information and email. Your phone number can be updated by contacting our support team.",
      },
      {
        question: "How do I change my phone number?",
        answer:
          "Your phone number can be updated by contacting our support team or visiting the nearest UKDrive office.",
      },
      {
        question: "How do I delete my account?",
        answer:
          "Contact our support team to request account deletion. This process may take 24-48 hours.",
      },
    ],
  },
];

const DRIVER_FAQ_SECTIONS: FAQSection[] = [
  {
    title: "Account",
    items: [
      {
        question: "What documents are required for driver registration?",
        answer:
          "Valid driving licence, Vehicle RC (Registration Certificate), Vehicle insurance, Pollution certificate (PUC), Aadhar card or other ID proof, and passport-size photo.",
      },
      {
        question: "Can I drive part-time?",
        answer:
          "Yes! You can drive whenever you are free - full-time or part-time. Just switch your status to Online when you are ready to accept rides.",
      },
      {
        question: "How do I become a UKDrive driver?",
        answer:
          "You can register directly through the UKDrive Driver App. Upload your driving licence, vehicle documents, and ID proof. Once verified, you will receive a confirmation and can start accepting rides.",
      },
    ],
  },
  {
    title: "Safety",
    items: [
      {
        question: "How do I contact a passenger?",
        answer:
          "For privacy, UKDrive uses a call masking system - you can call or message passengers directly through the app without revealing your personal number.",
      },
      {
        question: "How can I report an issue or complaint?",
        answer:
          "Go to the Help section in your driver app -> select the trip -> choose the issue type (payment, safety, technical, etc.) -> submit your complaint. Our support team will assist you shortly.",
      },
    ],
  },
  {
    title: "Payment",
    items: [
      {
        question: "How can I increase my earnings?",
        answer:
          "Drive during peak hours, maintain good ratings, and accept rides promptly. Referral and bonus programs also help boost your income.",
      },
      {
        question: "How do I receive payments for my rides?",
        answer:
          "Payments are sent directly to your registered bank account. You can view your daily and weekly earnings in the app's Earnings section.",
      },
    ],
  },
  {
    title: "Booking",
    items: [
      {
        question: "What areas does UKDrive currently operate in?",
        answer:
          "We are currently active in Kotdwar and nearby Uttarakhand regions, with more cities launching soon.",
      },
      {
        question: "What if my app is not showing new rides?",
        answer:
          "Make sure your location is active and internet connection is stable. Try restarting the app. If the issue continues, contact Driver Support.",
      },
      {
        question: "What should I do if a rider cancels a trip?",
        answer:
          "If a rider cancels after the trip is confirmed, cancellation fees may apply according to UKDrive policy. You will see the update instantly in your app.",
      },
    ],
  },
];

export default function FAQScreen() {
  const { userType } = useAuth();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const sections = useMemo(
    () => (userType === "driver" ? DRIVER_FAQ_SECTIONS : PASSENGER_FAQ_SECTIONS),
    [userType]
  );

  const initialExpandedState = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    sections.forEach((section, sectionIndex) => {
      section.items.forEach((_, itemIndex) => {
        defaults[`${sectionIndex}-${itemIndex}`] = true;
      });
    });
    return defaults;
  }, [sections]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    initialExpandedState
  );

  useEffect(() => {
    setExpanded(initialExpandedState);
  }, [initialExpandedState]);

  const toggleItem = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }} edges={["top"]}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 16,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 24,
                color: "#111827",
                fontFamily: "Figtree_700Bold",
                lineHeight: 28,
              }}
            >
              FAQ
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: "#6B7280",
                fontFamily: "Figtree_500Medium",
              }}
            >
              Frequently asked questions
            </Text>
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#F3F4F6",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="help" size={21} color="#111827" />
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section, sectionIndex) => (
          <View
            key={section.title}
            style={{
              backgroundColor: SECTION_BG,
              borderRadius: 18,
              padding: 14,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "#F3F4F6",
            }}
          >
            <Text
              style={{
                fontSize: 18,
                color: brandColor,
                fontFamily: "Figtree_700Bold",
                lineHeight: 22,
                marginBottom: 12,
              }}
            >
              {section.title}
            </Text>

            {section.items.map((item, itemIndex) => {
              const key = `${sectionIndex}-${itemIndex}`;
              const isExpanded = expanded[key];
              return (
                <View
                  key={key}
                  style={{
                    backgroundColor: CARD_BG,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    marginBottom: 12,
                    overflow: "hidden",
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => toggleItem(key)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 17,
                        lineHeight: 26,
                        color: "#111827",
                        fontFamily: "Figtree_700Bold",
                        paddingRight: 10,
                      }}
                    >
                      {item.question}
                    </Text>
                    <Ionicons
                      name={isExpanded ? "caret-up" : "caret-down"}
                      size={18}
                      color={brandColor}
                    />
                  </TouchableOpacity>

                  {isExpanded ? (
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: "#F3F4F6",
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          lineHeight: 28,
                          color: "#4B5563",
                          fontFamily: "Figtree_400Regular",
                        }}
                      >
                        {item.answer}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}

        <View
          style={{
            backgroundColor: "#FFF4EA",
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "#F3E8D9",
            padding: 18,
            marginTop: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: brandColor,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
              }}
            >
              <Ionicons name="people-outline" size={20} color="#FFFFFF" />
            </View>
            <Text
              style={{
                fontSize: 18,
                color: "#111827",
                fontFamily: "Figtree_700Bold",
                lineHeight: 22,
              }}
            >
              Still have questions?
            </Text>
          </View>

          <Text
            style={{
              fontSize: 16,
              color: "#6B7280",
              fontFamily: "Figtree_500Medium",
              marginBottom: 14,
            }}
          >
            We are here to support you 24/7
          </Text>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => Linking.openURL("tel:09520559469")}
            style={{
              backgroundColor: BRAND_ORANGE,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 16,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Contact Support
            </Text>
          </TouchableOpacity>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: "#B45309",
                textDecorationLine: "underline",
                fontFamily: "Figtree_500Medium",
              }}
              onPress={() => Linking.openURL("tel:09520559469")}
            >
              09520559469
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "#B45309",
                textDecorationLine: "underline",
                fontFamily: "Figtree_500Medium",
              }}
              onPress={() => Linking.openURL("mailto:support@ukdrive.in")}
            >
              support@ukdrive.in
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
