'use client' // Page interactive (formulaires, filtre local) — jamais rendue côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { Truck, Plus, Search, Edit2, Trash2, X, Save, Phone, MapPin } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import {
  ApiSupplier, SupplierInput, useCreateSupplier, useDeleteSupplier, useSuppliers, useUpdateSupplier,
} from '@/lib/queries/suppliers' // Couche de données réelle.

const EMPTY_FORM: SupplierInput = { name: '', phone: '', address: '' }

export default function SuppliersPage() {
  const { data: suppliers = [], isLoading, isError } = useSuppliers()
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()
  const deleteSupplier = useDeleteSupplier()

  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<ApiSupplier | null>(null)
  const [form, setForm] = useState<SupplierInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return suppliers
    return suppliers.filter(s => s.name.toLowerCase().includes(term) || s.phone.includes(term))
  }, [suppliers, searchTerm])

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setIsModalOpen(true) }
  const openEdit = (s: ApiSupplier) => {
    setEditing(s)
    setForm({ name: s.name, phone: s.phone, address: s.address })
    setIsModalOpen(true)
  }
  const closeModal = () => { setIsModalOpen(false); setEditing(null); setForm(EMPTY_FORM) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) await updateSupplier.mutateAsync({ id: editing.id, input: form })
      else await createSupplier.mutateAsync(form)
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement des fournisseurs...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les fournisseurs. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Truck className="w-8 h-8 text-primary" />
            Fournisseurs
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">{suppliers.length} fournisseur(s)</p>
        </div>
        <Button onClick={openCreate} className="rounded-xl px-6 h-12 gap-2 font-bold">
          <Plus className="w-5 h-5" />
          Nouveau Fournisseur
        </Button>
      </div>

      <Card className="p-4 border-border/50 shadow-sm bg-card/50">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher par nom ou téléphone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-11 h-12 rounded-xl" />
        </div>
      </Card>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
        {filtered.map(s => (
          <div key={s.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foreground text-sm truncate">{s.name}</div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {s.phone}</span>}
                {s.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.address}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                onClick={() => { if (confirm('Supprimer ce fournisseur ?')) deleteSupplier.mutate(s.id) }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-16 text-center text-muted-foreground">Aucun fournisseur trouvé.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <Card className="relative w-full max-w-md shadow-2xl border-border/50">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">{editing ? 'Modifier le fournisseur' : 'Nouveau Fournisseur'}</h2>
              <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nom</label>
                <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Grossiste Togo Distribution" className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Téléphone</label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+228 90 00 00 00" className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Adresse</label>
                <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Ex: Zone industrielle, Lomé" className="h-11" />
              </div>
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" disabled={saving} className="flex-1 h-11 rounded-xl font-bold gap-2"><Save className="w-4 h-4" />Enregistrer</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
