export type AppLanguage = "en" | "hi";

export type TranslationParams = Record<string, string | number | null | undefined>;

const HI_EXACT_TRANSLATIONS: Record<string, string> = {
  "English": "अंग्रेज़ी",
  "Hindi": "हिंदी",
  "Language": "भाषा",
  "Home": "होम",
  "My Rides": "मेरी राइड्स",
  "Activity": "गतिविधि",
  "Profile": "प्रोफाइल",
  "Help": "मदद",
  "Wallet": "वॉलेट",
  "History": "इतिहास",
  "Referral": "रेफरल",
  "Manage Pool": "पूल प्रबंधन",
  "Settings": "सेटिंग्स",
  "Payment Methods": "भुगतान के तरीके",
  "About UK Drive": "यूके ड्राइव के बारे में",
  "Sign Out": "साइन आउट",
  "Logging out…": "लॉग आउट हो रहा है…",
  "Submitting…": "सबमिट हो रहा है…",
  "Logout": "लॉगआउट",
  "Are you sure you want to logout?": "क्या आप वाकई लॉगआउट करना चाहते हैं?",
  "Delete Account": "खाता हटाएं",
  "Are you sure you want to delete your account? This action will submit a deletion request to our team.":
    "क्या आप वाकई अपना खाता हटाना चाहते हैं? यह कार्रवाई हमारी टीम को डिलीशन रिक्वेस्ट भेजेगी।",
  "Confirm Deletion": "हटाने की पुष्टि करें",
  "This cannot be undone. Your account will be deactivated after admin review.":
    "इसे वापस नहीं किया जा सकता। एडमिन समीक्षा के बाद आपका खाता निष्क्रिय कर दिया जाएगा।",
  "Delete My Account": "मेरा खाता हटाएं",
  "Cancel": "रद्द करें",
  "Continue": "जारी रखें",
  "Failed to logout. Please try again.": "लॉगआउट नहीं हो सका। कृपया फिर से प्रयास करें।",
  "Failed to submit deletion request. Please try again.":
    "डिलीशन अनुरोध सबमिट नहीं हो सका। कृपया फिर से प्रयास करें।",
  "Your account deletion request has been submitted.":
    "आपका खाता हटाने का अनुरोध भेज दिया गया है।",
  "Profile Photo": "प्रोफाइल फोटो",
  "Choose an action": "एक कार्रवाई चुनें",
  "Upload Photo": "फोटो अपलोड करें",
  "Remove": "हटाएं",
  "Remove Photo": "फोटो हटाएं",
  "No profile photo to remove.": "हटाने के लिए कोई प्रोफाइल फोटो नहीं है।",
  "Gallery permission is needed to upload profile photo.":
    "प्रोफाइल फोटो अपलोड करने के लिए गैलरी अनुमति आवश्यक है।",
  "Profile photo updated.": "प्रोफाइल फोटो अपडेट हो गई।",
  "Failed to update profile photo. Please try again.":
    "प्रोफाइल फोटो अपडेट नहीं हो सकी। कृपया फिर से प्रयास करें।",
  "Profile photo removed.": "प्रोफाइल फोटो हटा दी गई।",
  "Failed to remove profile photo. Please try again.":
    "प्रोफाइल फोटो हटाई नहीं जा सकी। कृपया फिर से प्रयास करें।",
  "Language & Region": "भाषा और क्षेत्र",
  "Set your preferred language": "अपनी पसंदीदा भाषा चुनें",
  "Profile Information": "प्रोफाइल जानकारी",
  "Phone Number": "फोन नंबर",
  "Not available": "उपलब्ध नहीं",
  "Email": "ईमेल",
  "Full Name": "पूरा नाम",
  "About": "बारे में",
  "Version": "संस्करण",
  "App Info": "ऐप जानकारी",
  "App Name": "ऐप का नाम",
  "About the App": "ऐप के बारे में",
  "Legal": "कानूनी",
  "Terms of Service": "सेवा की शर्तें",
  "Privacy Policy": "गोपनीयता नीति",
  "Ride": "राइड",
  "Rides": "राइड्स",
  "Ride Share": "राइड शेयर",
  "Parcel": "पार्सल",
  "Delivery": "डिलीवरी",
  "Notifications": "सूचनाएं",
  "No messages yet.": "अभी तक कोई संदेश नहीं है।",
  "No rides yet": "अभी तक कोई राइड नहीं है",
  "No trips yet": "अभी तक कोई यात्रा नहीं है",
  "No transactions yet": "अभी तक कोई लेन-देन नहीं है",
  "No referral data": "कोई रेफरल डेटा नहीं",
  "No rewards yet": "अभी तक कोई रिवॉर्ड नहीं",
  "No withdrawal requests yet": "अभी तक कोई निकासी अनुरोध नहीं",
  "No Saved Addresses": "कोई सेव पता नहीं",
  "Saved Addresses": "सेव पते",
  "Top Up Wallet": "वॉलेट टॉप अप करें",
  "Top Up": "टॉप अप",
  "Withdraw": "निकालें",
  "Withdraw to Bank": "बैंक में निकालें",
  "Withdrawal History": "निकासी इतिहास",
  "Withdrawal Method": "निकासी तरीका",
  "Withdrawal Amount": "निकासी राशि",
  "Request Withdrawal": "निकासी अनुरोध करें",
  "Request Submitted!": "अनुरोध सबमिट हो गया!",
  "Current Balance": "वर्तमान बैलेंस",
  "Available Balance": "उपलब्ध बैलेंस",
  "Quick Actions": "त्वरित क्रियाएं",
  "Available Payment Methods": "उपलब्ध भुगतान तरीके",
  "Online Payment": "ऑनलाइन भुगतान",
  "Cash": "नकद",
  "Pay cash directly to driver": "ड्राइवर को सीधे नकद भुगतान करें",
  "Pay instantly from your wallet balance": "अपने वॉलेट बैलेंस से तुरंत भुगतान करें",
  "UPI, Debit/Credit Cards, Net Banking": "UPI, डेबिट/क्रेडिट कार्ड, नेट बैंकिंग",
  "Driver Wallet Info": "ड्राइवर वॉलेट जानकारी",
  "Payment Status": "भुगतान स्थिति",
  "Payment Summary": "भुगतान सारांश",
  "Payment Method": "भुगतान तरीका",
  "Payment Successful!": "भुगतान सफल!",
  "Payment Failed": "भुगतान विफल",
  "Payment Pending": "भुगतान लंबित",
  "Payment pending": "भुगतान लंबित",
  "Payment Required": "भुगतान आवश्यक",
  "Waiting for Payment": "भुगतान की प्रतीक्षा",
  "Payment is being processed...": "भुगतान प्रोसेस हो रहा है...",
  "Processing online payment...": "ऑनलाइन भुगतान प्रोसेस हो रहा है...",
  "Processing wallet payment...": "वॉलेट भुगतान प्रोसेस हो रहा है...",
  "Checking payment status...": "भुगतान स्थिति जांची जा रही है...",
  "Retry Payment Processing": "भुगतान प्रोसेसिंग पुनः प्रयास करें",
  "Refresh payment": "भुगतान रीफ्रेश करें",
  "Refresh Payment Status": "भुगतान स्थिति रीफ्रेश करें",
  "Payment processing retried successfully": "भुगतान प्रोसेसिंग सफलतापूर्वक पुनः प्रयास की गई",
  "Payment status has been refreshed.": "भुगतान स्थिति रीफ्रेश की गई है।",
  "Online payment verified successfully.": "ऑनलाइन भुगतान सफलतापूर्वक सत्यापित हुआ।",
  "Cash payment confirmed!": "नकद भुगतान की पुष्टि हो गई!",
  "Cash payment confirmed successfully": "नकद भुगतान सफलतापूर्वक पुष्टि हुआ",
  "Ride cancelled.": "राइड रद्द कर दी गई।",
  "Service cancelled.": "सेवा रद्द कर दी गई।",
  "Ride share cancelled.": "राइड शेयर रद्द कर दिया गया।",
  "You have left the ride share.": "आप राइड शेयर छोड़ चुके हैं।",
  "Join request accepted!": "जॉइन अनुरोध स्वीकार किया गया!",
  "Join request rejected.": "जॉइन अनुरोध अस्वीकार किया गया।",
  "Passenger dropped off!": "यात्री को उतार दिया गया!",
  "Passenger dropped off.": "यात्री को उतार दिया गया।",
  "Passenger picked up successfully.": "यात्री को सफलतापूर्वक पिकअप किया गया।",
  "Ride share started!": "राइड शेयर शुरू हो गया!",
  "Ride share completed!": "राइड शेयर पूरा हो गया!",
  "Ride share details": "राइड शेयर विवरण",
  "Ride Details": "राइड विवरण",
  "Parcel Details": "पार्सल विवरण",
  "Parcel Service Details": "पार्सल सेवा विवरण",
  "Finding your ride...": "आपकी राइड खोजी जा रही है...",
  "Finding Your Driver": "आपका ड्राइवर खोजा जा रहा है",
  "Connecting...": "कनेक्ट हो रहा है...",
  "Connecting you to nearby drivers": "आपको नज़दीकी ड्राइवरों से जोड़ा जा रहा है",
  "Incoming ride request": "आने वाला राइड अनुरोध",
  "Incoming parcel request": "आने वाला पार्सल अनुरोध",
  "Request Ride": "राइड अनुरोध करें",
  "Request Parcel Service": "पार्सल सेवा अनुरोध करें",
  "Request will be sent directly to the driver (30s to accept)":
    "अनुरोध सीधे ड्राइवर को भेजा जाएगा (स्वीकार करने के लिए 30 सेकंड)।",
  "Parcel service request created! Finding a driver...":
    "पार्सल सेवा अनुरोध बन गया! ड्राइवर खोजा जा रहा है...",
  "Your join request has been sent to the driver.":
    "आपका जॉइन अनुरोध ड्राइवर को भेज दिया गया है।",
  "No drivers available": "कोई ड्राइवर उपलब्ध नहीं",
  "No ride options in this area": "इस क्षेत्र में कोई राइड विकल्प उपलब्ध नहीं",
  "No ride requests nearby. Pull down to refresh.":
    "पास में कोई राइड अनुरोध नहीं। रीफ्रेश करने के लिए नीचे खींचें।",
  "No Parcel requests nearby. Pull down to refresh.":
    "पास में कोई पार्सल अनुरोध नहीं। रीफ्रेश करने के लिए नीचे खींचें।",
  "No Active Ride": "कोई सक्रिय राइड नहीं",
  "No Active Service": "कोई सक्रिय सेवा नहीं",
  "No Active Ride Share": "कोई सक्रिय राइड शेयर नहीं",
  "No Parcel Services": "कोई पार्सल सेवा नहीं",
  "No Ride Shares Found": "कोई राइड शेयर नहीं मिला",
  "Search for pickup location": "पिकअप लोकेशन खोजें",
  "Search for destination": "डेस्टिनेशन खोजें",
  "Search for delivery location": "डिलीवरी लोकेशन खोजें",
  "Search for a location": "एक लोकेशन खोजें",
  "Search country or code": "देश या कोड खोजें",
  "Use Current Location": "वर्तमान लोकेशन उपयोग करें",
  "Set Location on Map": "मैप पर लोकेशन सेट करें",
  "Set location on map": "मैप पर लोकेशन सेट करें",
  "Move map and place the pointer": "मैप को घुमाएं और पॉइंटर रखें",
  "Open Settings": "सेटिंग्स खोलें",
  "Loading...": "लोड हो रहा है...",
  "Loading…": "लोड हो रहा है…",
  "Loading activity…": "गतिविधि लोड हो रही है…",
  "Loading history…": "इतिहास लोड हो रहा है…",
  "Loading your rides…": "आपकी राइड्स लोड हो रही हैं…",
  "Loading referral info…": "रेफरल जानकारी लोड हो रही है…",
  "Loading address...": "पता लोड हो रहा है...",
  "Loading drivers...": "ड्राइवर लोड हो रहे हैं...",
  "Loading route...": "रूट लोड हो रहा है...",
  "Loading route": "रूट लोड हो रहा है",
  "Loading map...": "मैप लोड हो रहा है...",
  "Loading documents...": "दस्तावेज़ लोड हो रहे हैं...",
  "Loading options...": "विकल्प लोड हो रहे हैं...",
  "Loading payment...": "भुगतान जानकारी लोड हो रही है...",
  "Loading payment details...": "भुगतान विवरण लोड हो रहा है...",
  "Loading payment info...": "भुगतान जानकारी लोड हो रही है...",
  "Loading payment status...": "भुगतान स्थिति लोड हो रही है...",
  "Loading ride...": "राइड लोड हो रही है...",
  "Loading ride details...": "राइड विवरण लोड हो रहा है...",
  "Loading ride share...": "राइड शेयर लोड हो रहा है...",
  "Loading ride share details...": "राइड शेयर विवरण लोड हो रहा है...",
  "Loading service...": "सेवा लोड हो रही है...",
  "Loading request...": "अनुरोध लोड हो रहा है...",
  "Loading reward offers...": "रिवॉर्ड ऑफर लोड हो रहे हैं...",
  "Loading vehicle details...": "वाहन विवरण लोड हो रहा है...",
  "Loading location...": "लोकेशन लोड हो रही है...",
  "Failed to fetch ride details.": "राइड विवरण प्राप्त नहीं हो सका।",
  "Failed to fetch Parcel service details.": "पार्सल सेवा विवरण प्राप्त नहीं हो सका।",
  "Failed to fetch ride share details.": "राइड शेयर विवरण प्राप्त नहीं हो सका।",
  "Failed to load ride details": "राइड विवरण लोड नहीं हो सका",
  "Failed to load vehicle options.": "वाहन विकल्प लोड नहीं हो सके।",
  "Failed to update availability. Please try again.":
    "उपलब्धता अपडेट नहीं हो सकी। कृपया फिर से प्रयास करें।",
  "Failed to decline.": "अस्वीकार नहीं किया जा सका।",
  "Failed to submit rating. Please try again.":
    "रेटिंग सबमिट नहीं हो सकी। कृपया फिर से प्रयास करें।",
  "Failed to copy code to clipboard": "कोड क्लिपबोर्ड में कॉपी नहीं हो सका",
  "Failed to download receipt": "रसीद डाउनलोड नहीं हो सकी",
  "Failed to download invoice": "इनवॉइस डाउनलोड नहीं हो सकी",
  "Failed to generate payment QR.": "भुगतान QR जनरेट नहीं हो सका।",
  "Failed to retry payment. Please try again or contact support.":
    "भुगतान पुनः प्रयास नहीं हो सका। कृपया फिर से प्रयास करें या सपोर्ट से संपर्क करें।",
  "Failed to pick image. Please try again.": "छवि चुनना असफल रहा। कृपया फिर से प्रयास करें।",
  "Failed to take photo. Please try again.": "फोटो लेना असफल रहा। कृपया फिर से प्रयास करें।",
  "Camera permission is needed to take photos.":
    "फोटो लेने के लिए कैमरा अनुमति आवश्यक है।",
  "Camera roll permission is needed to upload images.":
    "छवियां अपलोड करने के लिए गैलरी अनुमति आवश्यक है।",
  "Something went wrong": "कुछ गलत हो गया",
  "Something went wrong.": "कुछ गलत हो गया।",
  "Something went wrong. Please try again.": "कुछ गलत हो गया। कृपया फिर से प्रयास करें।",
  "Network error. Please retry.": "नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।",
  "Network error. Please try again.": "नेटवर्क त्रुटि। कृपया फिर से प्रयास करें।",
  "Error": "त्रुटि",
  "OK": "ठीक है",
  "Done": "पूर्ण",
  "Back": "वापस",
  "Go back": "वापस जाएं",
  "Go Back": "वापस जाएं",
  "Go Home": "होम जाएं",
  "Next": "अगला",
  "Previous": "पिछला",
  "Edit": "संपादित करें",
  "Save": "सहेजें",
  "Retry": "पुनः प्रयास",
  "Try Again": "फिर से प्रयास करें",
  "Copy": "कॉपी",
  "Share": "शेयर",
  "Take Photo": "फोटो लें",
  "Choose from Gallery": "गैलरी से चुनें",
  "Please enter a 4-digit verification code":
    "कृपया 4-अंकों का सत्यापन कोड दर्ज करें।",
  "Enter verification code": "सत्यापन कोड दर्ज करें",
  "Enter Verification Code": "सत्यापन कोड दर्ज करें",
  "Verifying OTP...": "OTP सत्यापित किया जा रहा है...",
  "New code sent": "नया कोड भेजा गया",
  "This code is no longer valid": "यह कोड अब मान्य नहीं है",
  "Continue with Phone Number": "फोन नंबर के साथ जारी रखें",
  "Enter your phone number": "अपना फोन नंबर दर्ज करें",
  "Enter your phone number for verification": "सत्यापन के लिए अपना फोन नंबर दर्ज करें",
  "Phone number is required": "फोन नंबर आवश्यक है",
  "Please select a country": "कृपया एक देश चुनें",
  "Please enter a valid {{digits}}-digit phone number":
    "कृपया वैध {{digits}} अंकों का फोन नंबर दर्ज करें",
  "Enter {{digits}} digit phone number": "{{digits}} अंकों का फोन नंबर दर्ज करें",
  "Change Phone Number": "फोन नंबर बदलें",
  "Send Otp": "OTP भेजें",
  "Send OTP": "OTP भेजें",
  "Failed to send OTP. Please try again.": "OTP भेजने में विफल। कृपया फिर से प्रयास करें।",
  "Invalid OTP. Please try again.": "अमान्य OTP। कृपया फिर से प्रयास करें।",
  "An unexpected error occurred. Please check your connection and try again.":
    "एक अनपेक्षित त्रुटि हुई। कृपया अपना कनेक्शन जांचें और फिर से प्रयास करें।",
  "An unexpected error occurred. Please try again.":
    "एक अनपेक्षित त्रुटि हुई। कृपया फिर से प्रयास करें।",
  "We've sent a 6-digit code to": "हमने 6-अंकों का कोड भेजा है",
  "Sending...": "भेजा जा रहा है...",
  "Resend OTP": "OTP दोबारा भेजें",
  "Resend in {{seconds}}s": "{{seconds}} सेकंड में दोबारा भेजें",
  "Complete Registration": "पंजीकरण पूरा करें",
  "Registering": "पंजीकरण हो रहा है",
  "Registering...": "पंजीकरण हो रहा है...",
  "Driver": "ड्राइवर",
  "Passenger": "यात्री",
  "Driver Account": "ड्राइवर खाता",
  "Passenger Account": "यात्री खाता",
  "Passenger Login": "यात्री लॉगिन",
  "Driver Documents": "ड्राइवर दस्तावेज़",
  "Documents": "दस्तावेज़",
  "Re-upload Documents": "दस्तावेज़ पुनः अपलोड करें",
  "Document resubmitted for approval.": "दस्तावेज़ पुनः समीक्षा हेतु भेज दिया गया।",
  "Vehicle Information": "वाहन जानकारी",
  "Vehicle Type": "वाहन प्रकार",
  "Vehicle type": "वाहन प्रकार",
  "Vehicle Registration": "वाहन पंजीकरण",
  "Vehicle Owner Name": "वाहन मालिक का नाम",
  "License Number": "लाइसेंस नंबर",
  "License number": "लाइसेंस नंबर",
  "License Front Image": "लाइसेंस फ्रंट इमेज",
  "License Back Image": "लाइसेंस बैक इमेज",
  "Aadhaar Front Image": "आधार फ्रंट इमेज",
  "Aadhaar Back Image": "आधार बैक इमेज",
  "RC Front Image": "RC फ्रंट इमेज",
  "RC Back Image": "RC बैक इमेज",
  "Driver profile is not available.": "ड्राइवर प्रोफाइल उपलब्ध नहीं है।",
  "No changes selected.": "कोई बदलाव चयनित नहीं है।",
  "Please enter the new vehicle registration number.":
    "कृपया नया वाहन पंजीकरण नंबर दर्ज करें।",
  "Please enter a valid vehicle registration number.":
    "कृपया वैध वाहन पंजीकरण नंबर दर्ज करें।",
  "Failed to update vehicle.": "वाहन अपडेट नहीं हो सका।",
  "View/change vehicle, subcategory and purpose":
    "वाहन, उप-श्रेणी और उद्देश्य देखें/बदलें",
  "Rewards History": "रिवॉर्ड इतिहास",
  "Track mission rewards and earnings": "मिशन रिवॉर्ड और कमाई ट्रैक करें",
  "Rewards": "रिवॉर्ड्स",
  "Reward": "रिवॉर्ड",
  "Referrals": "रेफरल्स",
  "Refer & Earn": "रेफर करें और कमाएं",
  "Referral code copied": "रेफरल कोड कॉपी किया गया",
  "Referral code copied to clipboard.": "रेफरल कोड क्लिपबोर्ड पर कॉपी किया गया।",
  "Referral redeemed successfully!": "रेफरल सफलतापूर्वक रिडीम हुआ!",
  "Referral already redeemed": "रेफरल पहले से रिडीम है",
  "Referral applied successfully!": "रेफरल सफलतापूर्वक लागू हुआ!",
  "Invalid ride. Please try again.": "अमान्य राइड। कृपया फिर से प्रयास करें।",
  "Please select a rating before submitting.":
    "सबमिट करने से पहले कृपया एक रेटिंग चुनें।",
  "Thank you! Your rating has been submitted.":
    "धन्यवाद! आपकी रेटिंग सबमिट हो गई है।",
  "Submit Rating": "रेटिंग सबमिट करें",
  "Rate your experience": "अपने अनुभव को रेट करें",
  "Tell us about your ride...": "अपनी राइड के बारे में बताएं...",
  "No, thanks": "नहीं, धन्यवाद",
  "Skip for Now": "अभी छोड़ें",
  "We are here to support you 24/7": "हम 24/7 आपकी सहायता के लिए उपलब्ध हैं",
  "How can we help?": "हम आपकी कैसे मदद कर सकते हैं?",
  "Contact Support": "सपोर्ट से संपर्क करें",
  "Help & Support": "मदद और सपोर्ट",
  "Help & support": "मदद और सपोर्ट",
  "Frequently asked questions": "अक्सर पूछे जाने वाले प्रश्न",
  "General": "सामान्य",
  "Safety": "सुरक्षा",
  "Pricing": "मूल्य निर्धारण",
  "Account": "खाता",
  "Booking": "बुकिंग",
  "Payment": "भुगतान",
  "Help & Safety": "मदद और सुरक्षा",
  "Find Lost Item": "खोई हुई वस्तु खोजें",
  "Report safety issue": "सुरक्षा समस्या रिपोर्ट करें",
  "Customer Support": "ग्राहक सहायता",
  "Contact Driver": "ड्राइवर से संपर्क करें",
  "FAQ": "FAQ",
  "Still have questions?": "क्या अभी भी प्रश्न हैं?",
  "Updates and alerts will appear here as they happen.":
    "अपडेट और अलर्ट होते ही यहां दिखाई देंगे।",
  "Rides, Parcel, and Ride Share requests": "राइड, पार्सल और राइड शेयर अनुरोध",
  "Your completed rides, parcel services, and ride shares will appear here.":
    "आपकी पूरी हुई राइड्स, पार्सल सेवाएं और राइड शेयर यहां दिखाई देंगे।",
  "Recent": "हाल का",
  "Suggestions": "सुझाव",
  "Pinned Location": "पिन किया हुआ स्थान",
  "and": "और",
  "This number will be used to verify your identity and for communication purposes.": "\u092f\u0939 \u0928\u0902\u092c\u0930 \u0906\u092a\u0915\u0940 \u092a\u0939\u091a\u093e\u0928 \u0915\u0947 \u0938\u0924\u094d\u092f\u093e\u092a\u0928 \u0914\u0930 \u0938\u0902\u091a\u093e\u0930 \u0915\u0947 \u0932\u093f\u090f \u0909\u092a\u092f\u094b\u0917 \u0915\u093f\u092f\u093e \u091c\u093e\u090f\u0917\u093e\u0964",
  "By continuing, you agree that you have read and accept our": "\u091c\u093e\u0930\u0940 \u0930\u0916\u0924\u0947 \u0939\u0940 \u0906\u092a \u092f\u0939 \u0938\u094d\u0935\u0940\u0915\u093e\u0930 \u0915\u0930\u0924\u0947 \u0939\u0948\u0902 \u0915\u093f \u0906\u092a\u0928\u0947 \u0939\u092e\u093e\u0930\u0947",
  "By sign in, you agree with": "\u0938\u093e\u0907\u0928 \u0907\u0928 \u0915\u0930\u0924\u0947 \u0939\u0940 \u0906\u092a \u0938\u0939\u092e\u0924 \u0939\u0948\u0902",
  "Terms & Conditions": "\u0928\u093f\u092f\u092e \u0914\u0930 \u0936\u0930\u094d\u0924\u0947\u0902",
  "Are you a driver?": "\u0915\u094d\u092f\u093e \u0906\u092a \u0921\u094d\u0930\u093e\u0907\u0935\u0930 \u0939\u0948\u0902?",
  "sign in as driver": "\u0921\u094d\u0930\u093e\u0907\u0935\u0930 \u0915\u0947 \u0930\u0942\u092a \u092e\u0947\u0902 \u0938\u093e\u0907\u0928 \u0907\u0928 \u0915\u0930\u0947\u0902",
  "Are you a passenger?": "\u0915\u094d\u092f\u093e \u0906\u092a \u092f\u093e\u0924\u094d\u0930\u0940 \u0939\u0948\u0902?",
  "sign in as passenger": "\u092f\u093e\u0924\u094d\u0930\u0940 \u0915\u0947 \u0930\u0942\u092a \u092e\u0947\u0902 \u0938\u093e\u0907\u0928 \u0907\u0928 \u0915\u0930\u0947\u0902",
  "Please provide your details to continue": "\u091c\u093e\u0930\u0940 \u0930\u0916\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u0915\u0943\u092a\u092f\u093e \u0905\u092a\u0928\u0940 \u091c\u093e\u0928\u0915\u093e\u0930\u0940 \u0926\u0947\u0902",
  "Email (Optional)": "\u0908\u092e\u0947\u0932 (\u0935\u0948\u0915\u0932\u094d\u092a\u093f\u0915)",
  "Referral Code (Optional)": "\u0930\u0947\u092b\u0930\u0932 \u0915\u094b\u0921 (\u0935\u0948\u0915\u0932\u094d\u092a\u093f\u0915)",
  "Where are you going?": "\u0906\u092a \u0915\u0939\u093e\u0901 \u091c\u093e\u0928\u093e \u091a\u093e\u0939\u0924\u0947 \u0939\u0948\u0902?",
  "Where do you want to send a parcel?": "\u0906\u092a \u092a\u093e\u0930\u094d\u0938\u0932 \u0915\u0939\u093e\u0901 \u092d\u0947\u091c\u0928\u093e \u091a\u093e\u0939\u0924\u0947 \u0939\u0948\u0902?",
  "Where do you want to ride share?": "\u0906\u092a \u0930\u093e\u0907\u0921 \u0936\u0947\u092f\u0930 \u0915\u0947 \u0932\u093f\u090f \u0915\u0939\u093e\u0901 \u091c\u093e\u0928\u093e \u091a\u093e\u0939\u0924\u0947 \u0939\u0948\u0902?",
  "Recent location": "\u0939\u093e\u0932 \u0915\u093e \u0938\u094d\u0925\u093e\u0928",
  "No recent locations yet": "\u0905\u092d\u0940 \u0924\u0915 \u0915\u094b\u0908 \u0939\u093e\u0932 \u0915\u093e \u0938\u094d\u0925\u093e\u0928 \u0928\u0939\u0940\u0902 \u0939\u0948",
  "Start a ride to build your recent list": "\u0905\u092a\u0928\u0940 \u0939\u093e\u0932 \u0915\u0940 \u0938\u0942\u091a\u0940 \u092c\u0928\u093e\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u090f\u0915 \u0930\u093e\u0907\u0921 \u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902",
};

