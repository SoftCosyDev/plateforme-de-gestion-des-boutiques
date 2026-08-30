# admin : module d'administration Django (interface web /admin/).
from django.contrib import admin
# UserAdmin : classe de base fournie par Django, adaptée pour un modèle User personnalisé
# (gère correctement le mot de passe haché, contrairement à un ModelAdmin générique).
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


# Enregistre User dans l'admin avec un affichage adapté à ce modèle personnalisé.
@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    # Colonnes affichées dans la liste des utilisateurs.
    list_display = ('username', 'full_name', 'account_type', 'is_active', 'is_staff')
    # Filtres disponibles dans la barre latérale.
    list_filter = ('account_type', 'is_active', 'is_staff')
    # Champ de recherche texte.
    search_fields = ('username', 'full_name')
    ordering = ('username',)
    # Regroupement des champs sur la page de détail — remplace celui de DjangoUserAdmin, qui
    # référence des champs (comme "email") absents de ce modèle personnalisé.
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Informations', {'fields': ('full_name', 'profile_photo', 'account_type')}),
        ('Droits', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    # Champs affichés lors de la création d'un utilisateur depuis l'admin.
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('username', 'password1', 'password2', 'account_type', 'full_name')}),
    )
