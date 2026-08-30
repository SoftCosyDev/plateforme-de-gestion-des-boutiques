# models : briques de base pour définir des modèles Django.
from django.db import models

# BoutiqueScopedQuerySet : applique le cloisonnement multi-tenant.
from boutiques.querysets import BoutiqueScopedQuerySet


# Un fournisseur — nouveau pour Idrissou, repris de SoftCosy.
class Supplier(models.Model):
    id = models.AutoField(primary_key=True)
    # Boutique qui travaille avec ce fournisseur.
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='suppliers')
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, blank=True)
    address = models.CharField(max_length=255, blank=True)
    created_at = models.DateField(auto_now_add=True)

    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        db_table = 'supplier'
        verbose_name = 'Fournisseur'
        verbose_name_plural = 'Fournisseurs'

    def __str__(self):
        return self.name


# Une commande passée à un fournisseur pour réapprovisionner le stock.
class Purchase(models.Model):
    id = models.AutoField(primary_key=True)
    # Boutique qui passe cette commande.
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='purchases')
    # Référence auto-générée si absente (voir save() plus bas) — SEQUENCE PAR BOUTIQUE, pas
    # globale comme chez SoftCosy (mono-boutique), pour éviter toute collision entre boutiques.
    reference = models.CharField(max_length=120, blank=True)
    # Fournisseur sollicité — optionnel, SET_NULL : l'historique d'achat survit à la suppression du fournisseur.
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, related_name='purchases', null=True, blank=True)
    # Somme des lignes avant frais supplémentaires.
    sub_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Coût total de l'achat (= sub_total tant qu'il n'y a pas de frais de livraison séparés).
    purchase_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Montant final de la commande fournisseur.
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    purchased_at = models.DateField(null=True, blank=True)
    # Statut libre (pas un choix figé, comme chez SoftCosy) — le passage à "RECU" déclenche
    # automatiquement l'entrée en stock (voir la couche API, à construire à l'étape suivante).
    status = models.CharField(max_length=32, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        db_table = 'purchase'
        verbose_name = 'Achat'
        verbose_name_plural = 'Achats'
        ordering = ['-id']

    # Génère automatiquement une référence (format CMD-année-séquence) PAR BOUTIQUE si absente.
    def save(self, *args, **kwargs):
        if not self.pk and not self.reference:
            # Import différé pour éviter un import circulaire au chargement du module.
            import datetime
            year = datetime.datetime.now().year
            # Cherche le dernier achat de la MÊME boutique dont la référence est de CETTE année.
            last = Purchase.objects.filter(
                boutique=self.boutique, reference__startswith=f'CMD-{year}-'
            ).order_by('id').last()
            next_number = 1
            if last:
                try:
                    # Extrait le numéro de séquence et l'incrémente.
                    next_number = int(last.reference.split('-')[2]) + 1
                except (IndexError, ValueError):
                    next_number = 1
            # Formate sur 4 chiffres avec des zéros devant, ex: CMD-2026-0001.
            self.reference = f'CMD-{year}-{next_number:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.reference or f'Achat #{self.id}'


# Une ligne d'article d'un achat fournisseur.
class PurchaseLine(models.Model):
    id = models.AutoField(primary_key=True)
    # Achat parent — CASCADE : une ligne n'a pas de sens sans son achat.
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name='lines')
    # Produit acheté — PROTECT : on garde l'historique même si le produit est retiré du catalogue.
    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT, related_name='purchase_lines')
    # Variante précise achetée — SET_NULL : si supprimée, la ligne garde la trace du produit via `product`.
    variant = models.ForeignKey('catalog.Variant', on_delete=models.SET_NULL, related_name='purchase_lines', null=True, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Total de la ligne = quantity * unit_cost.
    line_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'purchaseline'
        verbose_name = 'Ligne d\'achat'
        verbose_name_plural = 'Lignes d\'achat'

    def __str__(self):
        return f'Ligne #{self.id} (achat {self.purchase_id})'
