# serializers : briques de base de DRF.
from rest_framework import serializers

from boutiques.serializers import BoutiqueScopedWriteSerializerMixin

from .models import Stock, StockMovement


# Sérialiseur de lecture du niveau de stock — imbriqué dans la fiche produit/variante (voir
# catalog/serializers.py), jamais modifié directement (voir le commentaire du modèle Stock).
class StockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stock
        # `id` exposé en lecture : indispensable pour que le client puisse ensuite référencer
        # CETTE ligne de stock (`stock: <id>`) en créant un `StockMovement` manuel — la ligne
        # est imbriquée ici, mais aucune autre route ne l'expose seule.
        fields = ['id', 'on_hand_qty', 'reserved_qty', 'available_qty', 'last_counted_at']
        read_only_fields = fields


# Sérialiseur de lecture d'un mouvement de stock.
class StockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovement
        fields = [
            'id', 'boutique', 'stock', 'product', 'sale_line', 'purchase_line', 'user',
            'movement_type', 'quantite', 'reason', 'date', 'created_at', 'notes',
        ]
        read_only_fields = fields


# Sérialiseur d'écriture — seuls les mouvements MANUELS passent par ici (une vente ou un achat
# créent leurs propres mouvements automatiquement, voir sales/purchases).
class StockMovementWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'products'

    class Meta:
        model = StockMovement
        # `stock` (variante précise) OU `product` seul (mouvement sans variante identifiée) —
        # au moins l'un des deux est nécessaire, vérifié dans validate() ci-dessous.
        fields = ['id', 'boutique', 'stock', 'product', 'movement_type', 'quantite', 'reason', 'notes']
        read_only_fields = ['id']

    def validate(self, attrs):
        if not attrs.get('stock') and not attrs.get('product'):
            raise serializers.ValidationError("Préciser au moins 'stock' (variante) ou 'product'.")
        # L'utilisateur qui déclenche ce mouvement manuel est toujours le compte connecté.
        attrs['user'] = self.context['request'].user
        return attrs
