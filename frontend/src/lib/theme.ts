export type ThemeMode = 'oled' | 'zinc' | 'slate' | 'light' | 'system';
export type AccentColor = 'mono' | 'cyan' | 'amber' | 'emerald' | 'purple';
export type UiDensity = 'comfortable' | 'compact';

export interface ThemeSettings {
  mode: ThemeMode;
  accent: AccentColor;
  density: UiDensity;
}

const STORAGE_KEY_MODE = 'zenbox_theme_mode';
const STORAGE_KEY_ACCENT = 'zenbox_theme_accent';
const STORAGE_KEY_DENSITY = 'zenbox_theme_density';

export const THEME_MODES: {
  id: ThemeMode;
  label: string;
  desc: string;
  bgHex: string;
  cardHex: string;
  borderHex: string;
  accentHex: string;
}[] = [
  {
    id: 'oled',
    label: '純粹暗黑',
    desc: '極致純黑高對比',
    bgHex: '#000000',
    cardHex: '#0a0a0a',
    borderHex: '#262626',
    accentHex: '#ffffff',
  },
  {
    id: 'zinc',
    label: '深灰炭黑',
    desc: '柔和深邃防疲勞',
    bgHex: '#09090b',
    cardHex: '#18181b',
    borderHex: '#27272a',
    accentHex: '#f4f4f5',
  },
  {
    id: 'slate',
    label: '深藍冷杉',
    desc: '科技冷靜深藍微光',
    bgHex: '#0b0f17',
    cardHex: '#111827',
    borderHex: '#1e293b',
    accentHex: '#38bdf8',
  },
  {
    id: 'light',
    label: '極簡紙質',
    desc: '高信噪純白無陰影',
    bgHex: '#ffffff',
    cardHex: '#f4f4f5',
    borderHex: '#e4e4e7',
    accentHex: '#09090b',
  },
  {
    id: 'system',
    label: '跟隨系統',
    desc: '依設備自動切換',
    bgHex: 'transparent',
    cardHex: '#18181b',
    borderHex: '#27272a',
    accentHex: '#ffffff',
  },
];

export const ACCENT_COLORS: {
  id: AccentColor;
  label: string;
  colorHex: string;
}[] = [
  { id: 'mono', label: '黑白', colorHex: '#ededed' },
  { id: 'cyan', label: '石青', colorHex: '#06b6d4' },
  { id: 'amber', label: '琥珀', colorHex: '#f59e0b' },
  { id: 'emerald', label: '翡翠', colorHex: '#10b981' },
  { id: 'purple', label: '紫羅蘭', colorHex: '#a855f7' },
];

export function getStoredThemeSettings(): ThemeSettings {
  if (typeof window === 'undefined') {
    return { mode: 'oled', accent: 'mono', density: 'comfortable' };
  }

  const mode = (localStorage.getItem(STORAGE_KEY_MODE) as ThemeMode) || 'oled';
  const accent = (localStorage.getItem(STORAGE_KEY_ACCENT) as AccentColor) || 'mono';
  const density = (localStorage.getItem(STORAGE_KEY_DENSITY) as UiDensity) || 'comfortable';

  return { mode, accent, density };
}

export function applyThemeSettings(settings: ThemeSettings): void {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const isSystem = settings.mode === 'system';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveTheme = isSystem ? (prefersDark ? 'oled' : 'light') : settings.mode;

  // Set data-theme on html root
  root.setAttribute('data-theme', effectiveTheme);
  root.setAttribute('data-accent', settings.accent);
  root.setAttribute('data-density', settings.density);

  // Sync Tailwind darkMode class
  if (effectiveTheme === 'light') {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }

  // Persist settings
  localStorage.setItem(STORAGE_KEY_MODE, settings.mode);
  localStorage.setItem(STORAGE_KEY_ACCENT, settings.accent);
  localStorage.setItem(STORAGE_KEY_DENSITY, settings.density);
}
