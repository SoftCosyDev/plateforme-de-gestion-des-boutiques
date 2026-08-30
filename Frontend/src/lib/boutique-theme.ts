import { BoutiqueTheme } from './types'

// Variables CSS pilotées par le thème d'une boutique — `--sidebar-primary`/
// `--sidebar-accent` sont des tokens INDÉPENDANTS de `--primary`/`--accent`
// dans globals.css (pas des `var(...)`), donc les deux jeux doivent être
// posés explicitement pour que la sidebar suive elle aussi la couleur choisie.
const THEME_VARS = [
  '--primary', '--primary-foreground', '--ring',
  '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-ring',
  '--accent', '--accent-foreground',
  '--sidebar-accent', '--sidebar-accent-foreground',
] as const

// Préréglages choisis avec une luminosité intermédiaire (ni le clair du mode
// light ni le clair du mode dark de globals.css) pour rester lisibles dans
// les deux thèmes sans dupliquer un jeu de couleurs par mode — simplification
// assumée pour cette phase de simulation.
const LIGHT_FOREGROUND = 'oklch(0.98 0.006 95)'

export function applyBoutiqueTheme(theme: BoutiqueTheme) {
  const root = document.documentElement
  root.style.setProperty('--primary', theme.primary)
  root.style.setProperty('--primary-foreground', LIGHT_FOREGROUND)
  root.style.setProperty('--ring', theme.primary)
  root.style.setProperty('--sidebar-primary', theme.primary)
  root.style.setProperty('--sidebar-primary-foreground', LIGHT_FOREGROUND)
  root.style.setProperty('--sidebar-ring', theme.primary)
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--accent-foreground', LIGHT_FOREGROUND)
  root.style.setProperty('--sidebar-accent', theme.accent)
  root.style.setProperty('--sidebar-accent-foreground', LIGHT_FOREGROUND)
}

export function clearBoutiqueTheme() {
  const root = document.documentElement
  THEME_VARS.forEach(v => root.style.removeProperty(v))
}

// Couleurs en HEXADÉCIMAL (pas oklch) : `Boutique.theme_primary_color`/
// `theme_accent_color` côté backend sont des `CharField(max_length=7)`, donc
// un format "#RRGGBB" exactement — une chaîne oklch(...) ne rentrerait pas.
export const BOUTIQUE_THEME_PRESETS: { label: string; theme: BoutiqueTheme }[] = [
  { label: 'Vert épicerie', theme: { primary: '#1F6E5C', accent: '#F0A840' } },
  { label: 'Bleu', theme: { primary: '#2563EB', accent: '#F59E0B' } },
  { label: 'Violet', theme: { primary: '#7C3AED', accent: '#FBBF24' } },
  { label: 'Corail', theme: { primary: '#F0653D', accent: '#FDE68A' } },
  { label: 'Brique', theme: { primary: '#B4552F', accent: '#3B82A6' } },
  { label: 'Magenta', theme: { primary: '#D6368F', accent: '#FBCB6B' } },
]
