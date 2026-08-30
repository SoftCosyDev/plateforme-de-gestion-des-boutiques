# Port fidèle de Frontend/src/lib/payroll.ts — mêmes constantes, même formule, pour que le
# calcul serveur ne diverge jamais de ce que montrait déjà le mock du frontend.

# ROUND_HALF_UP : arrondi "classique" (0.5 arrondit vers le haut), Decimal : calcul monétaire exact.
from decimal import ROUND_HALF_UP, Decimal

# Q : permet de combiner des conditions de filtre avec un OU logique.
from django.db.models import Q

from employees.models import AttendanceRecord

# Nombre de jours ouvrés attendus par mois — sert de base au calcul du taux journalier.
EXPECTED_WORKING_DAYS = Decimal('26')
# Un retard coûte une FRACTION du taux journalier (pas une journée entière comme une absence).
LATE_PENALTY_RATIO = Decimal('0.1')


# Calcule les absences/retards d'un employé sur une période, et la retenue correspondante.
def compute_for_employee(employee, period_start, period_end):
    # Toutes les présences de cet employé dans la période demandée.
    records = AttendanceRecord.objects.filter(employee=employee, date__gte=period_start, date__lte=period_end)

    # Une absence est comptée "non justifiée" par défaut, sauf marquage explicite `justified=True`
    # (justified=None ou False comptent tous les deux comme non justifiés).
    unjustified_absences = records.filter(type=AttendanceRecord.Type.ABSENCE).filter(
        Q(justified=False) | Q(justified__isnull=True)
    ).count()
    # Tous les retards comptent, justifiés ou non (contrairement aux absences).
    late_count = records.filter(type=AttendanceRecord.Type.RETARD).count()

    # Taux journalier = salaire de base / jours ouvrés attendus.
    daily_rate = employee.base_salary / EXPECTED_WORKING_DAYS
    # Une absence non justifiée coûte un jour entier, un retard seulement une fraction (10%).
    deduction = unjustified_absences * daily_rate + late_count * daily_rate * LATE_PENALTY_RATIO
    # Arrondit à l'entier le plus proche (les salaires ne se paient pas au centime près ici).
    deduction = deduction.quantize(Decimal('1'), rounding=ROUND_HALF_UP)

    return {'unjustified_absences': unjustified_absences, 'late_count': late_count, 'deduction': deduction}


# Net à payer = salaire de base + prime - retenue, jamais négatif.
def compute_net_pay(base_salary, bonus, deduction):
    return max(Decimal('0'), base_salary + bonus - deduction)


# Détermine le statut de paiement à partir de ce qui a été réellement versé.
def status_for(net_pay, amount_paid):
    if amount_paid <= 0:
        return 'non_paye'
    if amount_paid >= net_pay:
        return 'paye'
    return 'partiel'
