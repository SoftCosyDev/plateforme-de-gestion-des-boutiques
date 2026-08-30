# Decimal : calcul monétaire exact.
from decimal import Decimal

# transaction.atomic : commande + lignes créées ensemble, ou rien.
from django.db import transaction
# serializers : briques de base de DRF.
from rest_framework import serializers

from boutiques.serializers import BoutiqueScopedWriteSerializerMixin
from catalog.models import Product, Variant

from .models import Order, OrderLine


class OrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderLine
        fields = ['id', 'product', 'variant', 'variant_label', 'quantity', 'unit_price', 'line_total']
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'boutique', 'customer', 'customer_name', 'customer_phone', 'delivery_address',
            'channel', 'payment_mode', 'status', 'subtotal', 'total', 'notes', 'user',
            'created_at', 'updated_at', 'lines',
        ]
        read_only_fields = fields


# Une ligne de commande envoyée par le client — `variant` est optionnel : la vitrine publique
# (pas encore construite) ne connaîtra qu'une taille/couleur en texte libre (`variant_label`),
# la résolution vers une vraie Variant reste possible mais n'est PAS automatique ici (portée
# volontairement réduite, voir Backend/docs/schema.md "Hors périmètre").
class OrderLineWriteSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    variant = serializers.PrimaryKeyRelatedField(queryset=Variant.objects.all(), required=False, allow_null=True)
    variant_label = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))


class OrderWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'orders'
    lines = OrderLineWriteSerializer(many=True)

    class Meta:
        model = Order
        fields = [
            'id', 'boutique', 'customer', 'customer_name', 'customer_phone', 'delivery_address',
            'channel', 'payment_mode', 'notes', 'lines',
        ]
        read_only_fields = ['id']

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Une commande doit contenir au moins une ligne.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        # Qui a saisi la commande — toujours le compte connecté (staff), jamais reçu du client
        # (un vrai formulaire public, "vide si saisie web", n'existe pas encore, voir schema.md).
        validated_data['user'] = self.context['request'].user
        # Saisie faite depuis l'application de gestion (pas le site web, pas encore construit).
        validated_data.setdefault('channel', Order.Channel.APPLICATION)

        # Calcule chaque ligne AVANT de créer la commande, pour connaître le sous-total d'un coup.
        computed_lines = []
        subtotal = Decimal('0')
        for line in lines_data:
            line_total = line['quantity'] * line['unit_price']
            computed_lines.append({**line, 'line_total': line_total})
            subtotal += line_total

        # Pas de remise au niveau commande (contrairement à Sale) — comme chez SoftCosy.
        validated_data['subtotal'] = subtotal
        validated_data['total'] = subtotal

        order = Order.objects.create(**validated_data)
        for line in computed_lines:
            OrderLine.objects.create(
                order=order, product=line['product'], variant=line.get('variant'),
                variant_label=line.get('variant_label', ''), quantity=line['quantity'],
                unit_price=line['unit_price'], line_total=line['line_total'],
            )
        return order
