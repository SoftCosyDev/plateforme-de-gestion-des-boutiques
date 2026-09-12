// Filet de sécurité global pour les erreurs API — voir queryClient.ts (QueryCache/MutationCache).
// ────────────────────────────────────────────────

// Extrait un message lisible d'une erreur Axios/DRF (detail, premier message de champ, etc.).
export function getApiErrorMessage(err: unknown, fallback = 'Une erreur est survenue.'): string {
  const anyErr = err as any
  const data = anyErr?.response?.data

  if (typeof data === 'string' && data.trim()) return data
  if (data?.detail) return data.detail
  if (data && typeof data === 'object') {
    const firstKey = Object.keys(data)[0]
    const firstVal = firstKey ? data[firstKey] : undefined
    if (Array.isArray(firstVal) && typeof firstVal[0] === 'string') return firstVal[0]
    if (typeof firstVal === 'string') return firstVal
  }
  if (anyErr?.message === 'Network Error') return 'Impossible de contacter le serveur. Vérifiez votre connexion.'
  return fallback
}

// Une erreur "inattendue" est une erreur réseau (pas de réponse du tout) ou une panne serveur
// (5xx) — les erreurs 4xx (validation, règles métier : mot de passe incorrect, stock
// insuffisant...) sont volontairement exclues : chaque écran les affiche déjà à l'endroit
// pertinent avec un message précis, un toast générique en plus ferait doublon. Le 401 est
// exclu aussi : déjà traité par l'intercepteur de api.ts (déconnexion + redirection /login).
export function isUnexpectedApiError(err: unknown): boolean {
  const status = (err as any)?.response?.status
  if (status === undefined) return true
  if (status === 401) return false
  return status >= 500
}
