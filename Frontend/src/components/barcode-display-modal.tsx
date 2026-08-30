'use client'

import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { X, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Forme minimale requise (n'importe quel produit, mock ou réel, la respecte)
// plutôt que le type `Product` du store mock — ce composant n'a besoin que
// de ces 4 champs, pas de tout le reste (catégorie, boutique...).
interface BarcodeDisplayModalProps {
  product: { barcode: string; emoji: string; name: string; price: number } | null
  onClose: () => void
}

// Génère un vrai code-barres scannable (motif de barres, pas juste le texte)
// pour pouvoir tester le scan caméra avec les produits fictifs.
export default function BarcodeDisplayModal({ product, onClose }: BarcodeDisplayModalProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!product || !svgRef.current) return
    try {
      JsBarcode(svgRef.current, product.barcode, {
        format: 'EAN13',
        width: 2.4,
        height: 90,
        fontSize: 16,
        margin: 10,
      })
    } catch {
      // Code qui ne respecte pas le format EAN-13 (ex: mauvaise longueur) -> repli en CODE128
      JsBarcode(svgRef.current, product.barcode, { format: 'CODE128', width: 2.4, height: 90, fontSize: 16, margin: 10 })
    }
  }, [product])

  if (!product) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:p-0 print:static">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm print:hidden" onClick={onClose} />
      <Card className="relative w-full max-w-sm shadow-2xl border-border/50 print:shadow-none print:border-0">
        <div className="p-6 border-b border-border/50 flex items-center justify-between print:hidden">
          <h2 className="text-lg font-black">Code-barres à scanner</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="p-6 flex flex-col items-center gap-3 text-center">
          <p className="font-bold">{product.emoji} {product.name}</p>
          <p className="text-sm text-muted-foreground">{product.price.toLocaleString()} FCFA</p>
          <svg ref={svgRef} className="max-w-full" />
          <p className="text-[11px] text-muted-foreground print:hidden">
            Affiche ceci sur un autre écran (ou imprime-le), puis scanne-le depuis la page Caisse.
          </p>
        </div>
        <div className="p-6 pt-0 print:hidden">
          <Button onClick={() => window.print()} className="w-full h-11 rounded-xl font-bold gap-2">
            <Printer className="w-4 h-4" />
            Imprimer
          </Button>
        </div>
      </Card>
    </div>
  )
}
