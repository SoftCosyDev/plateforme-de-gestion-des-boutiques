'use client' // Page interactive (formulaires, état local) — jamais rendue côté serveur.

import React, { useEffect, useState } from 'react' // React + hooks d'état/effet.
import { useRouter } from 'next/navigation' // Navigation programmatique (redirections).
import { Building2, Plus, X, Save, LogOut, MapPin, Edit2, Ban, CheckCircle2 } from 'lucide-react' // Icônes utilisées dans la page.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée (nom du propriétaire).
import { useAuth } from '@/lib/auth' // Session en cours (owner/superadmin) + navigation entre boutiques.
import { BOUTIQUE_THEME_PRESETS } from '@/lib/boutique-theme' // Palettes de couleurs prédéfinies (hex).
import { ALL_FEATURES, FeatureKey } from '@/lib/features' // Les 15 clés de fonctionnalité activables.
import {
  ApiBoutique, useBoutiques, useCreateBoutique, useCreateOwner, useOwners, useSetBoutiqueActive, useUpdateBoutique,
} from '@/lib/queries/boutiques' // Boutiques/propriétaires réels.

// Formulaire de création d'une boutique — plus de champs "premier compte Gérant" : tant que le
// domaine Employés n'est pas branché sur l'API (voir le plan de reconnexion), le premier compte
// employé d'une boutique se crée séparément (étape manuelle temporaire, signalée dans l'UI).
const EMPTY_FORM = {
  name: '', // Nom commercial de la boutique.
  neighborhood: '', // Quartier/adresse, texte libre.
  businessType: '', // Type d'activité, texte libre ("épicerie", "mode"...).
  themeIndex: 0, // Index dans BOUTIQUE_THEME_PRESETS.
  enabledFeatures: [] as FeatureKey[], // Fonctionnalités cochées à la création.
  ownerMode: 'existing' as 'existing' | 'new', // SuperAdmin seulement : propriétaire existant ou nouveau.
  ownerId: '' as number | '', // Id du propriétaire choisi (SuperAdmin, mode "existing").
  newOwnerName: '', newOwnerUsername: '', newOwnerPassword: '', // SuperAdmin, mode "new".
}

