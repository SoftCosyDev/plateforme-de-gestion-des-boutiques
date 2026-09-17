'use client' // Page interactive (formulaires, filtres locaux) — jamais rendue côté serveur.

import React, { useMemo, useState } from 'react' // React + hooks d'état/mémorisation.
import { Package, Plus, Search, Edit2, Trash2, X, Save, ScanBarcode, Wrench, Loader2, FolderPlus, Camera } from 'lucide-react' // Icônes.
import { Card } from '@/components/ui/card' // Conteneur visuel réutilisable.
import { Button } from '@/components/ui/button' // Bouton stylé réutilisable.
import { Input } from '@/components/ui/input' // Champ de saisie stylé réutilisable.
import { Badge } from '@/components/ui/badge' // Petite étiquette stylée (compteur par catégorie).
import {
  ApiProduct, ApiVariant, STOCK_MOVEMENT_REASONS, StockMovementReason, Unit, VariantInput,
  useAdjustStock, useCategories, useCreateCategory, useCreateProduct, useDeleteProduct,
  useDeleteProductImage, useProducts, useUpdateProduct, useUploadProductImage, variantLabel,
} from '@/lib/queries/products' // Couche de données réelle (Product -> Variant -> Stock).
import { UNIT_LABELS } from '@/lib/types' // Libellés français des unités de vente.
import BarcodeDisplayModal, { BarcodeItem } from '@/components/barcode-display-modal' // Affiche/imprime un ou plusieurs codes-barres.
import BarcodeScannerModal, { ScannedItem } from '@/components/barcode-scanner-modal' // Scan caméra — déjà utilisé à la caisse (cashier/page.tsx), réutilisé ici pour remplir le code-barres à la création.
import { useActiveBoutiqueId } from '@/lib/access' // Boutique "en cours" — pour lire son vocabulaire d'attributs de variante.
import { useBoutique } from '@/lib/queries/boutiques' // Boutique.variant_attributes : défini par CHAQUE boutique dans /settings.

// Une ligne de variante dans le formulaire — un produit "simple" (épicerie) n'en garde qu'une
// seule, un produit à déclinaisons (mode) en a plusieurs (voir queries/products.ts::VariantInput).
// `attributes` : une entrée par nom configuré dans Boutique.variant_attributes (ex: {"Taille":
// "M", "Couleur": "Rouge"}) — plus de champs fixes "modèle"/"taille", le vocabulaire est propre
// à chaque boutique (une épicerie n'a pas les mêmes déclinaisons qu'une boutique de mode).
interface VariantFormRow {
  id?: number
  attributes: Record<string, string>
  barcode: string
  price: string
  costPrice: string
  stock: string // Uniquement significatif pour une variante SANS id (stock initial, à la création).
  lowStockThreshold: string
}

function emptyVariantRow(): VariantFormRow {
  return { attributes: {}, barcode: '', price: '', costPrice: '', stock: '', lowStockThreshold: '10' }
}

function emptyForm() {
  return { name: '', categoryId: '', unit: 'unite' as Unit, expirationDate: '', emoji: '📦', variants: [emptyVariantRow()] }
}

const UNCATEGORIZED = { id: -1, boutique: -1, name: 'Non classé', description: '', image_url: '' }

