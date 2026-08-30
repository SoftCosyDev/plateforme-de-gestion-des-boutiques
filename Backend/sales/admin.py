# admin : module d'administration Django.
from django.contrib import admin

from .models import Sale, SaleLine


# Affiche les lignes de vente directement dans la page de la vente.
class SaleLineInline(admin.TabularInline):
    model = SaleLine
    extra = 0


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'boutique', 'employee', 'total', 'status', 'created_at')
    list_filter = ('boutique', 'status', 'payment_mode', 'channel')
    search_fields = ('invoice_number', 'customer_name')
    inlines = [SaleLineInline]