const HI_FRAGMENT_TRANSLATIONS: Record<string, string> = {
  "Ride Share": "राइड शेयर",
  "Ride Shares": "राइड शेयर",
  "Parcel Service": "पार्सल सेवा",
  "Parcel Services": "पार्सल सेवाएं",
  "Parcel": "पार्सल",
  "Driver": "ड्राइवर",
  "Passenger": "यात्री",
  "Payment": "भुगतान",
  "Payments": "भुगतानों",
  "Methods": "तरीके",
  "Method": "तरीका",
  "Wallet": "वॉलेट",
  "History": "इतिहास",
  "Settings": "सेटिंग्स",
  "About": "बारे में",
  "Profile": "प्रोफाइल",
  "Vehicle": "वाहन",
  "Vehicles": "वाहन",
  "Documents": "दस्तावेज़",
  "Document": "दस्तावेज़",
  "Verify": "सत्यापित करें",
  "Verification": "सत्यापन",
  "Code": "कोड",
  "Loading": "लोड हो रहा",
  "Please": "कृपया",
  "Failed": "विफल",
  "Success": "सफल",
  "Successful": "सफल",
  "Completed": "पूर्ण",
  "Pending": "लंबित",
  "Cancelled": "रद्द",
  "Cancel": "रद्द करें",
  "Confirm": "पुष्टि करें",
  "Start": "शुरू करें",
  "Stop": "रोकें",
  "Accept": "स्वीकार करें",
  "Reject": "अस्वीकार करें",
  "Request": "अनुरोध",
  "Requests": "अनुरोध",
  "Search": "खोजें",
  "Location": "लोकेशन",
  "Locations": "लोकेशन्स",
  "Pickup": "पिकअप",
  "Destination": "डेस्टिनेशन",
  "Amount": "राशि",
  "Total": "कुल",
  "Fare": "किराया",
  "Balance": "बैलेंस",
  "Address": "पता",
  "Support": "सपोर्ट",
  "Error": "त्रुटि",
  "Network": "नेटवर्क",
  "Retry": "पुनः प्रयास",
  "Status": "स्थिति",
  "Details": "विवरण",
  "Continue": "जारी रखें",
  "Delete": "हटाएं",
  "Save": "सहेजें",
  "Share": "शेयर",
  "Copied": "कॉपी किया गया",
  "Referral": "रेफरल",
  "Rewards": "रिवॉर्ड्स",
  "Reward": "रिवॉर्ड",
  "Today": "आज",
  "This Week": "इस सप्ताह",
  "This Month": "इस महीने",
  "Phone Number": "फोन नंबर",
  "Full Name": "पूरा नाम",
  "Email": "ईमेल",
  "Phone": "फोन",
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function interpolate(value: string, params?: TranslationParams): string {
  if (!params) return value;
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const replacement = params[key];
    return replacement === null || typeof replacement === "undefined"
      ? ""
      : String(replacement);
  });
}

