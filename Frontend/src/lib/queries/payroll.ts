'use client' // Hooks React (useQuery/useMutation) — ne s'exécutent que côté client.

// useMutation/useQuery/useQueryClient : briques TanStack Query pour lire/écrire l'API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
// api : instance axios centralisée. fetchAllPages : déroule la pagination DRF.
import api, { fetchAllPages } from '@/lib/api'
// useActiveBoutiqueId : id de la boutique "en cours" pour la session (voir access.ts).
import { useActiveBoutiqueId } from '@/lib/access'

export type PayrollStatus = 'non_paye' | 'partiel' | 'paye'

// Forme brute d'une fiche de paie (Decimal -> chaînes) — TOUS les champs dérivés
// (absences/retards/retenue/net à payer/statut) sont calculés côté serveur, jamais ici.
interface RawPayrollEntry {
  id: number
  boutique: number
  employee: number
  period_label: string
  period_start: string
  period_end: string
  unjustified_absences: number
  late_count: number
  base_salary: string
  bonus: string
  deduction: string
  net_pay: string
  amount_paid: string
  status: PayrollStatus
}

export interface ApiPayrollEntry {
  id: number
  employee: number
  periodLabel: string
  periodStart: string
  periodEnd: string
  unjustifiedAbsences: number
  lateCount: number
  baseSalary: number
  bonus: number
  deduction: number
  netPay: number
  amountPaid: number
  status: PayrollStatus
}

function mapPayrollEntry(raw: RawPayrollEntry): ApiPayrollEntry {
  return {
    id: raw.id,
    employee: raw.employee,
    periodLabel: raw.period_label,
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    unjustifiedAbsences: raw.unjustified_absences,
    lateCount: raw.late_count,
    baseSalary: Number(raw.base_salary),
    bonus: Number(raw.bonus),
    deduction: Number(raw.deduction),
    netPay: Number(raw.net_pay),
    amountPaid: Number(raw.amount_paid),
    status: raw.status,
  }
}

// Période "en cours" pour la génération de paie — ancrée sur la VRAIE date du jour, purement une
// commodité d'affichage/formulaire, sans aucun rapport avec le calcul de paie lui-même (entièrement
// recalculé côté serveur à partir des présences réelles, voir Backend/payroll/services.py).
export interface PayrollPeriod {
  label: string
  start: string // Date ISO (YYYY-MM-DD).
  end: string
}

export function currentPayrollPeriod(): PayrollPeriod {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
  const rawLabel = start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { label: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1), start: iso(start), end: iso(end) }
}

// `boutique` en paramètre : voir le commentaire équivalent sur queries/employees.ts::useEmployees.
export function usePayrollEntries() {
  const boutiqueId = useActiveBoutiqueId()
  return useQuery({
    queryKey: ['payroll', boutiqueId],
    queryFn: async () => (await fetchAllPages<RawPayrollEntry>('/payroll-entries/', { boutique: boutiqueId ?? undefined })).map(mapPayrollEntry),
  })
}

// Le client ne fournit QUE l'identité de la période et les deux champs vraiment saisis à la
// main — absences/retards/retenue/net à payer/statut sont toujours recalculés côté serveur à
// partir des vraies présences (voir Backend/payroll/services.py), jamais envoyés d'ici.
export interface PayrollEntryInput {
  employee: number
  periodLabel: string
  periodStart: string
  periodEnd: string
  bonus?: number
  amountPaid?: number
}

function toApiPayload(input: PayrollEntryInput, boutiqueId: number | null) {
  return {
    boutique: boutiqueId ?? undefined, // undefined -> absent du JSON (le serveur le force pour un EMPLOYEE).
    employee: input.employee,
    period_label: input.periodLabel,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    bonus: input.bonus ?? 0,
    amount_paid: input.amountPaid ?? 0,
  }
}

// "Générer la paie" pour un employé sur une période = créer sa fiche ; le serveur calcule tout
// à cet instant précis (un doublon employé+période est rejeté par une contrainte d'unicité).
export function useCreatePayrollEntry() {
  const queryClient = useQueryClient()
  const boutiqueId = useActiveBoutiqueId()
  return useMutation({
    mutationFn: async (input: PayrollEntryInput) =>
      mapPayrollEntry((await api.post<RawPayrollEntry>('/payroll-entries/', toApiPayload(input, boutiqueId))).data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll'] }),
  })
}

// Sert à la fois pour "encaisser un paiement" (amountPaid) et "ajuster la prime" (bonus) — dans
// les deux cas, le serveur RECALCULE tout (y compris la retenue, à partir des présences
// actuelles) plutôt que de se contenter d'appliquer le champ modifié isolément.
export function useUpdatePayrollEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, bonus, amountPaid }: { id: number; bonus?: number; amountPaid?: number }) =>
      api.patch<RawPayrollEntry>(`/payroll-entries/${id}/`, {
        bonus, amount_paid: amountPaid,
      }).then(res => mapPayrollEntry(res.data)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payroll'] }),
  })
}
