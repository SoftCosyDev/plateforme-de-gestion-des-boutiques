# admin : module d'administration Django.
from django.contrib import admin

from .models import Stock, StockMovement


@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    list_display = ('variant', 'on_hand_qty', 'reserved_qty', 'available_qty', 'last_counted_at')
    search_fields = ('variant__sku', 'variant__barcode')


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ('boutique', 'movement_type', 'quantite', 'reason', 'created_at')
    list_filter = ('boutique', 'movement_type', 'reason')
    # Lecture seule dans l'admin : un mouvement de stock ne doit jamais être modifié après coup
    # (ledger d'ajout uniquement, voir le commentaire du modèle).
    readonly_fields = [f.name for f in StockMovement._meta.fields]

    # Interdit la modification depuis l'admin (cohérent avec le principe de ledger d'ajout uniquement).
    def has_change_permission(self, request, obj=None):
        return False
