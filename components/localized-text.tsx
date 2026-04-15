import React from "react";
import {
  StyleSheet,
  Text as RNText,
  TextProps,
  TextStyle,
  StyleProp,
} from "react-native";
import { useLanguage } from "@/context/language-context";

interface LocalizedTextProps extends TextProps {
  disableTranslation?: boolean;
}

function getHindiFontFamily(style?: StyleProp<TextStyle>): string {
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontFamily = flattened?.fontFamily ?? "";
  const fontWeight = flattened?.fontWeight;

  if (fontFamily.includes("Figtree_700") || fontWeight === "700" || fontWeight === "800" || fontWeight === "900") {
    return "NotoSansDevanagari_700Bold";
  }
  if (fontFamily.includes("Figtree_600") || fontFamily.includes("SemiBold") || fontWeight === "600") {
    return "NotoSansDevanagari_600SemiBold";
  }
  if (fontFamily.includes("Figtree_500") || fontFamily.includes("Medium") || fontWeight === "500") {
    return "NotoSansDevanagari_500Medium";
  }
  if (fontFamily.includes("Figtree_300") || fontFamily.includes("Light") || fontWeight === "300") {
    return "NotoSansDevanagari_300Light";
  }
  return "NotoSansDevanagari_400Regular";
}

function localizeNode(
  node: React.ReactNode,
  t: (text: string) => string,
  disableTranslation: boolean
): React.ReactNode {
  if (disableTranslation) return node;

  if (typeof node === "string") {
    if (node.trim().length === 0) {
      return node;
    }
    const leading = node.match(/^\s*/)?.[0] ?? "";
    const trailing = node.match(/\s*$/)?.[0] ?? "";
    return `${leading}${t(node.trim())}${trailing}`;
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <React.Fragment key={index}>{localizeNode(child, t, disableTranslation)}</React.Fragment>
    ));
  }

  return node;
}

export const LocalizedText = React.forwardRef<React.ComponentRef<typeof RNText>, LocalizedTextProps>(
  ({ children, style, disableTranslation = false, ...rest }, ref) => {
    const { language, t } = useLanguage();
    const translatedChildren = localizeNode(children, t, disableTranslation);

    return (
      <RNText
        ref={ref}
        {...rest}
        style={[
          style,
          language === "hi"
            ? {
                fontFamily: getHindiFontFamily(style),
              }
            : null,
        ]}
      >
        {translatedChildren}
      </RNText>
    );
  }
);

LocalizedText.displayName = "LocalizedText";
