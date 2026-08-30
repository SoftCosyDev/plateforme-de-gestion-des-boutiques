# transaction.atomic : garantit que produit + variantes + stocks sont créés ensemble, ou rien.
from django.db import transaction
# serializers : briques de base de DRF.
from rest_framework import serializers

from boutiques.serializers import BoutiqueScopedWriteSerializerMixin
from stock.models import Stock
from stock.serializers import StockSerializer

from .models import Category, Product, Variant


# Sérialiseur de lecture d'une catégorie.
class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'boutique', 'name', 'description', 'image_url']
        read_only_fields = ['id']


# Sérialiseur d'écriture — même fonctionnalité que Product ('products'), une catégorie n'a de
# sens que si le catalogue est activé pour cette boutique.
class CategoryWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'products'

    class Meta:
        model = Category
        fields = ['id', 'boutique', 'name', 'description', 'image_url']
        read_only_fields = ['id']


# Sérialiseur de lecture d'une variante — inclut son stock (jamais transmis par le client,
# seul un mouvement de stock le fait varier, voir stock/serializers.py).
class VariantSerializer(serializers.ModelSerializer):
    stock = StockSerializer(read_only=True)

    class Meta:
        model = Variant
        fields = [
            'id', 'sku', 'barcode', 'model', 'size', 'selling_price', 'cost_price',
            'low_stock_threshold', 'attributes', 'is_active', 'stock',
        ]
        # sku : auto-généré par le modèle, jamais choisi par le client.
        read_only_fields = ['id', 'sku', 'stock']


# Sérialiseur d'écriture d'UNE variante, utilisé imbriqué dans ProductWriteSerializer ci-dessous
# (pas de vue dédiée : une variante n'existe qu'à travers son produit).
class VariantWriteSerializer(serializers.ModelSerializer):
    # Présent = mise à jour d'une variante existante ; absent = nouvelle variante à créer
    # (voir ProductWriteSerializer.update() plus bas pour la logique).
    id = serializers.IntegerField(required=False)

    class Meta:
        model = Variant
        fields = ['id', 'barcode', 'model', 'size', 'selling_price', 'cost_price', 'low_stock_threshold', 'attributes', 'is_active']


# Sérialiseur de lecture d'un produit, avec ses variantes imbriquées.
class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    variants = VariantSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'boutique', 'category', 'name', 'description', 'code_produit', 'brand',
            'badge', 'icon', 'emoji', 'fabric', 'colors', 'is_published', 'unit',
            'expiration_date', 'variants',
        ]
        read_only_fields = ['id', 'variants']


# Sérialiseur d'écriture d'un produit — crée/remplace ses variantes en une seule requête,
# sur le principe du sérialiseur d'achat de SoftCosy (imbrication écrite d'un coup).
class ProductWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'products'
    # required=False : un produit "simple" (épicerie) peut être créé sans rien préciser — voir
    # create() ci-dessous, qui lui pose alors une variante par défaut.
    variants = VariantWriteSerializer(many=True, required=False)

    class Meta:
        model = Product
        fields = [
            'id', 'boutique', 'category', 'name', 'description', 'code_produit', 'brand',
            'badge', 'icon', 'emoji', 'fabric', 'colors', 'is_published', 'unit',
            'expiration_date', 'variants',
        ]
        read_only_fields = ['id']

    @transaction.atomic
    def create(self, validated_data):
        # Retire "variants" avant Product.objects.create() : ce n'est pas un champ du modèle Product.
        variants_data = validated_data.pop('variants', [])
        product = Product.objects.create(**validated_data)
        for variant_data in variants_data:
            # Un id fourni par erreur à la création n'a pas de sens -> ignoré.
            variant_data.pop('id', None)
            variant = Variant.objects.create(product=product, **variant_data)
            # Chaque nouvelle variante démarre avec une ligne de stock à zéro.
            Stock.objects.create(variant=variant)
        # Produit "simple" (épicerie) : aucune variante fournie -> on lui en crée une par défaut,
        # sinon le produit ne serait jamais vendable (voir Backend/docs/schema.md).
        if not variants_data:
            variant = Variant.objects.create(product=product, selling_price=0, cost_price=0)
            Stock.objects.create(variant=variant)
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        variants_data = validated_data.pop('variants', None)
        instance = super().update(instance, validated_data)
        # None = le client n'a pas touché aux variantes dans cette requête -> on les laisse intactes.
        if variants_data is not None:
            existing_ids = set(instance.variants.values_list('id', flat=True))
            kept_ids = set()
            for variant_data in variants_data:
                variant_id = variant_data.pop('id', None)
                if variant_id and variant_id in existing_ids:
                    # Variante déjà connue -> mise à jour de ses champs.
                    Variant.objects.filter(pk=variant_id).update(**variant_data)
                    kept_ids.add(variant_id)
                else:
                    # Pas d'id reconnu -> nouvelle variante.
                    variant = Variant.objects.create(product=instance, **variant_data)
                    Stock.objects.create(variant=variant)
                    kept_ids.add(variant.id)
            # Supprime les variantes qui existaient mais ne sont plus dans la liste envoyée.
            Variant.objects.filter(product=instance).exclude(pk__in=kept_ids).delete()
        return instance
