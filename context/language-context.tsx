import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAppLanguage, setAppLanguage } from "@/lib/storage";
import { AppLanguage, TranslationParams, translateText } from "@/lib/i18n/translations";

interface LanguageContextValue {
  language: AppLanguage;
  isReady: boolean;
  setLanguage: (language: AppLanguage) => Promise<void>;
  t: (text: string, params?: TranslationParams) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const storedLanguage = await getAppLanguage();
        if (!isMounted) return;
        setLanguageState(storedLanguage ?? "en");
      } catch (error) {
        console.warn("[Language] Failed to load stored language:", error);
      } finally {
        if (isMounted) setIsReady(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    try {
      await setAppLanguage(nextLanguage);
    } catch (error) {
      console.warn("[Language] Failed to persist language:", error);
    }
  }, []);

  const t = useCallback(
    (text: string, params?: TranslationParams) => translateText(text, language, params),
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      isReady,
      setLanguage,
      t,
    }),
    [language, isReady, setLanguage, t]
  );

  if (!isReady) {
    return null;
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
