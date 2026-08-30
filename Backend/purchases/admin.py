# admin : module d'administration Django.
from django.contrib import admin

from .models import Purchase, PurchaseLine, Supplier


# Affiche les lignes d'achat directement dans la page de l'achat.
class PurchaseLineInline(admin.TabularInline):
    model = PurchaseLine
    extra = 0


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ('name', 'boutique', 'phone')
    list_filter = ('boutique',)
    search_fields = ('name',)


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = ('reference', 'boutique', 'supplier', 'status', 'total', 'purchased_at')
    list_filter = ('boutique', 'status')
    search_fields = ('reference',)
    inlines = [PurchaseLineInline]
