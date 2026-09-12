# admin : module d'administration Django.
from django.contrib import admin

from .models import Customer, CustomerPayment


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'boutique', 'balance_due')
    list_filter = ('boutique',)
    search_fields = ('name', 'phone')


# Lecture seule dans l'admin : la seule écriture légitime passe par
# CustomerViewSet.record_payment, jamais par ici (voir customers/views.py).
@admin.register(CustomerPayment)
class CustomerPaymentAdmin(admin.ModelAdmin):
    list_display = ('customer', 'amount', 'balance_after', 'user', 'boutique', 'created_at')
    list_filter = ('boutique',)
    search_fields = ('customer__name',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
