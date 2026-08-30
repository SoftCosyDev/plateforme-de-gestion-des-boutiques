# Decimal : calcul monétaire exact (jamais de float pour de l'argent).
from decimal import Decimal

# transaction.atomic : la vente + ses lignes + les mouvements de stock se créent ensemble, ou rien.
from django.db import transaction
# timezone.now : horodatage par défaut d'une vente non antidatée.
from django.utils import timezone
# F : référence un autre champ dans une requête (incrémente l'ardoise sans la relire d'abord).
from django.db.models import F
# serializers : briques de base de DRF.
from rest_framework import serializers

from boutiques.serializers import BoutiqueScopedWriteSerializerMixin
from catalog.models import Variant
from customers.models import Customer
from stock.models import StockMovement

from .models import Sale, SaleLine


# Sérialiseur de lecture d'une ligne de vente.
class SaleLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleLine
        fields = ['id', 'product', 'variant', 'quantity', 'unit_price', 'line_discount', 'line_total']
        read_only_fields = fields


# Sérialiseur de lecture d'une vente complète, avec ses lignes imbriquées.
class SaleSerializer(serializers.ModelSerializer):
    lines = SaleLineSerializer(many=True, read_only=True)

    class Meta:
        model = Sale
        fields = [
            'id', 'boutique', 'invoice_number', 'employee', 'customer', 'customer_name',
            'sold_at', 'channel', 'payment_mode', 'mobile_money_reference', 'mobile_money_sender',
            'subtotal', 'discount_amount', 'total', 'status', 'notes', 'created_at', 'lines',
        ]
        read_only_fields = fields


# Une ligne envoyée par le client au moment de la vente — le CAISSIER choisit une VARIANTE
# précise (le produit s'en déduit côté serveur, jamais transmis directement) ; `unit_price` est
# facultatif et retombe sur le prix catalogue de la variante si absent.
class SaleLineWriteSerializer(serializers.Serializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=Variant.objects.all())
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=Decimal('0'))
    line_discount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal('0'))


class SaleWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'cashier'
    lines = SaleLineWriteSerializer(many=True, write_only=True)

    class Meta:
        model = Sale
        fields = [
            'id', 'boutique', 'customer', 'sold_at', 'channel', 'payment_mode',
            'mobile_money_reference', 'mobile_money_sender', 'discount_amount', 'notes', 'lines',
        ]
        read_only_fields = ['id']

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Une vente doit contenir au moins une ligne.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        user = self.context['request'].user

        # Le caissier est TOUJOURS l'employé connecté, jamais une valeur reçue du client
        # (IsEmployeeAccount garantit que ce compte a bien un employee_profile).
        validated_data['employee'] = user.employee_profile

        # Sans horodatage explicite (vente antidatée, cas rare), la vente a lieu MAINTENANT —
        # sans ce repli, `sold_at` resterait NULL pour toute vente comptoir normale, rendant la
        # vente invisible dans le graphique mensuel et le compteur "remboursements du jour" des
        # rapports (tous deux filtrent sur `sold_at`, voir reports/views.py).
        validated_data.setdefault('sold_at', timezone.now())

        customer = validated_data.get('customer')
        # Nom recopié au moment de la vente (utile même sans fiche client complète).
        validated_data['customer_name'] = customer.name if customer else ''

        # Calcule chaque ligne AVANT de créer la vente, pour connaître le sous-total d'un coup.
        computed_lines = []
        subtotal = Decimal('0')
        for line in lines_data:
            variant = line['variant']
            quantity = line['quantity']
            unit_price = line.get('unit_price')
            # Prix catalogue de la variante si le caissier n'a rien saisi de spécifique.
            if unit_price is None:
                unit_price = variant.selling_price
            line_discount = line.get('line_discount') or Decimal('0')
            line_total = (quantity * unit_price) - line_discount
            computed_lines.append({
                'variant': variant, 'quantity': quantity, 'unit_price': unit_price,
                'line_discount': line_discount, 'line_total': line_total,
            })
            subtotal += line_total

        validated_data['subtotal'] = subtotal
        validated_data['total'] = subtotal - validated_data.get('discount_amount', Decimal('0'))
        # Statut déduit du mode de paiement — cash/mobile money sont encaissés immédiatement,
        # un crédit reste dû tant qu'aucun paiement n'a été enregistré (jamais NONPAYE par
        # défaut pour une vente réglée comptant, ce qui n'aurait aucun sens).
        validated_data['status'] = (
            Sale.Status.NONPAYE if validated_data.get('payment_mode') == Sale.PaymentMode.CREDIT
            else Sale.Status.PAYE
        )

        sale = Sale.objects.create(**validated_data)

        for line in computed_lines:
            variant = line['variant']
            sale_line = SaleLine.objects.create(
                sale=sale, product=variant.product, variant=variant,
                quantity=line['quantity'], unit_price=line['unit_price'],
                line_discount=line['line_discount'], line_total=line['line_total'],
            )
            # Fait baisser le stock de la variante via le signal de l'app stock (Étape 2) —
            # jamais une écriture directe sur Stock.on_hand_qty ici.
            StockMovement.objects.create(
                boutique=sale.boutique, stock=variant.stock, product=variant.product,
                sale_line=sale_line, user=user, movement_type=StockMovement.MovementType.SORTIE,
                quantite=-line['quantity'], reason=StockMovement.Reason.VENTE,
            )

        # Vente à crédit : augmente l'ardoise du client d'autant que le total de la vente.
        if sale.payment_mode == Sale.PaymentMode.CREDIT and customer:
            Customer.objects.filter(pk=customer.pk).update(balance_due=F('balance_due') + sale.total)

        return sale
