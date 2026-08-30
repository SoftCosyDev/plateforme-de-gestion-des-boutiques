// `AccessRole` est réexporté depuis `features.ts`, qui reste la SOURCE UNIQUE
// (miroir exact du backend) — réexporté ici pour ne pas casser tous les
// fichiers qui importent déjà `AccessRole` depuis `./types`.
export type { AccessRole } from './features'
import type { AccessRole } from './features'

// Forme attendue par `applyBoutiqueTheme()` (voir boutique-theme.ts) — deux couleurs, peu
// importe qu'elles viennent d'un préréglage local ou d'une vraie Boutique de l'API.
export interface BoutiqueTheme {
  primary: string
  accent: string
}

export type Unit = 'unite' | 'kg' | 'g' | 'l' | 'cl' | 'carton' | 'sachet'

export const UNIT_LABELS: Record<Unit, string> = {
  unite: 'Unité',
  kg: 'Kg',
  g: 'g',
  l: 'L',
  cl: 'cl',
  carton: 'Carton',
  sachet: 'Sachet',
}

// `AccessRole` (permissions dans l'app, distinct de `role` = le poste texte
// libre genre "Vendeuse") est défini dans `features.ts` — miroir exact des
// valeurs backend `gerant|manager|staff`.
export const ACCESS_ROLE_LABELS: Record<AccessRole, string> = {
  gerant: 'Gérant / DG',
  manager: 'Manager',
  staff: 'Staff',
}