export default function ProductsPage() {
  const { data: products = [], isLoading, isError } = useProducts()
  const { data: categories = [] } = useCategories()
  const boutiqueId = useActiveBoutiqueId()
  const { data: boutique } = useBoutique(boutiqueId)
  // Vocabulaire de déclinaisons PROPRE à cette boutique (ex: ["Taille","Couleur"] pour une
  // boutique de mode, ["Format"] pour une épicerie, [] si un produit n'a jamais qu'une variante).
  const variantAttributeNames = boutique?.variant_attributes ?? []
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()
  const uploadProductImage = useUploadProductImage()
  const deleteProductImage = useDeleteProductImage()
  const adjustStock = useAdjustStock()
  const createCategory = useCreateCategory()

  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<ApiProduct | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  // Photo du produit — état séparé du reste du formulaire : l'upload se fait dans un appel
  // distinct APRÈS la création/modification du produit (voir handleSubmit), il faut donc garder
  // le fichier en attente à part plutôt que dans `form` (jamais envoyé dans le JSON principal).
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  // true = l'utilisateur a explicitement retiré la photo existante (voir handleRemoveImage) —
  // distinct de "aucun nouveau fichier choisi", qui doit laisser la photo actuelle intacte.
  const [removeImageFlag, setRemoveImageFlag] = useState(false)
  const [barcodeItems, setBarcodeItems] = useState<BarcodeItem[] | null>(null)
  // Index de la ligne de variante en attente d'un scan (null = scanner fermé) — un seul scanner
  // pour tout le formulaire, réutilisé pour n'importe quelle variante selon le bouton cliqué.
  const [scannerTargetIndex, setScannerTargetIndex] = useState<number | null>(null)
  // Historique affiché à côté de la caméra (voir BarcodeScannerModal) — persiste tant que le
  // formulaire produit reste ouvert, pas seulement pendant un seul cycle ouverture/fermeture du
  // scanner : rouvrir la caméra pour la variante suivante doit encore montrer ce qui a déjà été
  // scanné pour les précédentes. Réinitialisé à l'ouverture/fermeture du formulaire (voir plus bas).
  const [scanHistory, setScanHistory] = useState<ScannedItem[]>([])
  const [adjustTarget, setAdjustTarget] = useState<{ product: ApiProduct; variant: ApiVariant } | null>(null)
  const [newQty, setNewQty] = useState('')
  const [adjustReason, setAdjustReason] = useState<StockMovementReason>('CORRECTION_MANUELLE')
  const [saving, setSaving] = useState(false)
  // Création de catégorie à la volée — indispensable ici : sans catégorie, un produit ne peut
  // pas être créé (le champ est obligatoire côté serveur), or rien ailleurs ne permet d'en créer.
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return products.filter(p => {
      const matchesCategory = categoryFilter === 'all' || String(p.category.id) === categoryFilter
      // Recherche sur TOUTES les variantes, pas seulement la première — sinon scanner/chercher
      // le code-barres d'une déclinaison secondaire ne retrouverait jamais son produit.
      const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.variants.some(v => v.barcode.toLowerCase().includes(term))
      return matchesCategory && matchesSearch
    })
  }, [products, searchTerm, categoryFilter])

  // Regroupe les produits filtrés par catégorie (dans l'ordre des catégories),
  // pour un catalogue plus lisible qu'une liste unique de 20+ articles mélangés.
  const groupedByCategory = useMemo(() => {
    const groups = categories.map(c => ({
      category: c,
      items: filtered.filter(p => p.category.id === c.id),
    })).filter(g => g.items.length > 0)
    const uncategorized = filtered.filter(p => !categories.some(c => c.id === p.category.id))
    if (uncategorized.length > 0) groups.push({ category: UNCATEGORIZED, items: uncategorized })
    return groups
  }, [filtered, categories])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setImageFile(null)
    setImagePreview(null)
    setRemoveImageFlag(false)
    setScanHistory([])
    setIsModalOpen(true)
  }

  const openEdit = (p: ApiProduct) => {
    setEditing(p)
    setForm({
      name: p.name, categoryId: String(p.category.id), unit: p.unit, expirationDate: p.expirationDate || '', emoji: p.emoji,
      variants: p.variants.map(v => ({
        id: v.id, attributes: v.attributes, barcode: v.barcode,
        price: String(v.sellingPrice), costPrice: String(v.costPrice), stock: '', lowStockThreshold: String(v.lowStockThreshold),
      })),
    })
    setFormError('')
    setImageFile(null)
    // Reprend la photo déjà uploadée comme aperçu initial — remplacée si l'utilisateur en
    // choisit une nouvelle, effacée s'il clique sur "Retirer" (voir handleRemoveImage).
    setImagePreview(p.image)
    setRemoveImageFlag(false)
    setScanHistory([])
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setImageFile(null)
    setImagePreview(null)
    setRemoveImageFlag(false)
    setScanHistory([])
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setRemoveImageFlag(false)
    setImagePreview(URL.createObjectURL(file))
  }

  // Retire la photo de l'aperçu — repli immédiat sur l'emoji tant que le formulaire n'est pas
  // enregistré ; la suppression réelle côté serveur (si le produit avait déjà une photo) n'a
  // lieu qu'à l'enregistrement (voir handleSubmit), jamais avant.
  const handleRemoveImage = () => {
    setImageFile(null)
    setImagePreview(null)
    setRemoveImageFlag(true)
  }

  const addVariantRow = () => setForm(f => ({ ...f, variants: [...f.variants, emptyVariantRow()] }))
  const removeVariantRow = (index: number) => setForm(f => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }))
  const updateVariantRow = (index: number, patch: Partial<VariantFormRow>) =>
    setForm(f => ({ ...f, variants: f.variants.map((v, i) => i === index ? { ...v, ...patch } : v) }))

  // Un seul scan remplit LA variante visée, puis referme la caméra — contrairement à la Caisse,
  // qui reste ouverte pour enchaîner plusieurs articles. L'historique, lui, survit à cette
  // fermeture (état du formulaire, pas du scanner) : rouvrir la caméra pour la variante suivante
  // montre encore ce qui a déjà été scanné pour les précédentes (voir scanHistory ci-dessus).
  const handleBarcodeScanned = (code: string) => {
    if (scannerTargetIndex !== null) {
      const index = scannerTargetIndex
      updateVariantRow(index, { barcode: code })
      const row = form.variants[index]
      const descriptor = row ? Object.values(row.attributes).filter(Boolean).join(' / ') : ''
      // Un même code déjà utilisé sur UNE AUTRE variante du même formulaire finirait rejeté par
      // le serveur (barcode unique) — mieux vaut le signaler ici, tout de suite, que de laisser
      // l'utilisateur découvrir l'erreur seulement à l'enregistrement.
      const duplicate = form.variants.some((v, i) => i !== index && v.barcode.trim() === code.trim())
      const entry: ScannedItem = {
        id: `${code}-${Date.now()}`,
        label: code,
        sublabel: duplicate
          ? 'Code déjà utilisé sur une autre variante de ce produit !'
          : (descriptor || `Variante ${index + 1}`),
        status: duplicate ? 'error' : 'success',
      }
      setScanHistory(h => [entry, ...h].slice(0, 30))
    }
    setScannerTargetIndex(null)
  }

  // Extrait un message lisible d'une erreur de validation DRF (ex: {"category": ["Ce champ est
  // obligatoire."]}) — sans ça, l'utilisateur ne voit qu'un plantage générique dans la console.
  function readableApiError(err: unknown): string {
    const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data
    if (data && typeof data === 'object') {
      const firstMessage = Object.values(data)[0]
      if (Array.isArray(firstMessage) && typeof firstMessage[0] === 'string') return firstMessage[0]
      if (typeof firstMessage === 'string') return firstMessage
    }
    return "Une erreur est survenue. Vérifie les champs et réessaie."
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    // Vérifié avant l'appel serveur : sans catégorie sélectionnée, la création échouerait de
    // toute façon (le champ est obligatoire côté backend), autant le dire clairement tout de suite.
    if (!form.categoryId) {
      setFormError('Choisis une catégorie (ou crée-en une avec le bouton "+" ci-dessous).')
      return
    }
    setSaving(true)
    try {
      const variantsPayload: VariantInput[] = form.variants.map(v => ({
        id: v.id,
        attributes: v.attributes,
        barcode: v.barcode.trim(),
        sellingPrice: Number(v.price) || 0,
        costPrice: Number(v.costPrice) || 0,
        lowStockThreshold: Number(v.lowStockThreshold) || 0,
      }))
      const payload = {
        category: Number(form.categoryId),
        name: form.name.trim(),
        unit: form.unit,
        expirationDate: form.expirationDate || null,
        emoji: form.emoji || '📦',
        variants: variantsPayload,
      }
      const result = editing
        ? await updateProduct.mutateAsync({ id: editing.id, input: payload })
        : await createProduct.mutateAsync(payload)

      // Photo : appel SÉPARÉ après coup (voir upload_image côté backend, jamais mêlé au JSON
      // ci-dessus) — un fichier choisi prime toujours sur un retrait, qui ne s'applique que si
      // le produit avait déjà une photo à retirer (rien à faire pour un produit tout juste créé).
      if (imageFile) {
        await uploadProductImage.mutateAsync({ id: result.id, file: imageFile })
      } else if (removeImageFlag && editing?.image) {
        await deleteProductImage.mutateAsync(result.id)
      }

      // Réapparie chaque ligne du formulaire avec LA variante correspondante renvoyée par le
      // serveur — par id pour une variante déjà existante, par ordre d'apparition parmi les
      // nouvelles sinon (le serveur les crée dans le même ordre que le tableau envoyé, voir
      // catalog/serializers.py::ProductWriteSerializer).
      const existingIds = new Set((editing?.variants ?? []).map(v => v.id))
      const newFormRows = form.variants.filter(v => !v.id)
      const newServerVariants = result.variants.filter(v => !existingIds.has(v.id))
      const matchServerVariant = (row: VariantFormRow) =>
        row.id ? result.variants.find(v => v.id === row.id) : newServerVariants[newFormRows.indexOf(row)]

      const generatedBarcodes: BarcodeItem[] = []
      for (const row of form.variants) {
        const serverVariant = matchServerVariant(row)
        if (!serverVariant) continue
        // Stock initial : jamais un champ direct de la variante (voir Backend/docs/schema.md) —
        // se pose comme un premier StockMovement ENTREE, uniquement pour une variante NEUVE.
        if (!row.id) {
          const initialStock = Number(row.stock) || 0
          if (initialStock > 0) {
            await adjustStock.mutateAsync({ stockId: serverVariant.stock.id, diff: initialStock, reason: 'STOCK_INITIAL' })
          }
        }
        // Code-barres laissé vide -> le serveur en a généré un (EAN-13 interne) -> à imprimer.
        if (!row.barcode.trim()) {
          generatedBarcodes.push({ barcode: serverVariant.barcode, emoji: payload.emoji, name: variantLabel(result, serverVariant), price: serverVariant.sellingPrice })
        }
      }

      closeModal()
      if (generatedBarcodes.length > 0) setBarcodeItems(generatedBarcodes)
    } catch (err) {
      setFormError(readableApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const openCategoryModal = () => {
    setNewCategoryName('')
    setCategoryError('')
    setIsCategoryModalOpen(true)
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newCategoryName.trim()
    if (!name) return
    setCreatingCategory(true)
    setCategoryError('')
    try {
      const created = await createCategory.mutateAsync({ name })
      // Sélectionne aussitôt la catégorie qu'on vient de créer, pour enchaîner directement sur
      // la création du produit sans repasser par le select.
      setForm(f => ({ ...f, categoryId: String(created.id) }))
      setIsCategoryModalOpen(false)
    } catch (err) {
      setCategoryError(readableApiError(err))
    } finally {
      setCreatingCategory(false)
    }
  }

  const openAdjust = (product: ApiProduct, variant: ApiVariant) => {
    setAdjustTarget({ product, variant })
    setNewQty(String(variant.stock.availableQty))
    setAdjustReason('CORRECTION_MANUELLE')
  }

  const closeAdjust = () => {
    setAdjustTarget(null)
    setNewQty('')
  }

  const submitAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustTarget) return
    const { variant } = adjustTarget
    const diff = (Number(newQty) || 0) - variant.stock.availableQty
    if (diff !== 0) {
      await adjustStock.mutateAsync({ stockId: variant.stock.id, diff, reason: adjustReason })
    }
    closeAdjust()
  }

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Chargement du catalogue...</div>
  }
  if (isError) {
    return <div className="p-12 text-center text-destructive font-medium">Impossible de charger les produits. Vérifie que le serveur répond.</div>
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            Produits
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Catalogue de la boutique — {products.length} article(s)</p>
        </div>
        <Button onClick={openCreate} className="rounded-xl px-6 h-12 gap-2 font-bold">
          <Plus className="w-5 h-5" />
          Nouveau Produit
        </Button>
      </div>

      <Card className="p-4 border-border/50 shadow-sm bg-card/50">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou code-barres..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-11 h-12 rounded-xl"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="h-12 px-4 rounded-xl border border-border/50 bg-background text-sm font-bold"
          >
            <option value="all">Toutes les catégories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </Card>

      <div className="space-y-8">
        {groupedByCategory.map(({ category, items }) => (
          <div key={category.id} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <h2 className="text-sm font-black uppercase tracking-wider text-foreground">{category.name}</h2>
              <Badge variant="outline" className="text-[12px] font-bold">{items.length}</Badge>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/40">
              {items.map(p => {
                const single = p.variants.length <= 1
                const variant = p.variants[0]
                return (
                  <div key={p.id} className="p-4 hover:bg-muted/30 transition-colors">
                    {/* flex-wrap : sur un petit écran, le nom passe à la ligne plutôt que d'être
                        coupé (jamais de `truncate` sur un nom de produit — voir aussi le prix/
                        stock/actions qui basculent sur une 2e ligne au besoin). */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-lg shrink-0 overflow-hidden">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        ) : p.emoji}
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <div className="font-bold text-foreground text-sm break-words">{p.name}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[12px] text-muted-foreground uppercase font-bold">{UNIT_LABELS[p.unit]}</span>
                          {single ? (
                            <span className="font-mono text-[12px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{variant.barcode}</span>
                          ) : (
                            <Badge variant="outline" className="text-[12px] font-bold">{p.variants.length} variantes</Badge>
                          )}
                        </div>
                      </div>
                      {/* basis-full sur mobile : ce groupe (prix/stock/actions) bascule ENTIER
                          sur sa propre ligne plutôt que de se fragmenter — jamais chaque élément
                          qui se replie séparément dans le désordre. */}
                      <div className="flex items-center gap-3 basis-full sm:basis-auto justify-between sm:justify-end ml-0 sm:ml-auto">
                        {single && (
                          <>
                            <div className="text-right shrink-0 w-24 sm:w-28">
                              <div className="font-bold text-sm">{variant.sellingPrice.toLocaleString()} FCFA</div>
                            </div>
                            <div className="text-center shrink-0 w-14">
                              <span className={`font-black ${
                                variant.stock.availableQty === 0 ? 'text-destructive'
                                  : variant.stock.availableQty <= variant.lowStockThreshold ? 'text-orange-500'
                                  : 'text-green-600'
                              }`}>
                                {variant.stock.availableQty}
                              </span>
                            </div>
                          </>
                        )}
                        <div className="flex items-center justify-end gap-1 shrink-0">
                          {single && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Ajuster le stock" onClick={() => openAdjust(p, variant)}>
                                <Wrench className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8" title="Voir le code-barres à scanner"
                                onClick={() => setBarcodeItems([{ barcode: variant.barcode, emoji: p.emoji, name: p.name, price: variant.sellingPrice }])}
                              >
                                <ScanBarcode className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {!single && (
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8" title="Imprimer les codes-barres des variantes"
                              onClick={() => setBarcodeItems(p.variants.map(v => ({ barcode: v.barcode, emoji: p.emoji, name: variantLabel(p, v), price: v.sellingPrice })))}
                            >
                              <ScanBarcode className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={() => { if (confirm('Supprimer ce produit ?')) deleteProduct.mutate(p.id) }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    {!single && (
                      <div className="mt-3 ml-[52px] space-y-1.5">
                        {p.variants.map(v => (
                          <div key={v.id} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-muted/30">
                            <span className="flex-1 min-w-0 text-xs font-semibold truncate">
                              {Object.values(v.attributes).filter(Boolean).join(' / ') || 'Sans déclinaison'}
                            </span>
                            <span className="font-mono text-[12px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 hidden sm:inline">{v.barcode}</span>
                            <span className="font-bold text-xs shrink-0 w-24 text-right">{v.sellingPrice.toLocaleString()} FCFA</span>
                            <span className={`text-center shrink-0 w-9 font-black text-xs ${
                              v.stock.availableQty === 0 ? 'text-destructive' : v.stock.availableQty <= v.lowStockThreshold ? 'text-orange-500' : 'text-green-600'
                            }`}>
                              {v.stock.availableQty}
                            </span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Ajuster le stock" onClick={() => openAdjust(p, v)}>
                                <Wrench className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7" title="Voir le code-barres à scanner"
                                onClick={() => setBarcodeItems([{ barcode: v.barcode, emoji: p.emoji, name: variantLabel(p, v), price: v.sellingPrice }])}
                              >
                                <ScanBarcode className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground rounded-2xl border border-dashed border-border/50">Aucun produit trouvé.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <Card className="relative w-full max-w-lg shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">{editing ? 'Modifier Produit' : 'Nouveau Produit'}</h2>
              <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-[64px_1fr] gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Photo</label>
                  {/* Aperçu carré : la vraie photo si présente (locale via blob:// avant upload,
                      ou déjà enregistrée en édition), sinon repli sur l'emoji — jamais les deux
                      en même temps, voir la logique de imagePreview/form.emoji ci-dessous. */}
                  <div className="relative w-16 h-16">
                    <div className="w-16 h-16 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-2xl overflow-hidden">
                      {imagePreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                      ) : (form.emoji || '📦')}
                    </div>
                    <label
                      htmlFor="product-image-input"
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer border-2 border-card"
                      title="Choisir une photo"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </label>
                    <input id="product-image-input" type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </div>
                  {imagePreview && (
                    <button type="button" onClick={handleRemoveImage} className="text-[11px] font-bold text-destructive hover:underline">
                      Retirer
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Nom du produit</label>
                  <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Sucre en poudre (1kg)" className="h-11" />
                  <label className="text-[11px] font-bold text-muted-foreground uppercase">Emoji de secours (si pas de photo)</label>
                  <Input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} className="h-9 w-16 text-center" maxLength={2} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Catégorie</label>
                    <button
                      type="button" onClick={openCategoryModal}
                      className="flex items-center gap-1 text-[13px] font-bold text-primary hover:underline"
                    >
                      <FolderPlus className="w-3.5 h-3.5" /> Nouvelle
                    </button>
                  </div>
                  <select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm">
                    <option value="">Sélectionner...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {categories.length === 0 && (
                    <p className="text-[13px] text-muted-foreground">Aucune catégorie pour cette boutique — crée-en une avec le bouton ci-dessus.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Unité</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value as Unit })} className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm">
                    {Object.entries(UNIT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Date de péremption (optionnel)</label>
                <Input type="date" value={form.expirationDate} onChange={e => setForm({ ...form, expirationDate: e.target.value })} className="h-11" />
              </div>

              <div className="space-y-3 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between pt-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">
                    {form.variants.length > 1 ? `Variantes (${form.variants.length})` : 'Détails de vente'}
                  </label>
                  <button type="button" onClick={addVariantRow} className="flex items-center gap-1 text-[13px] font-bold text-primary hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Ajouter une variante
                  </button>
                </div>
                {form.variants.length > 1 && (
                  <p className="text-[13px] text-muted-foreground">
                    Produit à déclinaisons — chaque variante a son propre prix, stock et code-barres.
                  </p>
                )}
                {variantAttributeNames.length === 0 && (
                  <p className="text-[13px] text-muted-foreground">
                    Aucun attribut de variante configuré pour cette boutique (Taille, Couleur, Format...) — à définir dans Réglages pour les distinguer.
                  </p>
                )}

                {form.variants.map((row, index) => (
                  <div key={index} className="p-3 rounded-xl border border-border/50 space-y-3">
                    {form.variants.length > 1 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-black text-muted-foreground uppercase">Variante {index + 1}</span>
                        <button type="button" onClick={() => removeVariantRow(index)} className="text-destructive hover:opacity-70" title="Retirer cette variante">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {variantAttributeNames.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {variantAttributeNames.map(attrName => (
                          <div key={attrName} className="space-y-1">
                            <label className="text-[12px] font-bold text-muted-foreground uppercase">{attrName}</label>
                            <Input
                              value={row.attributes[attrName] ?? ''}
                              onChange={e => updateVariantRow(index, { attributes: { ...row.attributes, [attrName]: e.target.value } })}
                              placeholder={`Ex: ${attrName}`}
                              className="h-10 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-[12px] font-bold text-muted-foreground uppercase">Code-barres</label>
                      <div className="flex gap-2">
                        <Input
                          value={row.barcode} onChange={e => updateVariantRow(index, { barcode: e.target.value })}
                          placeholder="Vide = généré automatiquement" className="h-10 text-sm font-mono"
                        />
                        {/* Ouvre la caméra pour scanner le vrai code-barres imprimé sur le produit
                            plutôt que de le retaper à la main — voir handleBarcodeScanned. */}
                        <Button
                          type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" title="Scanner le code-barres"
                          onClick={() => setScannerTargetIndex(index)}
                        >
                          <ScanBarcode className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-muted-foreground uppercase">Prix de vente (FCFA)</label>
                        <Input required type="number" min="0" value={row.price} onChange={e => updateVariantRow(index, { price: e.target.value })} className="h-10 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-muted-foreground uppercase">Prix d&apos;achat (FCFA)</label>
                        <Input required type="number" min="0" value={row.costPrice} onChange={e => updateVariantRow(index, { costPrice: e.target.value })} className="h-10 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {!row.id && (
                        <div className="space-y-1">
                          <label className="text-[12px] font-bold text-muted-foreground uppercase">Stock initial</label>
                          <Input required type="number" min="0" value={row.stock} onChange={e => updateVariantRow(index, { stock: e.target.value })} className="h-10 text-sm" />
                        </div>
                      )}
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-muted-foreground uppercase">Seuil alerte</label>
                        <Input required type="number" min="0" value={row.lowStockThreshold} onChange={e => updateVariantRow(index, { lowStockThreshold: e.target.value })} className="h-10 text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-[13px] text-muted-foreground">Code-barres vide -&gt; un code est généré et prêt à imprimer/coller sur le produit après l&apos;enregistrement.</p>
              </div>

              {formError && (
                <p className="text-sm font-medium text-destructive bg-destructive/10 rounded-xl px-3 py-2">{formError}</p>
              )}
              <div className="pt-4 flex gap-3">
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" disabled={saving} className="flex-1 h-11 rounded-xl font-bold gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Enregistrer
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsCategoryModalOpen(false)} />
          <Card className="relative w-full max-w-sm shadow-2xl border-border/50">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-lg font-black">Nouvelle catégorie</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsCategoryModalOpen(false)} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <form onSubmit={handleCreateCategory} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nom</label>
                <Input
                  required autoFocus value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Ex: Boissons"
                  className="h-11"
                />
              </div>
              {categoryError && (
                <p className="text-sm font-medium text-destructive bg-destructive/10 rounded-xl px-3 py-2">{categoryError}</p>
              )}
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={() => setIsCategoryModalOpen(false)} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" disabled={creatingCategory} className="flex-1 h-11 rounded-xl font-bold gap-2">
                  {creatingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Créer
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <BarcodeDisplayModal items={barcodeItems} onClose={() => setBarcodeItems(null)} />
      <BarcodeScannerModal
        isOpen={scannerTargetIndex !== null}
        onClose={() => setScannerTargetIndex(null)}
        onScan={handleBarcodeScanned}
        scannedItems={scanHistory}
      />

      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeAdjust} />
          <Card className="relative w-full max-w-md shadow-2xl border-border/50">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black">Ajuster le stock</h2>
              <Button variant="ghost" size="icon" onClick={closeAdjust} className="rounded-full"><X className="w-5 h-5" /></Button>
            </div>
            <form onSubmit={submitAdjust} className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {adjustTarget.product.emoji} <span className="font-bold text-foreground">{variantLabel(adjustTarget.product, adjustTarget.variant)}</span> — stock actuel :{' '}
                <span className="font-bold">{adjustTarget.variant.stock.availableQty}</span>
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nouveau stock réel</label>
                <Input required type="number" min="0" value={newQty} onChange={e => setNewQty(e.target.value)} className="h-11" autoFocus />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Raison</label>
                <select
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value as StockMovementReason)}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm"
                >
                  {STOCK_MOVEMENT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="pt-2 flex gap-3">
                <Button type="button" variant="outline" onClick={closeAdjust} className="flex-1 h-11 rounded-xl font-bold">Annuler</Button>
                <Button type="submit" className="flex-1 h-11 rounded-xl font-bold gap-2"><Save className="w-4 h-4" />Valider</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
