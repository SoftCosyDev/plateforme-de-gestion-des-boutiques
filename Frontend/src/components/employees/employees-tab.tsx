'use client' // Onglet interactif (formulaire, filtre local) — jamais rendu côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { Plus, Search, Edit2, Trash2, X, Save, Phone, Camera } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée.
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar' // Avatar réel (photo ou initiales).
import { ACCESS_ROLE_LABELS } from '@/lib/types' // Libellés français des rôles.
import { AccessRole, DEFAULT_PAGES_BY_ROLE } from '@/lib/features' // Gabarits de pages par rôle, alignés backend.
import { PAGES } from '@/lib/pages' // Catalogue des pages routables (id = clé de fonctionnalité).
import { initials } from '@/lib/utils' // Repli "initiales" quand aucune photo de profil.
import { useActiveBoutiqueId } from '@/lib/access' // Boutique en cours (pour filtrer les fonctionnalités activées).
import { useBoutique } from '@/lib/queries/boutiques' // Relit la boutique en direct (enabled_features).
import {
  ApiEmployee, EmployeeInput, EmployeeStatus,
  useCreateEmployee, useDeleteEmployee, useEmployees, useUpdateEmployee, useUploadEmployeePhoto,
} from '@/lib/queries/employees' // Couche de données réelle.

// Formulaire vide par défaut — rôle 'staff' (le plus restrictif) comme point de départ.
// `allowedPages` reste VIDE ici à dessein : le gabarit complet du rôle n'a de sens qu'une fois
// filtré par les fonctionnalités de la boutique (voir `openCreate`/`handleRoleChange`) — le
// pré-remplir directement avec `DEFAULT_PAGES_BY_ROLE.staff` enverrait des clés que la boutique
// n'a jamais activées, invisibles dans la grille de cases à cocher (filtrée, elle) mais quand
// même incluses dans la requête — une vraie fuite de permission, déjà rencontrée une fois.
const EMPTY_FORM: EmployeeInput = {
  username: '', password: '', fullName: '', role: '', phone: '', hireDate: '',
  baseSalary: 0, status: 'actif', accessRole: 'staff', allowedPages: [],
}

