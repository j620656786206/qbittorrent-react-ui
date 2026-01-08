import en from './en.json'
import zhHant from './zh-Hant.json'
import zhCN from './zh-CN.json'
import es from './es.json'
import de from './de.json'
import fr from './fr.json'
import ja from './ja.json'

export enum Locales {
  EN = 'en',
  ZH_HANT = 'zh-Hant',
  ZH_CN = 'zh-CN',
  ES = 'es',
  DE = 'de',
  FR = 'fr',
  JA = 'ja',
}

export const LOCALES: Array<{ title: string; value: Locales }> = [
  { title: 'English', value: Locales.EN },
  { title: '繁體中文', value: Locales.ZH_HANT },
  { title: '简体中文', value: Locales.ZH_CN },
  { title: 'Español', value: Locales.ES },
  { title: 'Deutsch', value: Locales.DE },
  { title: 'Français', value: Locales.FR },
  { title: '日本語', value: Locales.JA },
]

export const messages = {
  [Locales.EN]: { translation: en },
  [Locales.ZH_HANT]: { translation: zhHant },
  [Locales.ZH_CN]: { translation: zhCN },
  [Locales.ES]: { translation: es },
  [Locales.DE]: { translation: de },
  [Locales.FR]: { translation: fr },
  [Locales.JA]: { translation: ja },
}

export const defaultLocale = Locales.EN
export const fallbackLocale = Locales.EN