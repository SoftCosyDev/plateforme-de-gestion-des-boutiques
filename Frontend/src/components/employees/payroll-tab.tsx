'use client' // Onglet interactif (génération, paiement, prime) — jamais rendu côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { Sparkles, ChevronDown, ChevronUp, Wallet, X, Save, PiggyBank } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée.
import { useEmployees } from '@/lib/queries/employees' // Employés réels (Phase 7), pour les noms/salaires.
import {
  ApiPayrollEntry, PayrollStatus, currentPayrollPeriod, useCreatePayrollEntry, usePayrollEntries, useUpdatePayrollEntry,
} from '@/lib/queries/payroll' // Paie réelle — TOUS les champs dérivés sont calculés côté serveur.

const STATUS_TABS: { id: PayrollStatus; label: string }[] = [
  { id: 'non_paye', label: 'Non payés' },
  { id: 'partiel', label: 'Paiements partiels' },
  { id: 'paye', label: 'Historique' },
]

export default function PayrollTab() {
  const { data: employees = [] } = useEmployees()
  const { data: payroll = [], isLoading, isError } = usePayrollEntries()
  const createPayrollEntry = useCreatePayrollEntry()
  const updatePayrollEntry = useUpdatePayrollEntry()

  const [statusFilter, setStatusFilter] = useState<PayrollStatus>('non_paye')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [payTarget, setPayTarget] = useState<ApiPayrollEntry | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [bonusTarget, setBonusTarget] = useState<ApiPayrollEntry | null>(null)
  const [bonusAmount, setBonusAmount] = useState('')
  const [generatedMsg, setGeneratedMsg] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const employeeInfo = (id: number) => employees.find(e => e.id === id)

  const grouped = useMemo(() => ({
    non_paye: payroll.filter(p => p.status === 'non_paye'),
    partiel: payroll.filter(p => p.status === 'partiel'),
    paye: payroll.filter(p => p.status === 'paye'),
  }), [payroll])

  const visible = grouped[statusFilter]
  const period = currentPayrollPeriod()

  // Génère une fiche pour chaque employé ACTIF qui n'en a pas déjà une pour la période en
  // cours — un doublon employé+période serait de toute façon rejeté par la contrainte
  // d'unicité côté serveur, mais on filtre ici pour éviter des requêtes inutiles et donner un
  // message clair ("déjà à jour") plutôt qu'une série d'erreurs 400 silencieuses.
  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const alreadyDone = new Set(payroll.filter(p => p.periodLabel === period.label).map(p => p.employee))
      const toGenerate = employees.filter(e => e.status === 'actif' && !alreadyDone.has(e.id))
      for (const e of toGenerate) {
        await createPayrollEntry.mutateAsync({
          employee: e.id, periodLabel: period.label, periodStart: period.start, periodEnd: period.end,
        })
      }
      setGeneratedMsg(toGenerate.length > 0 ? `${toGenerate.length} fiche(s) générée(s) pour ${period.label}.` : `La paie de ${period.label} est déjà à jour.`)
    } finally {
      setGenerating(false)
      setTimeout(() => setGeneratedMsg(null), 4000)
    }
  }

  const openPay = (p: ApiPayrollEntry) => { setPayTarget(p); setPayAmount('') }
  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payTarget) return
    const amount = Number(payAmount) || 0
    if (amount <= 0) return
    // `amount_paid` est un total absolu côté serveur (pas un delta) -> on ajoute au montant déjà versé.
    await updatePayrollEntry.mutateAsync({ id: payTarget.id, amountPaid: payTarget.amountPaid + amount })
    setPayTarget(null)
  }

  const openBonus = (p: ApiPayrollEntry) => { setBonusTarget(p); setBonusAmount(String(p.bonus)) }
  const submitBonus = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bonusTarget) return
    await updatePayrollEntry.mutateAsync({ id: bonusTarget.id, bonus: Number(bonusAmount) || 0 })
    setBonusTarget(null)
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement de la paie...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger la paie. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          Période en cours : <span className="font-bold text-foreground">{period.label}</span>
        </p>
        <Button onClick={handleGenerate} disabled={generating} className="rounded-xl px-5 h-11 gap-2 font-bold">
          <Sparkles className="w-4 h-4" /> Générer la paie du mois
        </Button>
      </div>
      {generatedMsg && (
        <div className="p-3 rounded-xl text-sm font-bold text-center bg-primary/10 text-primary">{generatedMsg}</div>
      )}

      <div className="flex gap-2 border-b border-border/50 overflow-x-auto">
        {STATUS_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setStatusFilter(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
              statusFilter === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label} <Badge variant="outline" className="text-[10px]">{grouped[t.id].length}</Badge>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
        {visible.map(p => {
          const emp = employeeInfo(p.employee)
          const isExpanded = expandedId === p.id
          const reste = p.netPay - p.amountPaid
          return (
            <div key={p.id}>
              <div
                className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold shrink-0">
                  {emp?.fullName?.slice(0, 2).toUpperCase() || '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{emp?.fullName || 'Employé supprimé'}</p>
                  <p className="text-xs text-muted-foreground">{p.periodLabel} · {emp?.role}</p>
                </div>
                <div className="text-right shrink-0 hidden sm:block w-28">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Net à payer</p>
                  <p className="font-black text-sm">{p.netPay.toLocaleString()} FCFA</p>
                </div>
                <div className="text-right shrink-0 hidden md:block w-28">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Reste</p>
                  <p className={`font-black text-sm ${reste > 0 ? 'text-destructive' : 'text-green-600'}`}>{reste.toLocaleString()} FCFA</p>
                </div>
                {p.status !== 'paye' && (
                  <Button
                    size="sm" className="h-9 text-xs font-bold gap-1.5 shrink-0"
                    onClick={(e) => { e.stopPropagation(); openPay(p) }}
                  >
                    <Wallet className="w-3.5 h-3.5" /> Payer
                  </Button>
                )}
                {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 bg-muted/10">
                  <div className="rounded-xl border border-border/50 bg-background/60 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Salaire de base</p>
                      <p className="font-bold">{p.baseSalary.toLocaleString()} FCFA</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Absences non just.</p>
                      <p className="font-bold">{p.unjustifiedAbsences}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Retards</p>
                      <p className="font-bold">{p.lateCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Retenue auto</p>
                      <p className="font-bold text-destructive">-{p.deduction.toLocaleString()} FCFA</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Prime</p>
                      <p className="font-bold text-green-600">+{p.bonus.toLocaleString()} FCFA</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Déjà payé</p>
                      <p className="font-bold">{p.amountPaid.toLocaleString()} FCFA</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Statut</p>
                      <Badge className={`text-[9px] uppercase font-black ${
                        p.status === 'paye' ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                        p.status === 'partiel' ? 'bg-orange-100 text-orange-700 hover:bg-orange-100' :
                        'bg-red-100 text-red-700 hover:bg-red-100'
                      }`}>
                        {p.status === 'paye' ? 'Payé' : p.status === 'partiel' ? 'Partiel' : 'Non payé'}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="outline" size="sm" className="h-8 text-xs font-bold gap-1.5 mt-3"
                    onClick={(e) => { e.stopPropagation(); openBonus(p) }}
                  >
                    <PiggyBank className="w-3.5 h-3.5" /> Ajuster la prime
                  </Button>
                </div>
              )}
            </div>
          )
        })}
        {visible.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">Aucune fiche dans cette liste.</div>
        )}
      </div>

      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPayTarget(null)} />
          <Card className="relative w-full max-w-sm shadow-2xl border-border/50">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Payer le salaire</h2>
              <Button variant="ghost" size="icon" onClick={() => setPayTarget(null)} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={submitPay} className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-bold text-foreground">{employeeInfo(payTarget.employee)?.fullName}</span> — reste à payer{' '}
                <Badge variant="outline" className="font-black">{(payTarget.netPay - payTarget.amountPaid).toLocaleString()} FCFA</Badge>
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Montant versé</label>
                <Input
                  required type="number" min="1" max={payTarget.netPay - payTarget.amountPaid}
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} className="h-11" autoFocus
                />
              </div>
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={() => setPayTarget(null)} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-bold gap-2"><Wallet className="w-4 h-4" />Payer</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {bonusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setBonusTarget(null)} />
          <Card className="relative w-full max-w-sm shadow-2xl border-border/50">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Ajuster la prime</h2>
              <Button variant="ghost" size="icon" onClick={() => setBonusTarget(null)} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={submitBonus} className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-bold text-foreground">{employeeInfo(bonusTarget.employee)?.fullName}</span>
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Prime (FCFA)</label>
                <Input required type="number" min="0" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} className="h-11" autoFocus />
              </div>
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={() => setBonusTarget(null)} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-bold gap-2"><Save className="w-4 h-4" />Valider</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
