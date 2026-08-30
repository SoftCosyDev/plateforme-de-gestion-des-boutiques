# models : briques de base pour définir des modèles Django.
from django.db import models

# BoutiqueScopedQuerySet : applique le cloisonnement multi-tenant (voir boutiques/querysets.py).
from boutiques.querysets import BoutiqueScopedQuerySet


# Une fiche de paie pour un employé sur une période donnée (généralement un mois).
class PayrollEntry(models.Model):
    # Où en est le paiement de cette fiche.
    class Status(models.TextChoices):
        NON_PAYE = 'non_paye', 'Non payé'
        PARTIEL = 'partiel', 'Partiel'
        PAYE = 'paye', 'Payé'

    id = models.AutoField(primary_key=True)
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='payroll_entries')
    # Employé concerné — PROTECT : on garde l'historique de paie même si le profil est modifié.
    employee = models.ForeignKey('employees.EmployeeProfile', on_delete=models.PROTECT, related_name='payroll_entries')
    # Libellé humain de la période, ex: "Août 2026".
    period_label = models.CharField(max_length=50)
    period_start = models.DateField()
    period_end = models.DateField()
    # Champs suivants TOUJOURS recalculés côté serveur (voir services.py) — jamais saisis
    # directement par le client, pour ne jamais diverger du calcul réel.
    unjustified_absences = models.IntegerField(default=0)
    late_count = models.IntegerField(default=0)
    # Salaire de base — recopié depuis EmployeeProfile.base_salary au moment du calcul (photo figée).
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Prime éventuelle — seul champ vraiment saisi librement par l'utilisateur avec amount_paid.
    bonus = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Retenue calculée à partir des absences/retards non justifiés.
    deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Net à payer = base_salary + bonus - deduction (jamais négatif).
    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Montant réellement versé jusqu'ici (peut être partiel).
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.NON_PAYE)

    # Manager cloisonné : PayrollEntry.objects.for_user(user) — indispensable, ce modèle a un
    # champ `boutique` direct et sa vue (PayrollEntryViewSet) hérite de BoutiqueScopedModelViewSet,
    # qui appelle justement `.for_user(user)` dans get_queryset() (même oubli que StockMovement).
    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        verbose_name = 'Fiche de paie'
        verbose_name_plural = 'Fiches de paie'
        ordering = ['-period_start']
        # Une seule fiche par employé et par période (évite les doublons de génération).
        constraints = [
            models.UniqueConstraint(fields=['employee', 'period_label'], name='unique_payroll_entry_per_period'),
        ]

    def __str__(self):
        return f'{self.employee} — {self.period_label}'
