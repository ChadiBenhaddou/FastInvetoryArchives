import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { ar } from './ar';
import { fr, type Dictionary } from './fr';

export type Lang = 'fr' | 'ar';
type Key = keyof Dictionary;
export type T = (key: Key, vars?: Record<string, string | number>) => string;

const dictionaries: Record<Lang, Dictionary> = { fr, ar };

const I18nContext = createContext<{ lang: Lang; t: T }>({ lang: 'fr', t: (k) => fr[k] });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
    useEffect(() => {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }, [lang]);

    const t: T = (key, vars) =>
        (dictionaries[lang][key] ?? fr[key]).replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? ''));

    return <I18nContext.Provider value={{ lang, t }}>{children}</I18nContext.Provider>;
}

export const useT = () => useContext(I18nContext).t;
export const useLang = () => useContext(I18nContext).lang;
