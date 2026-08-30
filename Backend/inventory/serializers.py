# serializers : briques de base de DRF.
from rest_framework import serializers

from boutiques.serializers import BoutiqueScopedWriteSerializerMixin
from catalog.models import Variant

from .models import InventoryCount, InventoryLine


class InventoryLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryLine
        fields = ['id', 'inventory_count', 'product', 'variant', 'expected_qty', 'counted_qty', 'discrepancy']
        # Le client ne modifie JAMAIS expected_qty/discrepancy directement, ni la ligne parente —
        # seul counted_qty se saisit, via InventoryLineUpdateSerializer (voir plus bas).
        read_only_fields = ['id', 'inventory_count', 'product', 'variant', 'expected_qty', 'discrepancy']


class InventoryCountSerializer(serializers.ModelSerializer):
    lines = InventoryLineSerializer(many=True, read_only=True)

    class Meta:
        model = InventoryCount
        fields = [
            'id', 'boutique', 'status', 'notes', 'created_at', 'user',
            'total_variantes', 'quantite_comptee', 'ecart', 'lines',
        ]
        read_only_fields = fields


# Un élément à compter, envoyé à l'ouverture d'une session d'inventaire — juste la variante,
# `expected_qty` est calculé côté serveur depuis le stock réel au moment du lancement.
class _InventoryLineInputSerializer(serializers.Serializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=Variant.objects.all())


class InventoryCountWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'inventory'
    lines = _InventoryLineInputSerializer(many=True, write_only=True)

    class Meta:
        model = InventoryCount
        fields = ['id', 'boutique', 'notes', 'lines']
        read_only_fields = ['id']

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Un inventaire doit porter sur au moins une variante.")
        return value

    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        # Qui a lancé ce comptage — toujours le compte connecté.
        validated_data['user'] = self.context['request'].user
        validated_data['total_variantes'] = len(lines_data)
        count = InventoryCount.objects.create(**validated_data)

        def expected_qty_for(variant):
            # Stock système figé au moment du lancement (voir le commentaire du modèle) — 0 si
            # la variante n'a exceptionnellement encore aucune ligne de stock.
            stock = getattr(variant, 'stock', None)
            return stock.available_qty if stock is not None else 0

        InventoryLine.objects.bulk_create([
            InventoryLine(
                inventory_count=count, product=line['variant'].product, variant=line['variant'],
                expected_qty=expected_qty_for(line['variant']),
            )
            for line in lines_data
        ])
        return count


# Enregistre le comptage physique d'UNE ligne — utilisé par InventoryLineViewSet, pas ici.
class InventoryLineUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryLine
        fields = ['id', 'counted_qty']
        read_only_fields = ['id']

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        # Calcule l'écart dès que le comptage est saisi — signé, en Decimal (voir schema.md,
        # écart volontaire par rapport à SoftCosy qui stocke ceci en texte non calculable).
        if instance.counted_qty is not None:
            instance.discrepancy = instance.counted_qty - (instance.expected_qty or 0)
            instance.save(update_fields=['discrepancy'])
        return instance
