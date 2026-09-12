// Clés localStorage partagées entre auth.tsx (qui les écrit/lit normalement) et api.ts (qui doit
// pouvoir TOUT nettoyer d'un coup sur un 401, même hors de tout contexte React) — extraites dans
// leur propre module pour éviter un import circulaire (api.ts est déjà importé PAR auth.tsx).
export const SESSION_KEY = 'chez-idrissou-session-v4'
export const TOKEN_KEY = 'authToken'
export const LOCK_KEY = 'chez-idrissou-locked'
