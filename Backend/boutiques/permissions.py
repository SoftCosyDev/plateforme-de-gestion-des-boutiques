# permissions : classes de base de DRF pour écrire des règles d'accès personnalisées.
from rest_framework import permissions


# Créer/modifier/supprimer une Boutique est réservé aux OWNER et SUPERADMIN — un employé ne
# gère jamais la boutique elle-même, seulement ce qui se passe dedans.
class IsOwnerOrSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        # Pas de session valide -> refusé.
        if not (user and user.is_authenticated):
            return False
        # Autorisé si superuser Django, ou compte de type OWNER/SUPERADMIN.
        return user.is_superuser or user.account_type in (
            user.AccountType.OWNER, user.AccountType.SUPERADMIN,
        )
