export const BENTO_SIZE = {
  SM: 'sm',
  MD: 'md',
  LG: 'lg',
  XL: 'xl',
  FULL: 'full',
} as const;

export type BentoSize = (typeof BENTO_SIZE)[keyof typeof BENTO_SIZE];
export const BENTO_SIZE_VALUES = Object.values(BENTO_SIZE) as [BentoSize, ...BentoSize[]];

export const THEME_MODE = {
  DARK: 'dark',
  LIGHT: 'light',
  SYSTEM: 'system',
} as const;

export type ThemeMode = (typeof THEME_MODE)[keyof typeof THEME_MODE];
export const THEME_MODE_VALUES = Object.values(THEME_MODE) as [ThemeMode, ...ThemeMode[]];
