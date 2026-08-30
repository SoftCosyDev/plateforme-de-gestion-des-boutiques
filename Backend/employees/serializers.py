# transaction.atomic : compte + profil employé créés ensemble, ou rien.
from django.db import transaction
# serializers : briques de base de DRF.
from rest_framework import serializers

from accounts.models import User
from boutiques.serializers import BoutiqueScopedWriteSerializerMixin

from .models import DEFAULT_PAGES_BY_ROLE, AttendanceRecord, EmployeeProfile


class EmployeeProfileSerializer(serializers.ModelSerializer):
    # Champs recopiés depuis le User lié, pour ne pas obliger le client à faire un second appel.
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    profile_photo = serializers.ImageField(source='user.profile_photo', read_only=True)

    class Meta:
        model = EmployeeProfile
        fields = [
            'id', 'user_id', 'username', 'full_name', 'profile_photo', 'boutique',
            'role', 'phone', 'hire_date', 'base_salary', 'status', 'access_role', 'allowed_pages',
        ]
        read_only_fields = fields


# Crée/modifie un User + son EmployeeProfile en une seule requête — le formulaire de gestion des
# employés soumet toujours les deux ensemble (compte ET informations d'emploi).
class EmployeeProfileWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'employees'
    username = serializers.CharField(write_only=True)
    # Facultatif à la modification (on ne force pas à ressaisir le mot de passe à chaque fois),
    # mais vérifié obligatoire à la création dans validate() ci-dessous.
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    full_name = serializers.CharField(write_only=True)
    # required=False : si absent, rempli automatiquement depuis le gabarit du rôle choisi.
    allowed_pages = serializers.JSONField(required=False)

    class Meta:
        model = EmployeeProfile
        fields = [
            'id', 'boutique', 'username', 'password', 'full_name',
            'role', 'phone', 'hire_date', 'base_salary', 'status', 'access_role', 'allowed_pages',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        # self.instance vide = création -> le mot de passe est alors obligatoire.
        if self.instance is None and not attrs.get('password'):
            raise serializers.ValidationError({'password': 'Obligatoire à la création.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        username = validated_data.pop('username')
        password = validated_data.pop('password')
        full_name = validated_data.pop('full_name')
        # Si aucune page n'a été précisée, on part du gabarit correspondant au rôle choisi.
        validated_data.setdefault(
            'allowed_pages', DEFAULT_PAGES_BY_ROLE.get(validated_data.get('access_role'), []),
        )
        user = User.objects.create_user(
            username=username, password=password, full_name=full_name,
            account_type=User.AccountType.EMPLOYEE,
        )
        return EmployeeProfile.objects.create(user=user, **validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        username = validated_data.pop('username', None)
        password = validated_data.pop('password', None)
        full_name = validated_data.pop('full_name', None)
        user = instance.user
        if username:
            user.username = username
        if full_name:
            user.full_name = full_name
        if password:
            user.set_password(password)
        user.save()
        return super().update(instance, validated_data)


class AttendanceRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceRecord
        fields = [
            'id', 'boutique', 'employee', 'date', 'type', 'reason',
            'scheduled_time', 'actual_time', 'justified',
        ]
        read_only_fields = ['id']


class AttendanceRecordWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'attendance'

    class Meta:
        model = AttendanceRecord
        fields = [
            'id', 'boutique', 'employee', 'date', 'type', 'reason',
            'scheduled_time', 'actual_time', 'justified',
        ]
        read_only_fields = ['id']
