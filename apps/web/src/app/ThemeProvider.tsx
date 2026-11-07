import { THEME_MODE, type ThemeMode } from '@freetier-loop/shared';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEME_MODE.DARK,
  setTheme: () => undefined,
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<ThemeMode>(THEME_MODE.DARK);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(THEME_MODE.DARK, THEME_MODE.LIGHT);
    root.classList.add(theme === THEME_MODE.LIGHT ? THEME_MODE.LIGHT : THEME_MODE.DARK);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
