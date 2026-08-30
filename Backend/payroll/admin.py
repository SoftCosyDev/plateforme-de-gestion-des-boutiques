# admin : module d'administration Django.
from django.contrib import admin

from .models import PayrollEntry


@admin.register(PayrollEntry)
class PayrollEntryAdmin(admin.ModelAdmin):
    list_display = ('employee', 'period_label', 'net_pay', 'amount_paid', 'status')
    list_filter = ('boutique', 'status')
    search_fields = ('period_label',)
