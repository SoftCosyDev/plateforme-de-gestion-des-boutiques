'use client'

import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { X, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Forme minimale requise (n'importe quel produit/variante, mock ou réel, la respecte)
// plutôt que le type `ApiProduct` du store réel — ce composant n'a besoin que
// de ces 4 champs, pas de tout le reste (catégorie, boutique...).
export interface BarcodeItem {
  barcode: string
  emoji: string
  name: string
  price: number
}

interface BarcodeDisplayModalProps {
  // Tableau plutôt qu'un objet unique : un produit à plusieurs variantes (voir catalog/models.py
  // ::Variant) a plusieurs codes-barres à imprimer d'un coup, une étiquette par variante.
  items: BarcodeItem[] | null
  onClose: () => void
}

// Un seul code-barres du lot — composant séparé pour que chaque <svg> ait son propre ref sans
// jongler avec un tableau de refs.
function BarcodeRow({ item }: { item: BarcodeItem }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    try {
      JsBarcode(svgRef.current, item.barcode, {
        format: 'EAN13',
        width: 2.4,
        height: 90,
        fontSize: 16,
        margin: 10,
      })
    } catch {
      // Code qui ne respecte pas le format EAN-13 (ex: mauvaise longueur) -> repli en CODE128
      JsBarcode(svgRef.current, item.barcode, { format: 'CODE128', width: 2.4, height: 90, fontSize: 16, margin: 10 })
    }
  }, [item])

  return (
    <div className="flex flex-col items-center gap-2 text-center py-4 print:break-inside-avoid">
      <p className="font-bold">{item.emoji} {item.name}</p>
      <p className="text-sm text-muted-foreground">{item.price.toLocaleString()} FCFA</p>
      <svg ref={svgRef} className="max-w-full" />
    </div>
  )
}

// Génère de vrais codes-barres scannables (motif de barres, pas juste le texte) à imprimer et
// coller sur les produits — un par variante quand un produit en a plusieurs.
export default function BarcodeDisplayModal({ items, onClose }: BarcodeDisplayModalProps) {
  if (!items || items.length === 0) return null

  return (
    // .print-area : voir globals.css — seul cet élément (et son contenu) reste visible à
    // l'impression, tout le reste de la page (derrière la modale) est masqué explicitement.
    <div className="print-area fixed inset-0 z-50 flex items-center justify-center p-4 print:p-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm print:hidden" onClick={onClose} />
      <Card className="relative w-full max-w-sm shadow-2xl border-border/50 max-h-[90vh] overflow-y-auto print:shadow-none print:border-0 print:max-h-none">
        <div className="p-6 border-b border-border/50 flex items-center justify-between print:hidden">
          <h2 className="text-lg font-black">{items.length > 1 ? `Codes-barres à scanner (${items.length})` : 'Code-barres à scanner'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="px-6 divide-y divide-border/40 print:divide-y-0">
          {items.map((item, i) => <BarcodeRow key={i} item={item} />)}
        </div>
        <p className="px-6 pb-2 text-[13px] text-muted-foreground text-center print:hidden">
          Affiche ceci sur un autre écran (ou imprime-le), puis scanne-le depuis la page Caisse.
        </p>
        <div className="p-6 pt-4 print:hidden">
          <Button onClick={() => window.print()} className="w-full h-11 rounded-xl font-bold gap-2">
            <Printer className="w-4 h-4" />
            Imprimer
          </Button>
        </div>
      </Card>
    </div>
  )
}