export default function EmployeesTab() {
  const { data: employees = [], isLoading, isError } = useEmployees()
  const createEmployee = useCreateEmployee()
  const updateEmployee = useUpdateEmployee()
  const deleteEmployee = useDeleteEmployee()
  const uploadPhoto = useUploadEmployeePhoto()
  // Une checkbox n'a de sens que si la BOUTIQUE elle-même a activé cette fonctionnalité —
  // rattache concrètement ce formulaire au modèle de permission à deux niveaux de la Phase 1.
  const boutiqueId = useActiveBoutiqueId()
  const { data: boutique } = useBoutique(boutiqueId)
  const availablePages = useMemo(
    () => PAGES.filter(p => boutique?.enabled_features.includes(p.id)),
    [boutique],
  )

  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<ApiEmployee | null>(null)
  const [form, setForm] = useState<EmployeeInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Photo choisie dans le formulaire — upload réel différé jusqu'à l'enregistrement (voir
  // handleSubmit) : à la création, l'employé n'a pas encore d'id tant que la 1re requête n'a
  // pas répondu. `photoPreview` affiche un aperçu immédiat (URL locale blob://, jamais envoyée
  // telle quelle) le temps que l'upload réel se termine.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const filtered = employees.filter(e => {
    const term = searchTerm.trim().toLowerCase()
    return !term || e.fullName.toLowerCase().includes(term) || e.role.toLowerCase().includes(term)
  })

  const openCreate = () => {
    setEditing(null)
    // Gabarit du rôle par défaut ('staff'), déjà filtré aux fonctionnalités de CETTE boutique —
    // jamais le gabarit brut (voir le commentaire sur EMPTY_FORM).
    setForm({ ...EMPTY_FORM, allowedPages: DEFAULT_PAGES_BY_ROLE.staff.filter(key => availablePages.some(p => p.id === key)) })
    setPhotoFile(null)
    setPhotoPreview(null)
    setFormError(null)
    setIsModalOpen(true)
  }

  const openEdit = (e: ApiEmployee) => {
    setEditing(e)
    setForm({
      username: e.username, password: '', fullName: e.fullName, role: e.role, phone: e.phone,
      hireDate: e.hireDate || '', baseSalary: e.baseSalary, status: e.status,
      accessRole: e.accessRole, allowedPages: e.allowedPages,
    })
    setPhotoFile(null)
    setPhotoPreview(e.profilePhoto)
    setFormError(null)
    setIsModalOpen(true)
  }

  const closeModal = () => { setIsModalOpen(false); setEditing(null); setForm(EMPTY_FORM); setPhotoFile(null); setPhotoPreview(null) }

  // Aperçu immédiat (blob:// local) — jamais envoyé tel quel, juste affiché en attendant l'upload
  // réel après l'enregistrement (voir handleSubmit) — même principe que côté SoftCosy.
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const result = editing
        ? await updateEmployee.mutateAsync({ id: editing.id, input: form })
        : await createEmployee.mutateAsync(form)
      // Upload réel seulement maintenant : à la création, c'est le tout premier moment où
      // l'employé a un id — impossible avant que cette requête ne réponde.
      if (photoFile) {
        await uploadPhoto.mutateAsync({ id: result.id, file: photoFile })
      }
      closeModal()
    } catch (err: any) {
      setFormError(err?.response?.data?.username?.[0] || err?.response?.data?.detail || "Impossible d'enregistrer cet employé.")
    } finally {
      setSaving(false)
    }
  }

  // Choisir un rôle ne fait que RÉINITIALISER les pages autorisées à un gabarit de départ
  // pratique (restreint à ce que la boutique a activé) — l'accès réel reste dans `allowedPages`
  // et peut ensuite être affiné case par case, y compris à l'encontre du rôle.
  const handleRoleChange = (role: AccessRole) => {
    const template = DEFAULT_PAGES_BY_ROLE[role].filter(key => availablePages.some(p => p.id === key))
    setForm(prev => ({ ...prev, accessRole: role, allowedPages: template }))
  }

  const togglePage = (key: string) => {
    setForm(prev => ({
      ...prev,
      allowedPages: (prev.allowedPages || []).includes(key as any)
        ? (prev.allowedPages || []).filter(p => p !== key)
        : [...(prev.allowedPages || []), key as any],
    }))
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement des employés...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les employés. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <p className="text-sm font-medium text-muted-foreground">{employees.length} employé(s)</p>
        {/* flex-col sur mobile : la recherche à largeur fixe (w-56) + le bouton ne tenaient
            jamais côte à côte sur un petit écran, le bouton débordait hors de l'écran. */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-11 rounded-xl w-full sm:w-56" />
          </div>
          <Button onClick={openCreate} className="rounded-xl px-5 h-11 gap-2 font-bold shrink-0">
            <Plus className="w-4 h-4" /> Nouvel employé
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
        {filtered.map(e => (
          <div key={e.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
            <Avatar className="size-10 shrink-0">
              <AvatarImage src={e.profilePhoto ?? undefined} alt={e.fullName} />
              <AvatarFallback className="text-xs font-bold">{initials(e.fullName)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground text-sm truncate">{e.fullName}</span>
                <Badge variant="outline" className="text-[11px] font-bold shrink-0">{e.role || ACCESS_ROLE_LABELS[e.accessRole]}</Badge>
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                <Phone className="w-3 h-3" /> {e.phone}
              </div>
            </div>
            <div className="text-right shrink-0 hidden sm:block w-32">
              <p className="text-[12px] text-muted-foreground uppercase font-bold">Salaire de base</p>
              <p className="font-bold text-sm">{e.baseSalary.toLocaleString()} FCFA</p>
            </div>
            <Badge className={`shrink-0 text-[11px] uppercase font-black ${e.status === 'actif' ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-muted text-muted-foreground hover:bg-muted'}`}>
              {e.status === 'actif' ? 'Actif' : 'Inactif'}
            </Badge>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(e)}>
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                onClick={() => { if (confirm('Supprimer cet employé ?')) deleteEmployee.mutate(e.id) }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">Aucun employé trouvé.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <Card className="relative w-full max-w-lg shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">{editing ? "Modifier l'employé" : 'Nouvel employé'}</h2>
              <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <Avatar className="size-16">
                    <AvatarImage src={photoPreview ?? undefined} alt={form.fullName || 'Photo'} />
                    <AvatarFallback className="text-lg font-bold">{initials(form.fullName || '?')}</AvatarFallback>
                  </Avatar>
                  <label
                    htmlFor="employee-photo-input"
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer border-2 border-card"
                    title="Changer la photo"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </label>
                  <input id="employee-photo-input" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </div>
                <p className="text-[13px] text-muted-foreground">Photo de profil (optionnelle) — clique sur l&apos;icône pour en choisir une.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nom complet</label>
                <Input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="Ex: Kossi Mensah" className="h-11" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Poste</label>
                  <Input required value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Ex: Caissière" className="h-11" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Téléphone</label>
                  <Input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+228 90 00 00 00" className="h-11" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Date d'embauche</label>
                  <Input required type="date" value={form.hireDate} onChange={e => setForm({ ...form, hireDate: e.target.value })} className="h-11" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Salaire de base (FCFA)</label>
                  <Input required type="number" min="0" value={form.baseSalary} onChange={e => setForm({ ...form, baseSalary: Number(e.target.value) || 0 })} className="h-11" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Statut</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value as EmployeeStatus })}
                    className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm"
                  >
                    <option value="actif">Actif</option>
                    <option value="inactif">Inactif</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Rôle d'accès (gabarit)</label>
                  <select
                    value={form.accessRole}
                    onChange={e => handleRoleChange(e.target.value as AccessRole)}
                    className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm"
                  >
                    {Object.entries(ACCESS_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-border/40">
                <label className="text-xs font-bold text-muted-foreground uppercase">Pages autorisées</label>
                <p className="text-[13px] text-muted-foreground">
                  Limité à ce que cette boutique a elle-même activé — modifiable dans Réglages.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {availablePages.map(page => {
                    const Icon = page.icon
                    const checked = (form.allowedPages || []).includes(page.id)
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => togglePage(page.id)}
                        className={`flex items-center gap-2 px-3 h-11 rounded-xl border-2 text-xs font-bold text-left transition-colors ${
                          checked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center ${checked ? 'border-primary bg-primary' : 'border-border'}`}>
                          {checked && <span className="w-1.5 h-1.5 rounded-sm bg-primary-foreground" />}
                        </span>
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{page.label}</span>
                      </button>
                    )
                  })}
                  {availablePages.length === 0 && (
                    <p className="col-span-full text-xs text-muted-foreground italic">Aucune fonctionnalité activée sur cette boutique.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Identifiant (pour se connecter)</label>
                  <Input
                    required
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    placeholder="Ex: kossi"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">
                    Mot de passe {editing && <span className="normal-case font-normal">(laisser vide pour ne pas changer)</span>}
                  </label>
                  <Input
                    required={!editing}
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Ex: kossi1234"
                    className="h-11"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs font-bold text-destructive bg-destructive/10 rounded-lg p-2.5">{formError}</p>
              )}

              <div className="pt-4 flex gap-3">
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
