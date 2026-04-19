// tokens.js — Design system constants
// Single source of truth for colors, spacing, and archetype styles.
// Maps directly to DESIGN-GUIDE.md section 2 & 4.

export const COLORS = {
  stone50:  '#fafaf9',
  stone100: '#f5f5f4',
  stone200: '#e7e5e3',
  stone300: '#d6d3d1',
  stone400: '#a8a29e',
  stone500: '#78716c',
  stone600: '#57534e',
  stone700: '#44403c',
  stone800: '#292524',
  stone900: '#1c1917',

  emerald50:  '#ecfdf5',
  emerald100: '#d1fae5',
  emerald200: '#a7f3d0',
  emerald400: '#34d399',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald800: '#065f46',

  amber50:  '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',

  sky50:  '#f0f9ff',
  sky100: '#e0f2fe',
  sky500: '#0ea5e9',
  sky600: '#0284c7',
  sky700: '#0369a1',

  rose500: '#f43f5e',

  hardRed: '#b91c1c',
  hardRedBg: '#fef2f2',
};

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 32,
};

// Per DESIGN-GUIDE.md section 2 — Archetype Colors
export const ARCHETYPE_STYLES = {
  classic:  { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', label: 'Classic' },
  scenic:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', label: 'Scenic' },
  explorer: { bg: '#fef3c7', border: '#fde68a', text: '#92400e', label: 'Explorer' },
};

// Per DESIGN-GUIDE.md section 2 — Feature Type Colors
export const FEATURE_ICONS = {
  lake:     { glyph: '◉', color: COLORS.sky600 },
  peak:     { glyph: '▲', color: COLORS.amber600 },
  pass:     { glyph: '⛰', color: '#9333ea' },
  landmark: { glyph: '★', color: COLORS.amber700 },
};

export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// ─── Brand Logo (base64 PNG, transparent background) ─
export const LOGO_SRC = "data:image/png;base64,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";

// ─── Supported Regions ───────────────────────────────
export const REGIONS = [
  { id: "adirondack-high-peaks", name: "Adirondack High Peaks", state: "New York" },
  { id: "ansel-adams", name: "Ansel Adams Wilderness", state: "California" },
  { id: "bob-marshall-wilderness", name: "Bob Marshall Wilderness", state: "Montana" },
  { id: "bryce-canyon", name: "Bryce Canyon National Park", state: "Utah" },
  { id: "desolation-wilderness", name: "Desolation Wilderness", state: "California" },
  { id: "enchantments-alpine-lakes", name: "Enchantments / Alpine Lakes Wilderness", state: "Washington" },
  { id: "glacier-national-park", name: "Glacier National Park", state: "Montana" },
  { id: "grand-canyon-backcountry", name: "Grand Canyon National Park", state: "Arizona" },
  { id: "grand-teton", name: "Grand Teton National Park", state: "Wyoming" },
  { id: "great-smoky-mountains", name: "Great Smoky Mountains", state: "Tennessee / North Carolina" },
  { id: "john-muir-wilderness", name: "John Muir Wilderness", state: "California" },
  { id: "maroon-bells-snowmass", name: "Maroon Bells-Snowmass Wilderness", state: "Colorado" },
  { id: "mount-rainier", name: "Mount Rainier National Park", state: "Washington" },
  { id: "north-cascades", name: "North Cascades", state: "Washington" },
  { id: "olympic-national-park", name: "Olympic National Park", state: "Washington" },
  { id: "rocky-mountain-np", name: "Rocky Mountain National Park", state: "Colorado" },
  { id: "weminuche-wilderness", name: "Weminuche Wilderness", state: "Colorado" },
  { id: "white-mountains", name: "White Mountains", state: "New Hampshire" },
  { id: "wind-river-range", name: "Wind River Range", state: "Wyoming" },
  { id: "yosemite-backcountry", name: "Yosemite National Park Backcountry", state: "California" },
  { id: "zion-backcountry", name: "Zion National Park", state: "Utah" },
];
