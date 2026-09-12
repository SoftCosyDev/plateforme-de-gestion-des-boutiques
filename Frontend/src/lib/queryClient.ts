'use client'

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage, isUnexpectedApiError } from './notify'

// Filet de sécurité global : affiche un toast pour toute erreur réseau/serveur INATTENDUE
// (voir isUnexpectedApiError) qui ne serait pas déjà remontée par l'écran lui-même — ex: le
// tableau de bord n'arrive pas à charger, le serveur est temporairement injoignable. Sans ça,
// ce genre de panne passe aujourd'hui totalement inaperçue (liste vide, chiffres manquants,
// sans aucun message).
function reportUnexpectedError(error: unknown) {
  if (isUnexpectedApiError(error)) {
    toast.error(getApiErrorMessage(error, 'Une erreur inattendue est survenue.'))
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportUnexpectedError }),
  mutationCache: new MutationCache({ onError: reportUnexpectedError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})
