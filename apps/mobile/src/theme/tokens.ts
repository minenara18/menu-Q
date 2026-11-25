/**
 * Warm Industrial Café — Ticket & Neon.
 * Single source of truth for every colour, size and animation duration.
 */
export const palette = {
  cream: '#FAF6EF',
  white: '#FFFFFF',
  ink: '#1C1917',
  charcoal: '#131110',
  card: '#1E1B18',
  orange: '#FF5A1F',
  bar: '#2563EB',
  kitchen: '#EA580C',
  pastry: '#9333EA',
  ordered: '#EAB308',
  inProgress: '#2563EB',
  ready: '#16A34A',
  completed: '#6B7280',
  cancelled: '#DC2626',
  muted: '#9CA3AF',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const touch = { min: 48, action: 60 } as const;
export const motion = { fast: 150, normal: 220, slow: 250 } as const;

export const typography = {
  display: 'SpaceGrotesk',
  body: 'Inter',
  ticket: 44,
  heading: 24,
  title: 18,
  bodySize: 15,
  caption: 12,
} as const;

export const tokens = {
  light: {
    bg: palette.cream,
    surface: palette.white,
    ink: palette.ink,
    accent: palette.orange,
    border: '#E7E1D8',
    muted: '#6B7280',
  },
  dark: {
    bg: palette.charcoal,
    surface: palette.card,
    ink: palette.cream,
    accent: palette.orange,
    border: '#3A342E',
    muted: '#B8B0A6',
  },
  station: { BAR: palette.bar, KITCHEN: palette.kitchen, PASTRY: palette.pastry },
  status: {
    ORDERED: palette.ordered,
    IN_PROGRESS: palette.inProgress,
    READY: palette.ready,
    COMPLETED: palette.completed,
    CANCELLED: palette.cancelled,
  },
};

export type ThemeMode = 'light' | 'dark';
export type AppTheme = (typeof tokens)[ThemeMode] & {
  station: typeof tokens.station;
  status: typeof tokens.status;
};

export function getTheme(mode: ThemeMode): AppTheme {
  return { ...tokens[mode], station: tokens.station, status: tokens.status };
}

/** Format rupiah with Indonesian separators, e.g. 59400 -> "Rp 59.400". */
export function formatIDR(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(Math.round(value)).toString();
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return `${sign}Rp ${out}`;
}
