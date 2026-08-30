# permissions : classes de base de DRF pour écrire des règles d'accès personnalisées.
from rest_framework import permissions


# Vérifie qu'un employé peut modifier SON PROPRE compte (jamais celui d'un autre) — le Super
# Admin/staff Django peut toujours agir, pour ne jamais se retrouver bloqué de son propre système.
class IsAdminOrSelf(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        # Un membre du staff (accès admin Django) peut tout faire.
        if request.user.is_staff or request.user.is_superuser:
            return True
        # Sinon, seul le propriétaire de l'objet (lui-même) est autorisé.
        return obj == request.user


# Réservé à l'exploitant de la plateforme — utilisé pour les actions sensibles à l'échelle de
# TOUTE la plateforme (lister/créer des comptes propriétaires), jamais pour une ressource
# appartenant à une boutique précise (voir plutôt IsOwnerOrSuperAdmin dans boutiques/permissions.py).
class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        # Pas de session valide -> refusé d'office.
        if not (user and user.is_authenticated):
            return False
        # Superuser Django OU compte logique SUPERADMIN — les deux cas coïncident en pratique
        # (create_superuser force les deux), mais on vérifie les deux pour rester robuste.
        return user.is_superuser or user.account_type == user.AccountType.SUPERADMIN


# Factory de permission DRF : exige que l'utilisateur ait accès à AU MOINS UNE des fonctionnalités
# indiquées (clés de employees.models.ALL_FEATURES, ex: 'products', 'cashier' — jamais de chemin
# d'URL frontend). Plusieurs clés servent aux ressources consultées depuis plusieurs pages (ex: le
# catalogue produit est aussi lu depuis la Caisse).
def required_page(*feature_keys):
    # Classe créée dynamiquement à chaque appel, avec feature_keys capturé par fermeture (closure).
    class _HasPageAccess(permissions.BasePermission):
        # Message renvoyé au client si l'accès est refusé.
        message = f"Vous n'avez pas accès à cette fonctionnalité ({', '.join(feature_keys)})."

        def has_permission(self, request, view):
            user = request.user
            # Pas de session valide -> refusé.
            if not (user and user.is_authenticated):
                return False
            # SUPERADMIN (exploitant plateforme) voit toujours tout, quelle que soit la boutique.
            if user.is_superuser or user.account_type == user.AccountType.SUPERADMIN:
                return True
            # Un employé n'a que les fonctionnalités listées explicitement sur son propre profil.
            if user.account_type == user.AccountType.EMPLOYEE:
                # getattr avec défaut : un User EMPLOYEE a toujours un EmployeeProfile en théorie,
                # mais on se protège d'un compte mal créé plutôt que de planter avec une exception.
                profile = getattr(user, 'employee_profile', None)
                if profile is None:
                    return False
                allowed = profile.allowed_pages or []
                return any(p in allowed for p in feature_keys)
            # OWNER : autorisé au niveau principe ici (il peut avoir cette fonctionnalité sur AU
            # MOINS une de ses boutiques) ; le filtrage précis par boutique (Boutique.enabled_features)
            # se fait au niveau du queryset — voir BoutiqueScopedModelViewSet.get_queryset().
            return True

    return _HasPageAccess
