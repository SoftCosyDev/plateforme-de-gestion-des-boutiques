# models : pour créer un QuerySet personnalisé (django.db.models.QuerySet).
from django.db import models


# QuerySet de cloisonnement — LA règle unique de multi-tenant, réutilisée par tous les modèles
# métier qui ont un champ `boutique` (Product, Sale, StockMovement...). Voir Backend/docs/schema.md.
class BoutiqueScopedQuerySet(models.QuerySet):
    # Filtre le queryset selon le compte connecté — appelé explicitement dans chaque vue.
    def for_user(self, user):
        # SUPERADMIN (exploitant plateforme) voit tout, sans filtrage.
        if user.is_superuser or user.account_type == user.AccountType.SUPERADMIN:
            return self
        # OWNER : ne voit que ce qui appartient à SES boutiques (via boutique__owner).
        if user.account_type == user.AccountType.OWNER:
            return self.filter(boutique__owner=user)
        # EMPLOYEE : ne voit que sa seule boutique d'affectation (via son EmployeeProfile).
        return self.filter(boutique=user.employee_profile.boutique)
