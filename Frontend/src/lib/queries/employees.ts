'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'
// AccessRole/FeatureKey : miroir exact du backend (voir features.ts).
import { AccessRole, FeatureKey } from '@/lib/features'

export type EmployeeStatus = 'actif' | 'inactif'

// Forme brute d'un profil employé — les champs `user_id`/`username`/`full_name`/`profile_photo`
// sont recopiés depuis le User lié côté backend (source='user.*'), pas de second appel nécessaire.
interface RawEmployeeProfile {
  id: number
  user_id: number
  username: string
  full_name: string
  profile_photo: string | null
  boutique: number
  role: string
  phone: string
  hire_date: string | null
  base_salary: string
  status: EmployeeStatus
  access_role: AccessRole
  allowed_pages: FeatureKey[]
}

export interface ApiEmployee {
  id: number
  userId: number
  username: string
  fullName: string
  profilePhoto: string | null
  boutique: number
  role: string
  phone: string
  hireDate: string | null
  baseSalary: number
  status: EmployeeStatus
  accessRole: AccessRole
  allowedPages: FeatureKey[]
}

function mapEmployee(raw: RawEmployeeProfile): ApiEmployee {
  return {
    id: raw.id,
    userId: raw.user_id,
    username: raw.username,
    fullName: raw.full_name,
    profilePhoto: raw.profile_photo,
    boutique: raw.boutique,
    role: raw.role,
    phone: raw.phone,
    hireDate: raw.hire_date,
    baseSalary: Number(raw.base_salary),
    status: raw.status,
    accessRole: raw.access_role,
    allowedPages: raw.allowed_pages,
  }
}

// `boutique` en paramètre : indispensable pour un SUPERADMIN/OWNER multi-boutiques — sans lui,
// for_user() renvoie TOUS les employés de TOUTES leurs boutiques mélangés. C'est exactement le
// bug corrigé ici : un employé créé pendant qu'on est "entré" dans une boutique se retrouvait
// listé aussi bien depuis une autre boutique, alors que son boutique_id n'a jamais changé — seule
// la liste affichée n'était pas filtrée sur la boutique actuellement sélectionnée à l'écran. La
// clé de requête inclut boutiqueId pour que changer de boutique déclenche un vrai refetch.
export function useEmployees() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['employees', boutiqueId],
    queryFn: async () => (await fetchAllPages<RawEmployeeProfile>('/employees/', { boutique: boutiqueId ?? undefined })).map(mapEmployee),
  })
}

// Champs collectés par le formulaire — crée/modifie le User ET son EmployeeProfile ensemble
// côté serveur (voir EmployeeProfileWriteSerializer). `password` optionnel à la modification.
export interface EmployeeInput {
  username: string
  password?: string
  fullName: string
  role: string
  phone: string
  hireDate: string
  baseSalary: number
  status: EmployeeStatus
  accessRole: AccessRole
  allowedPages?: FeatureKey[] // Si absent, le serveur applique le gabarit par défaut du rôle choisi.
}

function toApiPayload(input: EmployeeInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
    username: input.username,
    password: input.password ?? '',
    full_name: input.fullName,
    role: input.role,
    phone: input.phone,
    hire_date: input.hireDate,
    base_salary: input.baseSalary,
    status: input.status,
    access_role: input.accessRole,
    allowed_pages: input.allowedPages,
  }
}

export function useCreateEmployee() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async (input: EmployeeInput) =>
      mapEmployee((await api.post<RawEmployeeProfile>('/employees/', toApiPayload(input, boutiqueId))).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: EmployeeInput }) =>
      mapEmployee((await api.patch<RawEmployeeProfile>(`/employees/${id}/`, toApiPayload(input, boutiqueId))).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
}

// Photo de profil de l'EMPLOYÉ, définie par son gérant/propriétaire — distincte de la photo que
// CHACUN peut définir pour son propre compte (voir queries/users.ts::useUploadMyPhoto). Toujours
// appelée sur un employé DÉJÀ existant (jamais à la création, le formulaire n'a pas encore d'id).
export function useUploadEmployeePhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const formData = new FormData()
      formData.append('photo', file)
      return mapEmployee((await api.post<RawEmployeeProfile>(`/employees/${id}/upload-photo/`, formData)).data)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
}
