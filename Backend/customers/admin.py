# admin : module d'administration Django.
from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'boutique', 'balance_due')
    list_filter = ('boutique',)
    search_fields = ('name', 'phone')
