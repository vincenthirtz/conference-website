import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * i18n leger maison, scope a l'espace joueur / capitaine.
 *
 * Pas de routing par locale ni de dependance externe : un simple contexte
 * React + persistance localStorage. Le site est francais par defaut ; la
 * langue ne bascule en anglais que sur action explicite de l'utilisateur
 * (toggle FR/EN dans la PlayerTopBar).
 *
 * Chaque page/composant co-localise son propre dictionnaire `{ fr, en }` et
 * le consomme via `useT(dict)` (cf. lib/i18n/useT.ts). On evite ainsi un
 * dictionnaire central monolithique et les conflits d'edition.
 */

export type Lang = 'fr' | 'en';

const STORAGE_KEY = 'cw_player_lang';

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'fr',
  setLang: () => {},
  toggleLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // SSR + premier rendu client : toujours 'fr' (site francais par defaut) pour
  // eviter tout mismatch d'hydratation. La preference stockee est appliquee
  // juste apres, cote client.
  const [lang, setLangState] = useState<Lang>('fr');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'fr' || stored === 'en') {
        setLangState(stored);
      }
    } catch {
      // localStorage indisponible (mode prive, SSR) — on reste en 'fr'.
    }
  }, []);

  // Garde <html lang> aligne sur la langue active (a11y + SEO). Le defaut SSR
  // reste 'fr' (cf. _document) ; cet effet ne tourne que cote client.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // pas grave : la langue restera juste non persistee
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next = prev === 'fr' ? 'en' : 'fr';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // idem
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, toggleLang }),
    [lang, setLang, toggleLang]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
