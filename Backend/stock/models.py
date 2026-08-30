# models : briques de base pour définir des modèles Django.
from django.db import models

# BoutiqueScopedQuerySet : applique le cloisonnement multi-tenant (voir boutiques/querysets.py).
from boutiques.querysets import BoutiqueScopedQuerySet


# Niveau de stock d'UNE variante précise — jamais modifié à la main directement, toujours
# recalculé par un signal à partir des StockMovement (voir signals.py) : un seul point de vérité.
class Stock(models.Model):
    id = models.AutoField(primary_key=True)
    # Relation un-à-un : chaque variante a au plus UNE ligne de stock — CASCADE : supprimer la
    # variante supprime sa ligne de stock (elle n'a pas de sens sans elle).
    variant = models.OneToOneField('catalog.Variant', on_delete=models.CASCADE, related_name='stock')
    # Quantité physiquement présente en magasin.
    on_hand_qty = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Quantité réservée (ex: pour une commande en attente de préparation), non disponible à la vente.
    reserved_qty = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Quantité réellement disponible à la vente — en pratique on_hand_qty - reserved_qty.
    available_qty = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Date du dernier comptage physique connu (renseignée lors d'un inventaire).
    last_counted_at = models.DateField(null=True, blank=True)

    class Meta:
        # Nom de table court, identique à SoftCosy.
        db_table = 'stock'
        verbose_name = 'Stock'
        verbose_name_plural = 'Stocks'

    def __str__(self):
        return f'Stock #{self.id} — {self.variant}'


# Un mouvement de stock — le SEUL moyen légitime de faire varier une quantité en stock. Ledger
# d'ajout uniquement (jamais modifié après coup) : chaque vente, achat, ajustement ou inventaire
# écrit une ligne ici, et un signal recalcule le Stock correspondant à chaque écriture.
class StockMovement(models.Model):
    # Les 3 grandes familles de mouvement.
    class MovementType(models.TextChoices):
        ENTREE = 'ENTREE', 'Entrée'
        SORTIE = 'SORTIE', 'Sortie'
        AJUSTEMENT = 'AJUSTEMENT', 'Ajustement'

    # 16 raisons précises, reprises telles quelles de SoftCosy (déjà génériques et éprouvées).
    class Reason(models.TextChoices):
        STOCK_INITIAL = 'STOCK_INITIAL', 'Stock initial (création produit)'
        COMMANDE_LIVREE = 'COMMANDE_LIVREE', 'Commande livrée'
        ACHAT_FOURNISSEUR = 'ACHAT_FOURNISSEUR', 'Achat fournisseur'
        RETOUR_TEST = 'RETOUR_TEST', 'Retour de test'
        CORRECTION_INVENTAIRE = 'CORRECTION_INVENTAIRE', 'Correction inventaire'
        CADEAU_PROMO = 'CADEAU_PROMO', 'Cadeau/Promotion'
        VENTE = 'VENTE', 'Vente'
        SORTIE_MAGASIN = 'SORTIE_MAGASIN', 'Sortie magasin'
        CASSE_PERTE = 'CASSE_PERTE', 'Casse/Perte'
        ECHANTILLON = 'ECHANTILLON', 'Échantillon'
        INVENTAIRE_ANNUEL = 'INVENTAIRE_ANNUEL', 'Inventaire annuel'
        CORRECTION_MANUELLE = 'CORRECTION_MANUELLE', 'Correction manuelle'
        PEREMPTION = 'PEREMPTION', 'Péremption'
        RETOUR_CLIENT = 'RETOUR_CLIENT', 'Retour client'
        REMBOURSEMENT = 'REMBOURSEMENT', 'Remboursement'
        AUTRE = 'AUTRE', 'Autre'

    id = models.AutoField(primary_key=True)
    # Boutique concernée — NOUVEAU par rapport à SoftCosy (mono-boutique, ce champ n'existait pas).
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='stock_movements')
    # Ligne de stock affectée — optionnelle : voir `product` ci-dessous pour le cas où la
    # variante n'est pas encore connue.
    stock = models.ForeignKey(Stock, on_delete=models.CASCADE, related_name='movements', null=True, blank=True)
    # Pour un mouvement au niveau produit (sans variante précise identifiée) — SET_NULL : la
    # trace du mouvement doit survivre même si le produit est supprimé plus tard.
    product = models.ForeignKey('catalog.Product', on_delete=models.SET_NULL, related_name='stock_movements', null=True, blank=True)
    # Si ce mouvement vient d'une vente, lien vers la ligne de vente concernée.
    sale_line = models.ForeignKey('sales.SaleLine', on_delete=models.SET_NULL, related_name='stock_movements', null=True, blank=True)
    # Si ce mouvement vient d'un achat fournisseur, lien vers la ligne d'achat concernée.
    purchase_line = models.ForeignKey('purchases.PurchaseLine', on_delete=models.SET_NULL, related_name='stock_movements', null=True, blank=True)
    # Qui a déclenché ce mouvement (utile pour l'audit) — SET_NULL : l'historique reste même si
    # le compte est supprimé plus tard.
    user = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, related_name='stock_movements', null=True, blank=True)
    # Sens du mouvement.
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    # Quantité — TOUJOURS signée (négative = le stock baisse) : nom de champ exact repris de
    # SoftCosy (en français dans son code), en Decimal pour supporter les unités fractionnaires (kg, L).
    quantite = models.DecimalField(max_digits=10, decimal_places=2)
    # Pourquoi ce mouvement a eu lieu.
    reason = models.CharField(max_length=32, choices=Reason.choices, null=True, blank=True)
    # Date seule (sans heure) — conservée telle quelle : des scripts de sauvegarde/nettoyage
    # comparent une date exacte, et une statistique du tableau de bord aussi.
    date = models.DateField(auto_now_add=True)
    # Horodatage précis (date + heure) — sert au tri chronologique réel, ce que `date` seul ne
    # permet pas de distinguer entre plusieurs mouvements survenus le même jour.
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    # Remarques libres éventuelles.
    notes = models.TextField(null=True, blank=True)

    # Manager cloisonné : StockMovement.objects.for_user(user) — indispensable, ce modèle a un
    # champ `boutique` direct et sa vue (StockMovementViewSet) hérite de BoutiqueScopedModelViewSet,
    # qui appelle justement `.for_user(user)` dans get_queryset().
    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        db_table = 'stockmovement'
        verbose_name = 'Mouvement de stock'
        verbose_name_plural = 'Mouvements de stock'
        # Les plus récents en premier.
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_movement_type_display()} — {self.quantite:+}'