function withPlaceholderProtection(input: string, transform: (value: string) => string): string {
  const placeholders: string[] = [];
  const protectedValue = input.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, (match) => {
    const token = `__PH_${placeholders.length}__`;
    placeholders.push(match);
    return token;
  });

  let transformed = transform(protectedValue);
  placeholders.forEach((match, index) => {
    transformed = transformed.replace(`__PH_${index}__`, match);
  });
  return transformed;
}

function translateHindiFromFragments(input: string): string {
  if (!/[A-Za-z]/.test(input)) return input;

  const sortedEntries = Object.entries(HI_FRAGMENT_TRANSLATIONS).sort(
    (a, b) => b[0].length - a[0].length
  );

  let output = input;
  for (const [en, hi] of sortedEntries) {
    const pattern = new RegExp(`\\b${escapeRegex(en)}\\b`, "gi");
    output = output.replace(pattern, hi);
  }

  return output;
}

export function translateText(
  text: string,
  language: AppLanguage,
  params?: TranslationParams
): string {
  if (!text) return text;

  const raw = normalizeKey(text);

  if (language === "en") {
    return interpolate(raw, params);
  }

  const exact = HI_EXACT_TRANSLATIONS[raw];
  if (exact) {
    return interpolate(exact, params);
  }

  return withPlaceholderProtection(interpolate(raw, params), translateHindiFromFragments);
}

export function getLanguageLabel(language: AppLanguage): string {
  return language === "hi" ? "हिंदी" : "English";
}
