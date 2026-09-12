'use client' // Page interactive (formulaire de réglages) — jamais rendue côté serveur.

import React, { useEffect, useState } from 'react' // React + hooks d'état/effet.
import { Settings, Save, Loader2, X } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée (liste d'attributs).
import { Switch } from '@/components/ui/switch' // Interrupteur on/off pour les notifications.
import { useAuth } from '@/lib/auth' // Session en cours — sert à savoir qui peut modifier.
import { useActiveBoutiqueId } from '@/lib/access' // Boutique "en cours" pour la session.
import { useBoutique, useUpdateBoutiqueSettings, useUpdateVariantAttributes } from '@/lib/queries/boutiques' // Réglages réels (imbriqués dans Boutique) + attributs de variante (sur la Boutique elle-même).

export default function SettingsPage() {
  const { session } = useAuth()
  const boutiqueId = useActiveBoutiqueId()
  const { data: boutique, isLoading, isError } = useBoutique(boutiqueId)
  const updateSettings = useUpdateBoutiqueSettings()
  const updateVariantAttributes = useUpdateVariantAttributes()

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

  // Attributs de variante — vocabulaire de déclinaisons PROPRE à cette boutique (ex: "Taille"/
  // "Couleur" pour une boutique de mode, "Format" pour une épicerie), voir Boutique.variant_attributes.
  const [variantAttributes, setVariantAttributes] = useState<string[]>([])
  const [newAttribute, setNewAttribute] = useState('')
  const [savingAttributes, setSavingAttributes] = useState(false)
  const [attributesSaved, setAttributesSaved] = useState(false)

  // Recopie les réglages reçus dans le formulaire local dès qu'ils sont disponibles (ou
  // qu'ils changent, ex: modifiés ailleurs) — un formulaire contrôlé a besoin de sa propre copie.
  useEffect(() => {
    if (!boutique) return
    setLowStockThreshold(String(boutique.settings.low_stock_threshold))
    setCriticalStockThreshold(String(boutique.settings.critical_stock_threshold))
    setNotifyLowStock(boutique.settings.notify_low_stock)
    setNotifySystemUpdates(boutique.settings.notify_system_updates)
    setNotifyWeeklyReport(boutique.settings.notify_weekly_report)
    setVariantAttributes(boutique.variant_attributes)
  }, [boutique])

  const addVariantAttribute = () => {
    const name = newAttribute.trim()
    if (!name || variantAttributes.includes(name)) return
    setVariantAttributes(prev => [...prev, name])
    setNewAttribute('')
  }
  const removeVariantAttribute = (name: string) => setVariantAttributes(prev => prev.filter(a => a !== name))

  const saveVariantAttributes = async () => {
    if (!boutique) return
    setSavingAttributes(true)
    try {
      await updateVariantAttributes.mutateAsync({ id: boutique.id, variantAttributes })
      setAttributesSaved(true)
      setTimeout(() => setAttributesSaved(false), 3000)
    } finally {
      setSavingAttributes(false)
    }
  }

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
          <p className="text-[13px] text-muted-foreground">
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

      {/* Section séparée : `variant_attributes` vit sur la Boutique elle-même, pas sur
          BoutiqueSettings — un formulaire et une mutation à part (useUpdateVariantAttributes). */}
      <Card className="p-6 border-border/50 shadow-sm bg-card space-y-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-foreground">Attributs de variante</h2>
        <p className="text-[13px] text-muted-foreground">
          Les noms utilisés pour distinguer les déclinaisons d&apos;un produit — ex: "Taille"/"Couleur" pour une boutique de
          mode, "Format" pour une épicerie. Le formulaire Produit affichera un champ par attribut listé ici.
        </p>
        <div className="flex flex-wrap gap-2">
          {variantAttributes.map(attr => (
            <Badge key={attr} variant="outline" className="text-xs font-bold gap-1.5 pr-1.5">
              {attr}
              {canEdit && (
                <button type="button" onClick={() => removeVariantAttribute(attr)} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
          {variantAttributes.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Aucun attribut — les produits n&apos;ont qu&apos;une seule variante.</p>
          )}
        </div>
        {canEdit && (
          <>
            <div className="flex gap-2">
              <Input
                value={newAttribute} onChange={e => setNewAttribute(e.target.value)}
                placeholder="Ex: Taille" className="h-10 flex-1"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariantAttribute() } }}
              />
              <Button type="button" variant="outline" onClick={addVariantAttribute} className="h-10 px-4 font-bold">Ajouter</Button>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button type="button" onClick={saveVariantAttributes} disabled={savingAttributes} className="rounded-xl px-6 h-11 gap-2 font-bold">
                {savingAttributes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Enregistrer les attributs
              </Button>
              {attributesSaved && <span className="text-sm font-bold text-primary">Attributs enregistrés.</span>}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