export default function AdminPage() {
  // Session + navigation : `setActiveBoutique` fait "entrer" dans une boutique (id numérique réel).
  const { session, hydrated, logout, setActiveBoutique } = useAuth()
  const router = useRouter()

  const isSuperAdmin = session?.kind === 'superadmin' // Calculé tôt, réutilisé partout dans la page.

  // Liste des boutiques visibles — déjà cloisonnée côté serveur (OWNER: les siennes, SUPERADMIN: toutes).
  const { data: boutiques = [] } = useBoutiques()
  // Liste des propriétaires — seulement utile (et seulement autorisée) pour un SuperAdmin.
  const { data: owners = [] } = useOwners(isSuperAdmin)
  const createBoutique = useCreateBoutique()
  const createOwner = useCreateOwner()
  const updateBoutique = useUpdateBoutique()
  const setBoutiqueActive = useSetBoutiqueActive()

  const [isModalOpen, setIsModalOpen] = useState(false) // Ouverture de la modale (création OU édition).
  const [editingId, setEditingId] = useState<number | null>(null) // null = création, sinon id en cours de modification.
  const [form, setForm] = useState(EMPTY_FORM) // État local du formulaire.

  // Redirige vers /login si personne n'est connecté, ou si un employé atterrit ici par erreur
  // (cette page n'a jamais de sens pour un compte employé, cantonné à une seule boutique).
  useEffect(() => {
    if (!hydrated) return
    if (!session || session.kind === 'employee') router.replace('/login')
  }, [hydrated, session, router])

  // État de chargement neutre tant que la session n'est pas encore connue côté client.
  if (!hydrated || !session || session.kind === 'employee') {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm font-medium">
        Chargement...
      </div>
    )
  }

  // Trouve le nom d'un propriétaire à partir de son id — utilisé seulement pour le badge SuperAdmin.
  const ownerName = (ownerId: number) => owners.find(o => o.id === ownerId)?.full_name || 'Propriétaire inconnu'

  // "Entre" dans une boutique : fixe l'id actif puis navigue vers le tableau de bord.
  const enterBoutique = (boutiqueId: number) => {
    setActiveBoutique(boutiqueId)
    router.push('/')
  }

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setIsModalOpen(true) }

  // Ouvre la modale en mode édition — pré-remplit tout sauf le propriétaire (jamais réassignable
  // ici) et le thème (retrouve le préréglage correspondant si les couleurs matchent, sinon garde
  // le premier par défaut — un thème personnalisé au pixel près n'est pas un cas géré ici).
  const openEdit = (b: ApiBoutique) => {
    const themeIndex = BOUTIQUE_THEME_PRESETS.findIndex(
      p => p.theme.primary === b.theme_primary_color && p.theme.accent === b.theme_accent_color,
    )
    setEditingId(b.id)
    setForm({
      ...EMPTY_FORM,
      name: b.name, neighborhood: b.neighborhood, businessType: b.business_type,
      themeIndex: themeIndex >= 0 ? themeIndex : 0, enabledFeatures: [...b.enabled_features],
    })
    setIsModalOpen(true)
  }

  const closeModal = () => { setIsModalOpen(false); setEditingId(null) }

  // Coche/décoche une fonctionnalité dans la liste `enabledFeatures` du formulaire.
  const toggleFeature = (key: FeatureKey) => {
    setForm(prev => ({
      ...prev,
      enabledFeatures: prev.enabledFeatures.includes(key)
        ? prev.enabledFeatures.filter(k => k !== key)
        : [...prev.enabledFeatures, key],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const preset = BOUTIQUE_THEME_PRESETS[form.themeIndex].theme
    const payload = {
      name: form.name.trim(),
      neighborhood: form.neighborhood.trim(),
      business_type: form.businessType.trim(),
      theme_primary_color: preset.primary,
      theme_accent_color: preset.accent,
      enabled_features: form.enabledFeatures,
    }

    // Édition : le propriétaire ne change jamais ici, `is_active` non plus (voir useSetBoutiqueActive).
    if (editingId) {
      await updateBoutique.mutateAsync({ id: editingId, input: payload })
      closeModal()
      return
    }

    // Création : résout l'id du propriétaire à assigner — `undefined` pour un OWNER (le serveur
    // le force de toute façon à lui-même, voir BoutiqueWriteSerializer.validate()).
    let ownerId: number | undefined
    if (isSuperAdmin) {
      if (form.ownerMode === 'new') {
        // Refuse une soumission incomplète avant d'appeler l'API.
        if (!form.newOwnerName.trim() || !form.newOwnerUsername.trim() || !form.newOwnerPassword.trim()) return
        const newOwner = await createOwner.mutateAsync({
          full_name: form.newOwnerName.trim(),
          username: form.newOwnerUsername.trim(),
          password: form.newOwnerPassword,
        })
        ownerId = newOwner.id
      } else {
        if (!form.ownerId) return // Aucun propriétaire sélectionné -> on n'envoie rien.
        ownerId = form.ownerId
      }
    }

    const newBoutique = await createBoutique.mutateAsync({ ...payload, owner: ownerId })
    closeModal()
    enterBoutique(newBoutique.id)
  }

  // Active/désactive une boutique — action séparée du formulaire, réservée SUPERADMIN (voir
  // useSetBoutiqueActive), jamais mélangée à une modification de nom/thème/fonctionnalités.
  const handleToggleActive = (b: ApiBoutique, e: React.MouseEvent) => {
    e.stopPropagation() // Ne déclenche pas l'entrée dans la boutique via le clic de la carte.
    const verb = b.is_active ? 'désactiver' : 'réactiver'
    if (!confirm(`Confirmer : ${verb} "${b.name}" ? Les données de la boutique sont conservées dans tous les cas.`)) return
    setBoutiqueActive.mutate({ id: b.id, isActive: !b.is_active })
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
              <Building2 className="w-8 h-8 text-primary" />
              {isSuperAdmin ? 'Toutes les boutiques' : 'Mes boutiques'}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">
              Connecté en tant que {session.name} ({isSuperAdmin ? 'Super Administrateur' : 'Propriétaire'})
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={openCreate} className="rounded-xl px-5 h-11 gap-2 font-bold">
              <Plus className="w-4 h-4" /> Créer une boutique
            </Button>
            <Button variant="outline" onClick={handleLogout} className="rounded-xl px-4 h-11 gap-2 font-bold">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {boutiques.map((b: ApiBoutique) => (
            <Card
              key={b.id}
              // Une boutique désactivée n'affiche plus jamais de page (voir access.ts) —
              // y "entrer" ne mènerait qu'à un aller-retour immédiat vers /admin, inutile.
              onClick={() => { if (b.is_active) enterBoutique(b.id) }}
              className={`relative p-6 border-border/50 shadow-sm bg-card transition-all ${
                b.is_active ? 'cursor-pointer hover:border-primary/40 hover:shadow-md' : 'opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-4 gap-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: b.theme_primary_color }}
                >
                  <Building2 className="w-5 h-5" style={{ color: 'white' }} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {!b.is_active && <Badge className="text-[10px] font-bold bg-destructive/15 text-destructive hover:bg-destructive/15">Désactivée</Badge>}
                  {isSuperAdmin && <Badge variant="outline" className="text-[10px] font-bold">{ownerName(b.owner)}</Badge>}
                </div>
              </div>
              <h3 className="font-bold text-foreground">{b.name}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" /> {b.neighborhood}
              </p>
              {/* Nombre d'employés/produits volontairement absent ici — éviterait un appel
                  API supplémentaire par carte juste pour un chiffre secondaire. */}
              {b.enabled_features.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-4 pt-4 border-t border-border/40 font-bold uppercase tracking-wide">
                  {b.enabled_features.length} fonctionnalité(s) activée(s)
                </p>
              )}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/40">
                <Button
                  variant="outline" size="sm" className="h-8 text-xs font-bold gap-1.5"
                  onClick={e => { e.stopPropagation(); openEdit(b) }}
                >
                  <Edit2 className="w-3.5 h-3.5" /> Modifier
                </Button>
                {isSuperAdmin && (
                  <Button
                    variant="outline" size="sm"
                    className={`h-8 text-xs font-bold gap-1.5 ${b.is_active ? 'text-destructive' : 'text-green-600'}`}
                    disabled={setBoutiqueActive.isPending}
                    onClick={e => handleToggleActive(b, e)}
                  >
                    {b.is_active ? <><Ban className="w-3.5 h-3.5" /> Désactiver</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Réactiver</>}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {boutiques.length === 0 && (
            <div className="col-span-full p-12 text-center text-muted-foreground rounded-2xl border border-dashed border-border/50">
              Aucune boutique pour le moment.
            </div>
          )}
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
            <Card className="relative w-full max-w-lg shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-border/50 flex items-center justify-between">
                <h2 className="text-xl font-black">{editingId ? 'Modifier la boutique' : 'Créer une boutique'}</h2>
                <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full"><X className="w-5 h-5" /></Button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Le propriétaire ne se réassigne jamais depuis cet écran — uniquement à la création. */}
                {isSuperAdmin && !editingId && (
                  <div className="space-y-3 pb-4 border-b border-border/40">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Propriétaire</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, ownerMode: 'existing' })}
                        className={`h-10 rounded-xl text-xs font-bold border transition-all ${form.ownerMode === 'existing' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        Propriétaire existant
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, ownerMode: 'new' })}
                        className={`h-10 rounded-xl text-xs font-bold border transition-all ${form.ownerMode === 'new' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        + Nouveau propriétaire
                      </button>
                    </div>
                    {form.ownerMode === 'existing' ? (
                      <select
                        value={form.ownerId}
                        onChange={e => setForm({ ...form, ownerId: e.target.value ? Number(e.target.value) : '' })}
                        className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm"
                      >
                        <option value="">Sélectionner...</option>
                        {owners.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                      </select>
                    ) : (
                      <div className="space-y-3">
                        <Input placeholder="Nom du propriétaire" value={form.newOwnerName} onChange={e => setForm({ ...form, newOwnerName: e.target.value })} className="h-11" />
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="Identifiant" value={form.newOwnerUsername} onChange={e => setForm({ ...form, newOwnerUsername: e.target.value })} className="h-11" />
                          <Input placeholder="Mot de passe" type="password" value={form.newOwnerPassword} onChange={e => setForm({ ...form, newOwnerPassword: e.target.value })} className="h-11" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Nom de la boutique</label>
                    <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Chez Idrissou — Kodjoviakopé" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Quartier</label>
                    <Input required value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} placeholder="Ex: Kodjoviakopé, Lomé" className="h-11" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Type d'activité</label>
                  <Input value={form.businessType} onChange={e => setForm({ ...form, businessType: e.target.value })} placeholder="Ex: épicerie, mode, sport..." className="h-11" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Couleur du thème</label>
                  <div className="grid grid-cols-6 gap-2">
                    {BOUTIQUE_THEME_PRESETS.map((preset, i) => (
                      <button
                        key={preset.label}
                        type="button"
                        title={preset.label}
                        onClick={() => setForm({ ...form, themeIndex: i })}
                        className={`h-11 rounded-xl border-2 transition-all ${form.themeIndex === i ? 'border-foreground scale-105' : 'border-transparent'}`}
                        style={{ backgroundColor: preset.theme.primary }}
                      />
                    ))}
                  </div>
                </div>

                {/* Les fonctionnalités activées correspondent à un abonnement vendu par la
                    plateforme — seul un SUPERADMIN peut les cocher (voir
                    BoutiqueWriteSerializer.validate côté backend, qui refuse tout changement
                    venant d'un Owner). Celui-ci ne fait que CONSULTER ce qui est déjà activé. */}
                {isSuperAdmin ? (
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Fonctionnalités activées</label>
                    <p className="text-[11px] text-muted-foreground">
                      Détermine ce que cette boutique peut utiliser sur la plateforme — modifiable plus tard, depuis cet écran.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {ALL_FEATURES.map(key => {
                        const checked = form.enabledFeatures.includes(key)
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleFeature(key)}
                            className={`flex items-center gap-2 px-3 h-10 rounded-xl border-2 text-xs font-bold text-left transition-colors ${
                              checked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center ${checked ? 'border-primary bg-primary' : 'border-border'}`}>
                              {checked && <span className="w-1.5 h-1.5 rounded-sm bg-primary-foreground" />}
                            </span>
                            <span className="truncate">{key}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Fonctionnalités activées</label>
                    <p className="text-[11px] text-muted-foreground">
                      Attribuées par la plateforme selon votre abonnement — seul un administrateur peut les modifier.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {form.enabledFeatures.length > 0 ? form.enabledFeatures.map(key => (
                        <Badge key={key} variant="outline" className="text-[10px] font-bold">{key}</Badge>
                      )) : (
                        <p className="text-xs text-muted-foreground italic">
                          {editingId ? 'Aucune fonctionnalité activée pour le moment.' : 'Seront activées par la plateforme après la création.'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {!editingId && (
                  <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                    Le premier compte employé de cette boutique se crée séparément, une fois la
                    boutique créée (page Employés).
                  </p>
                )}

                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="outline" onClick={closeModal} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                  <Button type="submit" className="flex-1 h-11 rounded-xl font-bold gap-2" disabled={createBoutique.isPending || createOwner.isPending || updateBoutique.isPending}>
                    <Save className="w-4 h-4" />
                    {editingId ? 'Enregistrer' : 'Créer et entrer'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
