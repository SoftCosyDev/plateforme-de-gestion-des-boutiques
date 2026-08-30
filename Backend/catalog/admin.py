# admin : module d'administration Django.
from django.contrib import admin

from .models import Category, Product, Variant


# Affiche les variantes directement dans la page du produit — plus pratique que de devoir
# ouvrir chaque variante séparément pour un produit à plusieurs déclinaisons.
class VariantInline(admin.TabularInline):
    model = Variant
    # Ne pas pré-afficher de ligne vide supplémentaire par défaut.
    extra = 0


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'boutique')
    list_filter = ('boutique',)
    search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'boutique', 'category', 'unit', 'is_published')
    list_filter = ('boutique', 'category', 'is_published', 'unit')
    search_fields = ('name', 'code_produit')
    inlines = [VariantInline]


@admin.register(Variant)
class VariantAdmin(admin.ModelAdmin):
    list_display = ('product', 'sku', 'barcode', 'selling_price', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('sku', 'barcode')
