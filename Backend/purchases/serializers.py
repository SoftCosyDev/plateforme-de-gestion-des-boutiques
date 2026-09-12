# Decimal : calcul monétaire exact.
from decimal import Decimal

# transaction.atomic : achat + lignes créés/remplacés ensemble, ou rien.
from django.db import transaction
# serializers : briques de base de DRF.
from rest_framework import serializers

from boutiques.serializers import BoutiqueScopedWriteSerializerMixin
from catalog.models import Variant

from .models import Purchase, PurchaseLine, Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ['id', 'boutique', 'name', 'phone', 'address', 'created_at']
        read_only_fields = ['id', 'created_at']


class SupplierWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'suppliers'

    class Meta:
        model = Supplier
        fields = ['id', 'boutique', 'name', 'phone', 'address']
        read_only_fields = ['id']


class PurchaseLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseLine
        fields = ['id', 'product', 'variant', 'quantity', 'unit_cost', 'line_cost', 'note', 'created_at']
        read_only_fields = fields


class PurchaseSerializer(serializers.ModelSerializer):
    lines = PurchaseLineSerializer(many=True, read_only=True)

    class Meta:
        model = Purchase
        fields = [
            'id', 'boutique', 'reference', 'supplier', 'sub_total', 'purchase_cost', 'total',
            'purchased_at', 'status', 'notes', 'created_at', 'lines',
        ]
        read_only_fields = fields


# Une ligne d'achat — comme pour les ventes, le personnel choisit une VARIANTE précise (le
# produit s'en déduit côté serveur).
class PurchaseLineWriteSerializer(serializers.Serializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=Variant.objects.all())
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))
    note = serializers.CharField(required=False, allow_blank=True)


class PurchaseWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'purchases'
    lines = PurchaseLineWriteSerializer(many=True)

    class Meta:
        model = Purchase
        fields = ['id', 'boutique', 'supplier', 'purchased_at', 'status', 'notes', 'lines']
        read_only_fields = ['id']

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Un achat doit contenir au moins une ligne.")
        return value

    # Calcule sub_total/purchase_cost/total à partir des lignes — repris de SoftCosy, qui n'a
    # pas de frais supplémentaires distincts pour l'instant (purchase_cost = total = sub_total).
    def _apply_computed_totals(self, validated_data, lines_data):
        sub_total = sum((line['quantity'] * line['unit_cost'] for line in lines_data), Decimal('0'))
        validated_data['sub_total'] = sub_total
        validated_data['purchase_cost'] = sub_total
        validated_data['total'] = sub_total
        return validated_data

    # Crée l'achat ET ses lignes en un seul appel — @transaction.atomic : si une ligne échoue
    # (variante invalide...), l'achat lui-même n'est pas créé non plus (jamais d'achat orphelin
    # sans aucune ligne).
    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        validated_data = self._apply_computed_totals(validated_data, lines_data)
        purchase = Purchase.objects.create(**validated_data)
        for line in lines_data:
            variant = line['variant']
            PurchaseLine.objects.create(
                purchase=purchase, product=variant.product, variant=variant,
                quantity=line['quantity'], unit_cost=line['unit_cost'],
                line_cost=line['quantity'] * line['unit_cost'], note=line.get('note', ''),
            )
        return purchase

    # Stratégie simple, reprise de SoftCosy : remplace TOUTES les lignes à chaque modification
    # (pas de diff ligne par ligne) — acceptable tant qu'un achat n'est pas encore "reçu".
    @transaction.atomic
    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        if lines_data is not None:
            validated_data = self._apply_computed_totals(validated_data, lines_data)
        instance = super().update(instance, validated_data)
        if lines_data is not None:
            instance.lines.all().delete()
            for line in lines_data:
                variant = line['variant']
                PurchaseLine.objects.create(
                    purchase=instance, product=variant.product, variant=variant,
                    quantity=line['quantity'], unit_cost=line['unit_cost'],
                    line_cost=line['quantity'] * line['unit_cost'], note=line.get('note', ''),
                )
        return instance
