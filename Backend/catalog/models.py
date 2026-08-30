# models : briques de base pour définir des modèles Django.
from django.db import models

# BoutiqueScopedQuerySet : applique le cloisonnement multi-tenant (voir boutiques/querysets.py).
from boutiques.querysets import BoutiqueScopedQuerySet


# Catégorie de produits — propre à CHAQUE boutique (contrairement à l'ancien schéma Idrissou
# seul où elle était globale) : une épicerie et une boutique de mode n'ont aucune catégorie en
# commun, donc les partager entre boutiques n'a plus de sens sur une plateforme multi-type.
class Category(models.Model):
    id = models.AutoField(primary_key=True)
    # Boutique propriétaire de cette catégorie — PROTECT : pas de suppression de boutique tant
    # qu'elle a des catégories (protège contre une suppression en cascade accidentelle).
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='categories')
    # Nom de la catégorie, ex: "Boissons", "Chaussures".
    name = models.CharField(max_length=100)
    # Description libre — repris de SoftCosy (Category.description).
    description = models.TextField(blank=True)
    # URL d'une image illustrant la catégorie — repris de SoftCosy (Category.image_url).
    image_url = models.URLField(max_length=500, blank=True)

    # Manager cloisonné : Category.objects.for_user(user) filtre automatiquement par boutique.
    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        verbose_name_plural = 'Catégories'
        ordering = ['name']
        # Une même boutique ne peut pas avoir deux fois la même catégorie.
        constraints = [
            models.UniqueConstraint(fields=['boutique', 'name'], name='unique_category_name_per_boutique'),
        ]

    def __str__(self):
        return self.name


# Un produit — reprend le modèle Produit/Variante de SoftCosy : un produit "simple" (épicerie)
# n'aura qu'une seule Variant par défaut, un produit à déclinaisons (mode) en aura plusieurs —
# un seul mécanisme pour les deux cas, voir Variant plus bas.
class Product(models.Model):
    # Unités de vente possibles — utile surtout pour une boutique de type épicerie (kg, litres...).
    class Unit(models.TextChoices):
        UNITE = 'unite', 'Unité'
        KG = 'kg', 'Kg'
        G = 'g', 'g'
        L = 'l', 'L'
        CL = 'cl', 'cl'
        CARTON = 'carton', 'Carton'
        SACHET = 'sachet', 'Sachet'

    id = models.AutoField(primary_key=True)
    # Boutique à qui appartient ce produit.
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='products')
    # Catégorie de rattachement — PROTECT : on ne supprime pas une catégorie qui contient encore des produits.
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products')
    # Nom du produit affiché partout.
    name = models.CharField(max_length=200)
    # Description détaillée — repris de SoftCosy (Product.description).
    description = models.TextField(blank=True)
    # Code produit interne — nom exact repris de SoftCosy (PAS "barcode", qui vit sur Variant :
    # un produit peut avoir plusieurs variantes, chacune avec son propre code-barres scannable).
    code_produit = models.CharField(max_length=100, blank=True)
    # Marque du produit — repris de SoftCosy.
    brand = models.CharField(max_length=100, blank=True)
    # Badge marketing affiché sur la fiche produit (ex: "Nouveau", "Promo") — repris de SoftCosy.
    badge = models.CharField(max_length=50, blank=True)
    # Icône associée au produit (nom d'icône ou URL) — repris de SoftCosy.
    icon = models.CharField(max_length=100, blank=True)
    # Emoji affiché si aucune photo n'est disponible — habitude déjà prise côté Idrissou.
    emoji = models.CharField(max_length=8, default='📦')
    # Matière/tissu — pertinent pour une boutique de mode, repris de SoftCosy.
    fabric = models.CharField(max_length=100, blank=True)
    # Liste de couleurs disponibles, au format JSON libre — repris de SoftCosy.
    colors = models.JSONField(default=list, blank=True)
    # Le produit est-il visible/publié (ex: sur une vitrine publique future) — repris de SoftCosy.
    is_published = models.BooleanField(default=True)
    # Unité de vente — nouveau (Idrissou), surtout utile pour une épicerie.
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.UNITE)
    # Date de péremption — nouveau (Idrissou), optionnel, pertinent pour une épicerie.
    expiration_date = models.DateField(null=True, blank=True)

    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


# Une déclinaison vendable d'un produit — taille, couleur, modèle... Le STOCK et le PRIX se
# gèrent au niveau de la variante, jamais du produit directement (voir l'app stock).
class Variant(models.Model):
    id = models.AutoField(primary_key=True)
    # Produit parent — CASCADE : supprimer un produit supprime ses variantes (elles n'ont pas
    # de sens sans lui, contrairement à une ligne de vente qui doit, elle, survivre).
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    # Référence interne auto-générée si absente (voir save() plus bas) — SEQUENCE PAR BOUTIQUE,
    # pas globale comme chez SoftCosy (mono-boutique), pour éviter toute collision entre boutiques.
    sku = models.CharField(max_length=100, blank=True)
    # Code-barres scannable en caisse — repris de SoftCosy, vit ici (pas sur Product).
    barcode = models.CharField(max_length=100, blank=True)
    # Modèle/référence fabricant — repris de SoftCosy.
    model = models.CharField(max_length=255, blank=True)
    # Taille ou descriptif libre de la déclinaison (ex: "M", "42", "Rouge/Noir") — repris de SoftCosy.
    size = models.CharField(max_length=100, blank=True)
    # Prix de vente de CETTE déclinaison précise.
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)
    # Prix d'achat/coût de revient — sert à calculer le bénéfice réel.
    cost_price = models.DecimalField(max_digits=12, decimal_places=2)
    # Seuil d'alerte de stock faible propre à cette variante — nouveau (Idrissou) : SoftCosy n'a
    # qu'un seuil global (BoutiqueSettings.low_stock_threshold), utilisé si ce champ est vide.
    low_stock_threshold = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Attributs dynamiques supplémentaires non couverts par les champs dédiés — repris de SoftCosy.
    attributes = models.JSONField(default=dict, blank=True)
    # Une variante inactive n'est plus vendable mais reste visible dans l'historique.
    is_active = models.BooleanField(default=True)
    # Mis à jour automatiquement à chaque sauvegarde (pas seulement à la création).
    created_or_updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['id']

    # Génère automatiquement un SKU séquentiel PAR BOUTIQUE si aucun n'a été saisi manuellement.
    def save(self, *args, **kwargs):
        # Seulement à la création (pas d'id encore) et si le SKU est vide.
        if not self.pk and not self.sku:
            # Cherche la dernière variante créée pour la MÊME boutique (via product__boutique).
            last = Variant.objects.filter(product__boutique=self.product.boutique).order_by('id').last()
            next_number = 1
            if last and last.sku and last.sku.startswith('SKU-'):
                try:
                    # Extrait le numéro de la dernière référence et l'incrémente.
                    next_number = int(last.sku.split('-')[1]) + 1
                except (IndexError, ValueError):
                    # Format inattendu -> repart de 1 plutôt que de planter.
                    next_number = 1
            # Formate sur 5 chiffres avec des zéros devant, ex: SKU-00001.
            self.sku = f'SKU-{next_number:05d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.product.name} — {self.sku}' if self.sku else f'{self.product.name} (variante {self.id})'
