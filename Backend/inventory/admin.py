# admin : module d'administration Django.
from django.contrib import admin

from .models import InventoryCount, InventoryLine


# Affiche les lignes d'inventaire directement dans la page de la session de comptage.
class InventoryLineInline(admin.TabularInline):
    model = InventoryLine
    extra = 0


@admin.register(InventoryCount)
class InventoryCountAdmin(admin.ModelAdmin):
    list_display = ('id', 'boutique', 'status', 'total_variantes', 'ecart', 'created_at')
    list_filter = ('boutique', 'status')
    inlines = [InventoryLineInline]
