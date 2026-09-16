import { Injectable, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark' | 'neon';

const STORAGE_KEY = 'soluti_theme';
const THEMES: AppTheme[] = ['light', 'dark', 'neon'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<AppTheme>(this.readInitialTheme());

  constructor() {
    this.applyTheme(this.theme());
  }

  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
    this.applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage puede no estar disponible (modo privado); solo no persiste.
    }
  }

  private applyTheme(theme: AppTheme): void {
    document.documentElement.setAttribute('data-theme', theme);
  }

  private readInitialTheme(): AppTheme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && THEMES.includes(stored as AppTheme)) return stored as AppTheme;
    } catch {
      // localStorage puede no estar disponible (modo privado); se usa el tema por defecto.
    }
    return 'light';
  }
}
