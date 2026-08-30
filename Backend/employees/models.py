# models : briques de base pour définir des modèles Django.
from django.db import models

# BoutiqueScopedQuerySet : applique le cloisonnement multi-tenant.
from boutiques.querysets import BoutiqueScopedQuerySet

# Catalogue complet des fonctionnalités/pages de la plateforme — fusion de ce que proposait
# SoftCosy et de ce qu'apporte Idrissou, voir Backend/docs/schema.md. Sert de référence pour
# Boutique.enabled_features ET EmployeeProfile.allowed_pages (un employé n'a jamais plus que
# ce que sa boutique a activé).
ALL_FEATURES = [
    'dashboard', 'products', 'stocks', 'cashier', 'sales', 'orders', 'customers',
    'employees', 'attendance', 'payroll', 'inventory', 'suppliers', 'purchases',
    'reports', 'settings',
]


# Petit gabarit générique de rôle — sert UNIQUEMENT à pré-remplir allowed_pages à la création
# d'un employé ; le réglage fin reste toujours possible page par page ensuite (allowed_pages
# n'est jamais figé par ce rôle après coup).
class AccessRole(models.TextChoices):
    GERANT = 'gerant', 'Gérant'
    MANAGER = 'manager', 'Manager'
    STAFF = 'staff', 'Staff'


# Pages accordées par défaut selon le rôle choisi à la création — un Gérant a accès à tout
# (équivalent propriétaire au quotidien), un Manager gère l'opérationnel mais pas les zones
# sensibles (RH, paramètres), un Staff se limite aux tâches de terrain.
DEFAULT_PAGES_BY_ROLE = {
    AccessRole.GERANT: list(ALL_FEATURES),
    AccessRole.MANAGER: [p for p in ALL_FEATURES if p not in ('employees', 'payroll', 'settings')],
    AccessRole.STAFF: ['cashier', 'products', 'customers', 'orders', 'inventory'],
}


# Le "profil employé" — s'ajoute à un User uniquement quand account_type=EMPLOYEE, porte tous
# les champs métier liés à l'emploi (contrairement à un simple User, qui reste générique).
class EmployeeProfile(models.Model):
    # Statut d'emploi — un employé inactif ne peut plus se connecter (vérifié à la connexion).
    class Status(models.TextChoices):
        ACTIF = 'actif', 'Actif'
        INACTIF = 'inactif', 'Inactif'

    id = models.AutoField(primary_key=True)
    # Relation un-à-un : chaque compte EMPLOYEE a EXACTEMENT un profil — CASCADE : supprimer le
    # compte supprime son profil (ils n'ont pas de sens l'un sans l'autre).
    user = models.OneToOneField('accounts.User', on_delete=models.CASCADE, related_name='employee_profile')
    # Boutique où travaille cet employé — LE champ central du cloisonnement pour ce compte.
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='employee_profiles')
    # Intitulé du poste, texte libre affiché (ex: "Caissière") — distinct de access_role (le
    # niveau d'accès technique) : deux employés peuvent avoir le même poste affiché mais des
    # droits différents, ou l'inverse.
    role = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    hire_date = models.DateField(null=True, blank=True)
    # Salaire de base mensuel, utilisé par le calcul de paie (voir l'app payroll).
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIF)
    # Gabarit de départ choisi à la création — ne fait que pré-remplir allowed_pages, voir plus haut.
    access_role = models.CharField(max_length=10, choices=AccessRole.choices, default=AccessRole.STAFF)
    # Les pages RÉELLEMENT autorisées pour CET employé précis — modifiable indépendamment du
    # gabarit ci-dessus, y compris à l'encontre du rôle. Doit toujours être un sous-ensemble de
    # Boutique.enabled_features (vérifié côté vues, à l'étape API).
    allowed_pages = models.JSONField(default=list, blank=True)

    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        verbose_name = 'Profil employé'
        verbose_name_plural = 'Profils employés'

    def __str__(self):
        return f'{self.user.full_name} — {self.role or self.get_access_role_display()}'


# Une présence, un retard ou une absence enregistrée pour un employé.
class AttendanceRecord(models.Model):
    # Ce qui est enregistré.
    class Type(models.TextChoices):
        RETARD = 'retard', 'Retard'
        ABSENCE = 'absence', 'Absence'

    id = models.AutoField(primary_key=True)
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='attendance_records')
    # Employé concerné — PROTECT : on ne supprime pas un profil employé qui a un historique de présence.
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.PROTECT, related_name='attendance_records')
    date = models.DateField()
    type = models.CharField(max_length=10, choices=Type.choices)
    reason = models.CharField(max_length=255, blank=True)
    # Heure prévue — utilisé seulement pour un retard, pour calculer le nombre de minutes de retard.
    scheduled_time = models.TimeField(null=True, blank=True)
    # Heure réelle d'arrivée — idem, seulement pour un retard.
    actual_time = models.TimeField(null=True, blank=True)
    # Une absence justifiée n'entraîne pas de retenue sur la paie (voir l'app payroll).
    justified = models.BooleanField(null=True, blank=True)

    # Manager cloisonné : AttendanceRecord.objects.for_user(user) — indispensable, sa vue
    # (AttendanceRecordViewSet) hérite de BoutiqueScopedModelViewSet, qui appelle justement
    # `.for_user(user)` dans get_queryset() (même oubli que StockMovement/PayrollEntry).
    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        verbose_name = 'Présence'
        verbose_name_plural = 'Présences'
        ordering = ['-date']

    def __str__(self):
        return f'{self.get_type_display()} — {self.employee} ({self.date})'
