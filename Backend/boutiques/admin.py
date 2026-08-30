# admin : module d'administration Django.
from django.contrib import admin

from .models import Boutique, BoutiqueSettings


# Affiche les réglages directement DANS la page de la boutique (pas dans une liste séparée) —
# une boutique a exactement une ligne de réglages, donc pas besoin d'un écran dédié.
class BoutiqueSettingsInline(admin.StackedInline):
    model = BoutiqueSettings
    # Pas de suppression indépendante : les réglages suivent toujours leur boutique.
    can_delete = False


@admin.register(Boutique)
class BoutiqueAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'business_type', 'neighborhood', 'created_at')
    list_filter = ('business_type',)
    search_fields = ('name', 'neighborhood')
    # Inclut l'édition des réglages directement sur cette page.
    inlines = [BoutiqueSettingsInline]
