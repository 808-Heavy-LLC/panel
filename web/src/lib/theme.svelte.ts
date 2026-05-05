export const THEMES = ['hud', 'cyberpunk', 'mission-control'] as const;
export type ThemeName = (typeof THEMES)[number];

export const THEME_LABELS: Record<ThemeName, string> = {
  hud: 'HUD',
  cyberpunk: 'CYBERPUNK',
  'mission-control': 'MISSION CONTROL',
};

const STORAGE_KEY = 'panel.theme';

function isTheme(v: string | null | undefined): v is ThemeName {
  return !!v && (THEMES as readonly string[]).includes(v);
}

function readInitial(): ThemeName {
  if (typeof window === 'undefined') return 'hud';
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('theme');
  if (isTheme(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // localStorage may not be available
  }
  return 'hud';
}

class ThemeStore {
  current = $state<ThemeName>('hud');
  changedAt = $state(0);

  init(): () => void {
    this.current = readInitial();
    this.apply();
    const handler = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }

  set(name: ThemeName): void {
    if (this.current === name) return;
    this.current = name;
    this.changedAt = Date.now();
    this.apply();
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // ignore
    }
  }

  cycle(dir = 1): void {
    const idx = THEMES.indexOf(this.current);
    const next = THEMES[(idx + dir + THEMES.length) % THEMES.length]!;
    this.set(next);
  }

  private apply(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = this.current;
    }
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target?.matches('input, textarea, [contenteditable]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      this.cycle(e.shiftKey ? -1 : 1);
    } else if (e.key >= '1' && e.key <= '9') {
      const idx = Number.parseInt(e.key, 10) - 1;
      if (idx < THEMES.length) {
        e.preventDefault();
        this.set(THEMES[idx]!);
      }
    }
  }
}

export const theme = new ThemeStore();

/** Read a CSS custom property from :root. Updates when theme changes. */
export function cssColor(name: string, fallback = '#ffffff'): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
