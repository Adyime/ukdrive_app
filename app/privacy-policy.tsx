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

function Bullet({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
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

export default function PrivacyPolicyScreen() {
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
          Privacy Policy
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
          <MetaRow label="Company" value="M & A Ride Sharing LLP" />
        </View>

        <Paragraph>
          This Privacy Policy (&quot;Policy&quot;) explains how M & A Ride Sharing LLP, operating under the brand name UkDrive (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; &quot;us&quot;), collects, uses, stores, and discloses information of users, including passengers, drivers, and delivery partners (collectively &quot;Users&quot;).
        </Paragraph>
        <Paragraph>
          By downloading, registering, or using the UkDrive mobile application and related services (&quot;Services&quot;), you consent to the practices described in this Policy.
        </Paragraph>

        <SectionTitle>1. Information We Collect</SectionTitle>
        <SubTitle>a. Passenger/User Information</SubTitle>
        <Bullet>Full Name</Bullet>
        <Bullet>Mobile Number</Bullet>
        <Bullet>Email Address</Bullet>
        <Bullet>Profile Picture (optional)</Bullet>
        <Bullet>Payment Information (UPI, debit/credit card, wallet - processed via third-party providers)</Bullet>
        <Bullet>Location Data (real-time GPS for pickup/drop-off and navigation)</Bullet>
        <Bullet>Ride history (pickup, drop-off, fare, time, distance)</Bullet>

        <SubTitle>b. Driver/Partner Information</SubTitle>
        <Paragraph>
          To comply with Indian transport and safety regulations, UkDrive collects and verifies:
        </Paragraph>
        <Bullet>Full Name (as per government records)</Bullet>
        <Bullet>Date of Birth</Bullet>
        <Bullet>Mobile Number & Email Address</Bullet>
        <Bullet>Aadhaar Number (for KYC and ID verification)</Bullet>
        <Bullet>Driving License Number & Validity</Bullet>
        <Bullet>Vehicle Registration Certificate (RC) Number</Bullet>
        <Bullet>Vehicle Details (make, model, year, registration state, permit details)</Bullet>
        <Bullet>PAN Number (for taxation purposes)</Bullet>
        <Bullet>Bank Account Details (for payouts)</Bullet>
        <Bullet>Police Verification/Background Check Report (if applicable)</Bullet>
        <Bullet>Profile Photo</Bullet>

        <SubTitle>c. Device & Technical Information</SubTitle>
        <Bullet>Device model, operating system, unique device identifier</Bullet>
        <Bullet>IP Address and network information</Bullet>
        <Bullet>App usage logs, crash reports, and analytics</Bullet>

        <SectionTitle>2. Purpose of Collection and Use</SectionTitle>
        <Paragraph>We use the information for:</Paragraph>
        <Bullet>Facilitating ride bookings, navigation, and ride-sharing services.</Bullet>
        <Bullet>Verifying driver identity and compliance with transport regulations.</Bullet>
        <Bullet>Processing payments and issuing receipts.</Bullet>
        <Bullet>Ensuring passenger and driver safety.</Bullet>
        <Bullet>Customer support and dispute resolution.</Bullet>
        <Bullet>Legal and tax compliance.</Bullet>
        <Bullet>Improving app performance, user experience, and security.</Bullet>

        <SectionTitle>3. Sharing & Disclosure</SectionTitle>
        <Paragraph>We do not sell or rent your personal information. Information may be disclosed:</Paragraph>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            Between Passengers and Drivers:
          </Text>{" "}
          Limited details (name, photo, contact number, pickup/drop-off location) are shared to complete the ride.
        </Bullet>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            With Service Providers:
          </Text>{" "}
          For payment processing, background verification, cloud hosting, and analytics.
        </Bullet>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            With Authorities:
          </Text>{" "}
          Aadhaar, license, RC, or other details may be disclosed to law enforcement, transport departments, or government agencies if legally required.
        </Bullet>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            For Business Transfers:
          </Text>{" "}
          In case of merger, acquisition, or corporate restructuring.
        </Bullet>

        <SectionTitle>4. Data Security</SectionTitle>
        <Paragraph>
          We implement industry-standard safeguards such as encryption, firewalls, and restricted access controls to protect personal information. However, no method of storage or transmission is completely secure, and we cannot guarantee absolute security.
        </Paragraph>

        <SectionTitle>5. Data Retention</SectionTitle>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            Passenger information:
          </Text>{" "}
          Retained as long as the account is active.
        </Bullet>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            Driver information (Aadhaar, License, RC, PAN, etc.):
          </Text>{" "}
          Retained during the driver&apos;s association with UkDrive and as mandated by law.
        </Bullet>
        <Bullet>
          <Text disableTranslation style={{ fontFamily: "Figtree_600SemiBold" }}>
            Financial records:
          </Text>{" "}
          Maintained as per statutory requirements under Indian tax laws.
        </Bullet>

        <SectionTitle>6. User Rights</SectionTitle>
        <Paragraph>Users have the right to:</Paragraph>
        <Bullet>Access, review, and update personal information.</Bullet>
        <Bullet>Request deletion of data (subject to regulatory requirements).</Bullet>
        <Bullet>Withdraw consent for processing (where applicable).</Bullet>
        <Bullet>Request a copy of stored data.</Bullet>
        <Paragraph>Such requests can be made via:</Paragraph>
        <Paragraph>{"\uD83D\uDCE7 support@ukdrive.in"}</Paragraph>
        <Paragraph>{"\uD83D\uDCE7 admin@ukdrive.net"}</Paragraph>

        <SectionTitle>7. Children&apos;s Privacy</SectionTitle>
        <Paragraph>
          UkDrive services are intended for adults aged 18 years and above. We do not knowingly collect personal information from minors.
        </Paragraph>

        <SectionTitle>8. Legal Compliance</SectionTitle>
        <Paragraph>
          This Privacy Policy is governed by Indian law, including but not limited to:
        </Paragraph>
        <Bullet>
          Information Technology Act, 2000 and IT (Reasonable Security Practices and Procedures and Sensitive Personal Data) Rules, 2011.
        </Bullet>
        <Bullet>Motor Vehicles Act, 1988 and relevant State Transport Rules.</Bullet>
        <Bullet>Aadhaar Act, 2016 (for identity verification).</Bullet>
        <Bullet>RBI Guidelines on Digital Payments.</Bullet>

        <SectionTitle>9. Changes to Policy</SectionTitle>
        <Paragraph>
          We may update this Privacy Policy periodically. Any material changes will be notified through the UkDrive application or by registered email. Continued use of our Services after updates implies acceptance of the revised Policy.
        </Paragraph>

        <SectionTitle>10. Contact Us</SectionTitle>
        <Paragraph>
          For questions, concerns, or complaints regarding this Privacy Policy, please contact:
        </Paragraph>
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
