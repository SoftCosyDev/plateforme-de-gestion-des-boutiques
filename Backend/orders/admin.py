# admin : module d'administration Django.
from django.contrib import admin

from .models import Order, OrderLine


# Affiche les lignes de commande directement dans la page de la commande.
class OrderLineInline(admin.TabularInline):
    model = OrderLine
    extra = 0


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'boutique', 'customer_name', 'status', 'total', 'created_at')
    list_filter = ('boutique', 'status', 'channel', 'payment_mode')
    search_fields = ('customer_name', 'customer_phone')
    inlines = [OrderLineInline]
