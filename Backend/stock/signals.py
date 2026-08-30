# Decimal : pour la valeur de repli "zéro" avec le bon type (pas un int, un vrai Decimal).
from decimal import Decimal

# F : référence un autre champ du même modèle dans une requête (ex: total - reserved_qty).
# Sum : agrège (additionne) une colonne sur un ensemble de lignes.
from django.db.models import F, Sum
# post_save/post_delete : signaux déclenchés après la sauvegarde/suppression d'une ligne.
from django.db.models.signals import post_delete, post_save
# receiver : décorateur qui connecte une fonction à un signal.
from django.dispatch import receiver

from .models import Stock, StockMovement


# Recalcule le Stock d'UNE variante à partir de la somme de tous ses mouvements — jamais
# l'inverse (Stock.on_hand_qty n'est JAMAIS écrit à la main ailleurs dans le code).
def _recompute_stock(stock_id):
    # Un mouvement "produit sans variante" (stock_id vide) n'a pas de ligne Stock à recalculer.
    if stock_id is None:
        return
    # Additionne toutes les quantités signées des mouvements de cette ligne de stock.
    total = StockMovement.objects.filter(stock_id=stock_id).aggregate(total=Sum('quantite'))['total']
    # Aucun mouvement -> stock à zéro (pas None, pour rester cohérent avec le type Decimal du champ).
    total = total or Decimal('0')
    # Met à jour on_hand_qty ET available_qty (= on_hand_qty - reserved_qty) en une seule requête.
    Stock.objects.filter(pk=stock_id).update(on_hand_qty=total, available_qty=total - F('reserved_qty'))


# Déclenché après la création OU la modification d'un mouvement de stock.
@receiver(post_save, sender=StockMovement)
def on_stock_movement_saved(sender, instance, **kwargs):
    _recompute_stock(instance.stock_id)


# Déclenché après la suppression d'un mouvement de stock (rare, mais doit rester cohérent).
@receiver(post_delete, sender=StockMovement)
def on_stock_movement_deleted(sender, instance, **kwargs):
    _recompute_stock(instance.stock_id)
