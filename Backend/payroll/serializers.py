# Decimal : calcul monétaire exact.
from decimal import Decimal

# serializers : briques de base de DRF.
from rest_framework import serializers

from boutiques.serializers import BoutiqueScopedWriteSerializerMixin

from .models import PayrollEntry
from .services import compute_for_employee, compute_net_pay, status_for


class PayrollEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollEntry
        fields = [
            'id', 'boutique', 'employee', 'period_label', 'period_start', 'period_end',
            'unjustified_absences', 'late_count', 'base_salary', 'bonus', 'deduction',
            'net_pay', 'amount_paid', 'status',
        ]
        read_only_fields = fields


# Le client ne fournit que la période, la prime et le montant déjà versé — absences/retards/
# retenue/net à payer/statut sont toujours recalculés côté serveur (voir services.py, port de
# Frontend/src/lib/payroll.ts).
class PayrollEntryWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'payroll'
    bonus = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal('0'))
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal('0'))

    class Meta:
        model = PayrollEntry
        fields = ['id', 'boutique', 'employee', 'period_label', 'period_start', 'period_end', 'bonus', 'amount_paid']
        read_only_fields = ['id']

    # Recalcule TOUS les champs dérivés à partir des vraies données de présence — jamais reçus
    # directement du client, pour ne jamais diverger du calcul réel.
    def _compute(self, data):
        computed = compute_for_employee(data['employee'], data['period_start'], data['period_end'])
        base_salary = data['employee'].base_salary
        net_pay = compute_net_pay(base_salary, data['bonus'], computed['deduction'])
        return {
            **data, **computed, 'base_salary': base_salary, 'net_pay': net_pay,
            'status': status_for(net_pay, data['amount_paid']),
        }

    def create(self, validated_data):
        return PayrollEntry.objects.create(**self._compute(validated_data))

    def update(self, instance, validated_data):
        # Complète avec les valeurs déjà en base pour les champs non envoyés (PATCH partiel).
        data = {
            'boutique': validated_data.get('boutique', instance.boutique),
            'employee': validated_data.get('employee', instance.employee),
            'period_label': validated_data.get('period_label', instance.period_label),
            'period_start': validated_data.get('period_start', instance.period_start),
            'period_end': validated_data.get('period_end', instance.period_end),
            'bonus': validated_data.get('bonus', instance.bonus),
            'amount_paid': validated_data.get('amount_paid', instance.amount_paid),
        }
        return super().update(instance, self._compute(data))
