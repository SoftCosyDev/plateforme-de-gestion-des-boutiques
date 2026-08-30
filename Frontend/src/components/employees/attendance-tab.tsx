'use client' // Onglet interactif (formulaire, tri local) — jamais rendu côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { Plus, X, Save, Clock3, CalendarX, Trash2 } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée.
import { useEmployees } from '@/lib/queries/employees' // Employés réels (Phase 7), pour le sélecteur.
import { AttendanceInput, AttendanceType, useAttendanceRecords, useCreateAttendance, useDeleteAttendance } from '@/lib/queries/attendance' // Présences réelles.

const EMPTY_FORM: AttendanceInput = {
  employee: 0, type: 'retard', date: '', reason: '',
  scheduledTime: '08:00', actualTime: '', justified: false,
}

// Minutes de retard = simple différence d'horaires — affichage uniquement, n'a AUCUN rôle dans
// le calcul de la retenue de paie (entièrement recalculée côté serveur, voir queries/payroll.ts).
function lateMinutes(scheduledTime: string | null, actualTime: string | null): number {
  if (!scheduledTime || !actualTime) return 0
  const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
  return Math.max(0, toMinutes(actualTime) - toMinutes(scheduledTime))
}

export default function AttendanceTab() {
  const { data: employees = [] } = useEmployees()
  const { data: attendance = [], isLoading, isError } = useAttendanceRecords()
  const createAttendance = useCreateAttendance()
  const deleteAttendance = useDeleteAttendance()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<AttendanceInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const employeeName = (id: number) => employees.find(e => e.id === id)?.fullName || 'Employé supprimé'

  const sorted = useMemo(() => [...attendance].sort((a, b) => b.date.localeCompare(a.date)), [attendance])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, employee: employees[0]?.id || 0, date: new Date().toISOString().slice(0, 10) })
    setIsModalOpen(true)
  }
  const closeModal = () => setIsModalOpen(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.employee || !form.date || !form.reason.trim()) return
    if (form.type === 'retard' && (!form.scheduledTime || !form.actualTime)) return

    setSaving(true)
    try {
      await createAttendance.mutateAsync({
        employee: form.employee,
        date: form.date,
        type: form.type,
        reason: form.reason.trim(),
        scheduledTime: form.type === 'retard' ? form.scheduledTime : null,
        actualTime: form.type === 'retard' ? form.actualTime : null,
        justified: form.type === 'absence' ? form.justified : null,
      })
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement des présences...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les présences. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{attendance.length} évènement(s) enregistré(s)</p>
        <Button onClick={openCreate} className="rounded-xl px-5 h-11 gap-2 font-bold">
          <Plus className="w-4 h-4" /> Déclarer
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
        {sorted.map(r => (
          <div key={r.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
              {r.type === 'retard' ? <Clock3 className="w-4 h-4 text-orange-600" /> : <CalendarX className="w-4 h-4 text-destructive" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">{employeeName(r.employee)}</span>
                <Badge className={`text-[9px] uppercase font-black ${r.type === 'retard' ? 'bg-orange-100 text-orange-700 hover:bg-orange-100' : 'bg-red-100 text-red-700 hover:bg-red-100'}`}>
                  {r.type === 'retard' ? 'Retard' : 'Absence'}
                </Badge>
                {r.type === 'absence' && (
                  <Badge variant="outline" className="text-[9px]">{r.justified ? 'Justifiée' : 'Non justifiée'}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(r.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                {r.type === 'retard' && r.scheduled_time && r.actual_time && (
                  <> · Prévu {r.scheduled_time} → Arrivé {r.actual_time} <span className="font-bold text-orange-600">({lateMinutes(r.scheduled_time, r.actual_time)} min de retard)</span></>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 italic">« {r.reason} »</p>
            </div>
            <Button
              variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
              onClick={() => { if (confirm('Supprimer cet évènement ?')) deleteAttendance.mutate(r.id) }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">Aucune absence ou retard enregistré.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <Card className="relative w-full max-w-md shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Déclarer un évènement</h2>
              <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Employé</label>
                <select
                  required
                  value={form.employee || ''}
                  onChange={e => setForm({ ...form, employee: Number(e.target.value) })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm"
                >
                  <option value="">Sélectionner...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['retard', 'absence'] as AttendanceType[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, type: t })}
                      className={`h-10 rounded-xl text-xs font-bold border transition-all ${
                        form.type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {t === 'retard' ? 'Retard' : 'Absence'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Date</label>
                <Input required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="h-11" />
              </div>

              {form.type === 'retard' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Heure prévue</label>
                    <Input required type="time" value={form.scheduledTime || ''} onChange={e => setForm({ ...form, scheduledTime: e.target.value })} className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Heure d'arrivée</label>
                    <Input required type="time" value={form.actualTime || ''} onChange={e => setForm({ ...form, actualTime: e.target.value })} className="h-11" />
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={form.justified || false}
                    onChange={e => setForm({ ...form, justified: e.target.checked })}
                    className="w-4 h-4 rounded border-input"
                  />
                  Absence justifiée (n'entraîne pas de retenue sur salaire)
                </label>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Motif</label>
                <textarea
                  required
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="Ex: Embouteillage, maladie, panne de moto..."
                  className="w-full min-h-20 px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" disabled={saving} className="flex-1 h-11 rounded-xl font-bold gap-2">
                  <Save className="w-4 h-4" />
                  Enregistrer
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
