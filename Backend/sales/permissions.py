# permissions : classes de base de DRF.
from rest_framework import permissions


# Encaisser une vente exige d'être un compte EMPLOYEE (un vrai caissier, avec un EmployeeProfile)
# — un OWNER/SUPERADMIN qui veut opérer la caisse doit avoir aussi un compte employé
# (access_role='gerant'), pas l'inverse : voir Backend/docs/schema.md, Sale.employee pointe
# vers EmployeeProfile.
class IsEmployeeAccount(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        # hasattr sur une relation OneToOne inverse renvoie False proprement si elle n'existe pas
        # (au lieu de lever une exception RelatedObjectDoesNotExist).
        return bool(user and user.is_authenticated and hasattr(user, 'employee_profile'))
