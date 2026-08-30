'use client' // Page interactive (formulaire de réglages) — jamais rendue côté serveur.

import React, { useEffect, useState } from 'react' // React + hooks d'état/effet.
import { Settings, Save, Loader2 } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Switch } from '@/components/ui/switch' // Interrupteur on/off pour les notifications.
import { useAuth } from '@/lib/auth' // Session en cours — sert à savoir qui peut modifier.
import { useActiveBoutiqueId } from '@/lib/access' // Boutique "en cours" pour la session.
import { useBoutique, useUpdateBoutiqueSettings } from '@/lib/queries/boutiques' // Réglages réels (imbriqués dans Boutique).

export default function SettingsPage() {
  const { session } = useAuth()
  const boutiqueId = useActiveBoutiqueId()
  const { data: boutique, isLoading, isError } = useBoutique(boutiqueId)
  const updateSettings = useUpdateBoutiqueSettings()

  // Modifier les réglages reste une décision de propriétaire côté backend (voir
  // BoutiqueSettingsViewSet) — un employé peut consulter cette page mais pas l'enregistrer.
  const canEdit = session?.kind === 'owner' || session?.kind === 'superadmin'

  const [lowStockThreshold, setLowStockThreshold] = useState('')
  const [criticalStockThreshold, setCriticalStockThreshold] = useState('')
  const [notifyLowStock, setNotifyLowStock] = useState(true)
  const [notifySystemUpdates, setNotifySystemUpdates] = useState(true)
  const [notifyWeeklyReport, setNotifyWeeklyReport] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Recopie les réglages reçus dans le formulaire local dès qu'ils sont disponibles (ou
  // qu'ils changent, ex: modifiés ailleurs) — un formulaire contrôlé a besoin de sa propre copie.
  useEffect(() => {
    if (!boutique) return
    setLowStockThreshold(String(boutique.settings.low_stock_threshold))
    setCriticalStockThreshold(String(boutique.settings.critical_stock_threshold))
    setNotifyLowStock(boutique.settings.notify_low_stock)
    setNotifySystemUpdates(boutique.settings.notify_system_updates)
    setNotifyWeeklyReport(boutique.settings.notify_weekly_report)
  }, [boutique])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!boutique) return
    setSaving(true)
    try {
      await updateSettings.mutateAsync({
        settingsId: boutique.settings.id,
        input: {
          low_stock_threshold: Number(lowStockThreshold) || 0,
          critical_stock_threshold: Number(criticalStockThreshold) || 0,
          notify_low_stock: notifyLowStock,
          notify_system_updates: notifySystemUpdates,
          notify_weekly_report: notifyWeeklyReport,
        },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement des réglages...</div>
  }
  if (isError || !boutique) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les réglages. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          Réglages
        </h1>
        <p className="text-muted-foreground mt-1 text-sm font-medium">
          Seuils de stock et notifications de {boutique.name}
          {!canEdit && ' — lecture seule pour un compte employé'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6 border-border/50 shadow-sm bg-card space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-foreground">Seuils de stock</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">Seuil stock faible</label>
              <Input
                type="number" min="0" disabled={!canEdit}
                value={lowStockThreshold} onChange={e => setLowStockThreshold(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">Seuil stock critique</label>
              <Input
                type="number" min="0" disabled={!canEdit}
                value={criticalStockThreshold} onChange={e => setCriticalStockThreshold(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Utilisés par défaut pour une variante qui n'a pas son propre seuil d'alerte.
          </p>
        </Card>

        <Card className="p-6 border-border/50 shadow-sm bg-card space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-foreground">Notifications</h2>
          <label className="flex items-center justify-between gap-4 py-1">
            <span className="text-sm font-semibold">Stock faible</span>
            <Switch checked={notifyLowStock} onCheckedChange={setNotifyLowStock} disabled={!canEdit} />
          </label>
          <label className="flex items-center justify-between gap-4 py-1">
            <span className="text-sm font-semibold">Mises à jour système</span>
            <Switch checked={notifySystemUpdates} onCheckedChange={setNotifySystemUpdates} disabled={!canEdit} />
          </label>
          <label className="flex items-center justify-between gap-4 py-1">
            <span className="text-sm font-semibold">Rapport hebdomadaire</span>
            <Switch checked={notifyWeeklyReport} onCheckedChange={setNotifyWeeklyReport} disabled={!canEdit} />
          </label>
        </Card>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving} className="rounded-xl px-6 h-11 gap-2 font-bold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </Button>
            {saved && <span className="text-sm font-bold text-primary">Réglages enregistrés.</span>}
          </div>
        )}
      </form>
    </div>
  )
}
