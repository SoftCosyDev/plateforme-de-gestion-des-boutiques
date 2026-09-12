// Client HTTP centralisé — même pattern que Soft&Cosy (axios + gestion token).
// ────────────────────────────────────────────────

import axios from 'axios'
import { LOCK_KEY, SESSION_KEY, TOKEN_KEY } from './auth-storage'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api',
  // Ne pas fixer Content-Type ici : axios le met à 'application/json' pour un
  // objet JS, et le navigateur met 'multipart/form-data; boundary=...' pour un
  // FormData (upload de photo) — le forcer casserait ce second cas.
})

// Ajoute le token dans les headers si présent.
api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(TOKEN_KEY)
    // Ne pas envoyer le token sur l'endpoint de connexion lui-même.
    if (token && !config.url?.includes('/token/')) {
      config.headers.Authorization = `Token ${token}`
    }
  }
  return config
})

// 401 -> déconnexion automatique (token expiré/révoqué côté serveur, ex: quelqu'un s'est
// déconnecté ailleurs — un seul jeton par compte, voir accounts/views.py::LogoutView).
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // IMPORTANT : nettoie TOUT l'état d'authentification local, pas seulement le jeton — sans
      // ça, SESSION_KEY reste présent après le rechargement, /login voit une session "valide"
      // et redirige aussitôt vers /admin, qui échoue à nouveau (même jeton absent), qui
      // redirige de nouveau vers /login... une boucle infinie de rechargements complets.
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(LOCK_KEY)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Déroule toutes les pages d'un endpoint paginé DRF (count/next/previous/results).
export async function fetchAllPages<T = unknown>(url: string, params: Record<string, unknown> = {}): Promise<T[]> {
  let results: T[] = []
  let page = 1

  while (true) {
    const res = await api.get(url, { params: { ...params, page, page_size: 100 } })
    const data = res.data
    const pageResults: T[] = Array.isArray(data) ? data : (data.results || [])
    results = results.concat(pageResults)

    const hasNext = !Array.isArray(data) && !!data.next
    if (!hasNext) break
    page += 1
  }

  return results
}

export default api
