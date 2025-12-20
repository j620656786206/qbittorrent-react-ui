import en from './en.json'
import zhHant from './zh-Hant.json'

export enum Locales {
  EN = 'en',
  ZH_HANT = 'zh-Hant',
}

export const LOCALES: { title: string; value: Locales }[] = [
  { title: 'English', value: Locales.EN },
  { title: '繁體中文', value: Locales.ZH_HANT },
]

export const messages = {
  [Locales.EN]: { translation: en },
  [Locales.ZH_HANT]: { translation: zhHant },
}

export const defaultLocale = Locales.EN
export const fallbackLocale = Locales.EN
