'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

export type AttendanceType = 'retard' | 'absence'

// Aucune conversion de type nécessaire ici (pas de Decimal) — la forme brute suffit telle quelle.
export interface ApiAttendanceRecord {
  id: number
  boutique: number
  employee: number
  date: string
  type: AttendanceType
  reason: string
  scheduled_time: string | null
  actual_time: string | null
  justified: boolean | null
}

// `boutique` en paramètre : voir le commentaire équivalent sur queries/employees.ts::useEmployees.
export function useAttendanceRecords() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['attendance', boutiqueId],
    queryFn: () => fetchAllPages<ApiAttendanceRecord>('/attendance-records/', { boutique: boutiqueId ?? undefined }),
  })
}

export interface AttendanceInput {
  employee: number
  date: string
  type: AttendanceType
  reason: string
  scheduledTime?: string | null // Retard uniquement.
  actualTime?: string | null // Retard uniquement.
  justified?: boolean | null // Absence uniquement.
}

function toApiPayload(input: AttendanceInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
    employee: input.employee,
    date: input.date,
    type: input.type,
    reason: input.reason,
    scheduled_time: input.scheduledTime ?? null,
    actual_time: input.actualTime ?? null,
    justified: input.justified ?? null,
  }
}

export function useCreateAttendance() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: (input: AttendanceInput) =>
      api.post<ApiAttendanceRecord>('/attendance-records/', toApiPayload(input, boutiqueId)).then(res => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  })
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/attendance-records/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  })
}
