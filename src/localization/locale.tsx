import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Globe2 } from "lucide-react";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import {
  getLocale,
  isLocale,
  locales,
  setLocale,
  type Locale,
} from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";

const Context = createContext<{
  locale: Locale;
  changeLocale: (locale: Locale) => void;
} | null>(null);
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, update] = useState<Locale>(() => getLocale());
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
    document.title = m.page_title();
    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute("href", `/manifest.${locale}.webmanifest`);
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", m.page_description());
  }, [locale]);
  function changeLocale(next: Locale) {
    // No reload or remount: switching language keeps in-progress forms intact.
    void setLocale(next, { reload: false });
    update(next);
  }
  return (
    <Context.Provider value={{ locale, changeLocale }}>
      {children}
    </Context.Provider>
  );
}
export function useLocale() {
  return useContext(Context);
}
const names = { en: "English", nl: "Nederlands", tr: "Türkçe" };
export function LanguageSelector() {
  const context = useLocale();
  return (
    <label className="language-selector">
      <Globe2 size={17} aria-hidden="true" />
      <span className="sr-only">{m.language()}</span>
      <NativeSelect
        aria-label={m.language()}
        value={context?.locale ?? getLocale()}
        onChange={(event) => {
          if (isLocale(event.target.value))
            context?.changeLocale(event.target.value);
        }}
      >
        {locales.map((locale) => (
          <NativeSelectOption key={locale} value={locale} lang={locale}>
            {names[locale]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
  );
}
