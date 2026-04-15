import { View, ScrollView, TouchableOpacity } from "react-native";
import { LocalizedText as Text } from "@/components/localized-text";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <Text
      disableTranslation
      style={{
        fontSize: 14,
        fontFamily: "Figtree_600SemiBold",
        color: "#1F2937",
        marginBottom: 6,
      }}
    >
      {label}: {value}
    </Text>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      disableTranslation
      style={{
        fontSize: 20,
        fontFamily: "Figtree_700Bold",
        color: "#111827",
        marginTop: 24,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

function SubTitle({ children }: { children: string }) {
  return (
    <Text
      disableTranslation
      style={{
        fontSize: 16,
        fontFamily: "Figtree_700Bold",
        color: "#374151",
        marginTop: 12,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

function Paragraph({ children }: { children: string }) {
  return (
    <Text
      disableTranslation
      style={{
        fontSize: 15,
        fontFamily: "Figtree_400Regular",
        color: "#4B5563",
        lineHeight: 24,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

function Bullet({ children, indent = false }: { children: string; indent?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 6,
        marginLeft: indent ? 18 : 0,
      }}
    >
      <Text
        disableTranslation
        style={{
          fontSize: 15,
          fontFamily: "Figtree_600SemiBold",
          color: "#4B5563",
          marginRight: 8,
          lineHeight: 24,
        }}
      >
        {"\u2022"}
      </Text>
      <Text
        disableTranslation
        style={{
          flex: 1,
          fontSize: 15,
          fontFamily: "Figtree_400Regular",
          color: "#4B5563",
          lineHeight: 24,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export default function TermsConditionsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }} edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text disableTranslation style={{ fontSize: 22, fontFamily: "Figtree_700Bold", color: "#111827" }}>
          Terms & Conditions
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: "#F9FAFB",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            padding: 14,
            marginBottom: 18,
          }}
        >
          <MetaRow label="Effective Date" value="06/08/2025" />
          <MetaRow label="Last Updated" value="06/08/2025" />
        </View>

        <Paragraph>
          These Terms & Conditions (&quot;Terms&quot;) constitute a legally binding agreement between M & A Ride Sharing LLP, operating under the brand name UkDrive (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; &quot;us&quot;), and users of the UkDrive mobile application and related services (&quot;Users,&quot; &quot;you&quot;).
        </Paragraph>
        <Paragraph>
          By downloading, registering, or using UkDrive, you agree to these Terms. If you do not agree, please discontinue use of our services.
        </Paragraph>

        <SectionTitle>1. Definitions</SectionTitle>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            Passenger/Rider
          </Text>{" "}
          - A user booking a ride through the UkDrive platform.
        </Bullet>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            Driver/Partner
          </Text>{" "}
          - A registered individual authorized to provide transport services using UkDrive.
        </Bullet>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            Services
          </Text>{" "}
          - The UkDrive mobile application, website, ride-hailing, ride-sharing, and related services.
        </Bullet>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            Fare
          </Text>{" "}
          - The amount payable for a ride booked through UkDrive.
        </Bullet>

        <SectionTitle>2. Eligibility</SectionTitle>
        <Bullet>Passengers must be 18 years or older to create an account and use UkDrive.</Bullet>
        <Bullet>
          Drivers must hold a valid driving license, have a registered vehicle, and pass verification (Aadhaar, License, RC, PAN, etc.).
        </Bullet>
        <Bullet>
          By using UkDrive, you confirm that the information provided during registration is true, accurate, and complete.
        </Bullet>

        <SectionTitle>3. User Accounts</SectionTitle>
        <Bullet>Users must register with a valid mobile number and email ID.</Bullet>
        <Bullet>You are responsible for maintaining the confidentiality of login credentials.</Bullet>
        <Bullet>
          Any misuse of the account will be considered the responsibility of the registered user.
        </Bullet>

        <SectionTitle>4. Use of Services</SectionTitle>
        <Bullet>Passengers may book rides through UkDrive to be fulfilled by registered Drivers.</Bullet>
        <Bullet>Drivers are independent contractors and not employees of UkDrive.</Bullet>
        <Bullet>UkDrive only provides a technology platform to connect Passengers and Drivers.</Bullet>
        <Bullet>
          Users must not misuse the app for fraudulent activities, unlawful purposes, or harassment.
        </Bullet>

        <SectionTitle>5. Payments & Charges</SectionTitle>
        <Bullet>
          Ride fares are calculated based on distance, time, location, and applicable taxes.
        </Bullet>
        <Bullet>Passengers must pay fares via cash, UPI, debit/credit card, or wallet.</Bullet>
        <Bullet>
          Drivers will receive payments (after deductions, if any) directly into their registered bank accounts.
        </Bullet>
        <Bullet>
          UkDrive reserves the right to impose penalties, cancellation fees, or service charges.
        </Bullet>

        <SectionTitle>6. Cancellations & Refunds</SectionTitle>
        <Bullet>Passengers may cancel rides before driver confirmation without penalty.</Bullet>
        <Bullet>Cancellations after confirmation may attract a cancellation fee.</Bullet>
        <Bullet>
          Refunds (if applicable) will be processed to the original payment method within 7 working days.
        </Bullet>

        <SectionTitle>7. User Obligations</SectionTitle>
        <SubTitle>Passengers:</SubTitle>
        <Bullet>Ensure accurate pickup and drop-off details.</Bullet>
        <Bullet>Maintain respectful behavior towards Drivers.</Bullet>
        <Bullet>Avoid carrying prohibited, illegal, or hazardous goods.</Bullet>

        <SubTitle>Drivers:</SubTitle>
        <Bullet>Maintain valid documents (License, RC, Insurance, Permit).</Bullet>
        <Bullet>Keep the vehicle in safe and roadworthy condition.</Bullet>
        <Bullet>Not refuse rides without just cause.</Bullet>
        <Bullet>Follow all applicable traffic laws.</Bullet>

        <SectionTitle>8. Safety</SectionTitle>
        <Bullet>UkDrive provides real-time GPS tracking for safety.</Bullet>
        <Bullet>Passengers and Drivers may use in-app SOS/emergency features.</Bullet>
        <Bullet>
          UkDrive is not liable for incidents beyond its control, including accidents, disputes, or third-party misconduct.
        </Bullet>

        <SectionTitle>9. Privacy</SectionTitle>
        <Paragraph>
          All user information is collected, processed, and stored in accordance with the UkDrive Privacy Policy, Driver Addendum, and Passenger Addendum.
        </Paragraph>

        <SectionTitle>10. Limitation of Liability</SectionTitle>
        <Bullet>UkDrive acts only as a technology platform.</Bullet>
        <Bullet>The Company is not responsible for:</Bullet>
        <Bullet indent>Driver actions, behavior, or misconduct.</Bullet>
        <Bullet indent>Passenger misconduct.</Bullet>
        <Bullet indent>Accidents, delays, theft, or damage during rides.</Bullet>
        <Bullet>Liability of UkDrive is limited to the extent of service fees collected.</Bullet>

        <SectionTitle>11. Suspension & Termination</SectionTitle>
        <Paragraph>UkDrive may suspend or terminate user accounts for:</Paragraph>
        <Bullet>Providing false information.</Bullet>
        <Bullet>Misuse of the platform.</Bullet>
        <Bullet>Non-compliance with these Terms.</Bullet>
        <Bullet>Legal violations or fraudulent activity.</Bullet>

        <SectionTitle>12. Governing Law & Jurisdiction</SectionTitle>
        <Paragraph>These Terms shall be governed by the laws of India.</Paragraph>
        <Paragraph>
          Any disputes shall be subject to the jurisdiction of courts located in Kotdwara, Uttarakhand, India.
        </Paragraph>

        <SectionTitle>13. Changes to Terms</SectionTitle>
        <Paragraph>
          UkDrive reserves the right to update or modify these Terms. Continued use of the platform after such updates constitutes acceptance of the revised Terms.
        </Paragraph>

        <SectionTitle>14. Contact Information</SectionTitle>
        <Paragraph>For queries related to these Terms & Conditions, please contact:</Paragraph>
        <Paragraph>
          <Text disableTranslation style={{ fontFamily: "Figtree_700Bold" }}>
            M & A Ride Sharing LLP
          </Text>
        </Paragraph>
        <Paragraph>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            Registered Office:
          </Text>{" "}
          Durgapuri, Kotdwara, Uttarakhand, India
        </Paragraph>
        <Paragraph>{"\uD83D\uDCE7 support@ukdrive.in | admin@ukdrive.net"}</Paragraph>
        <Paragraph>{"\uD83D\uDCDE Helpline: +91-9520559469"}</Paragraph>

        <View
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: "#E5E7EB",
          }}
        >
          <Paragraph>{"\u00A9 2025 UkDrive. All rights reserved."}</Paragraph>
          <Paragraph>
            This document is legally binding and effective as of the date mentioned above.
          </Paragraph>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
