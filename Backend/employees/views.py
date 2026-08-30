# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnWriteMixin

from .models import AttendanceRecord, EmployeeProfile
from .serializers import (
    AttendanceRecordSerializer,
    AttendanceRecordWriteSerializer,
    EmployeeProfileSerializer,
    EmployeeProfileWriteSerializer,
)


class EmployeeProfileViewSet(FullRepresentationOnWriteMixin, BoutiqueScopedModelViewSet):
    feature_key = 'employees'
    queryset = EmployeeProfile.objects.select_related('user', 'boutique').all()
    read_serializer_class = EmployeeProfileSerializer
    # 'boutique' : indispensable pour un SUPERADMIN/OWNER multi-boutiques — sans ce filtre,
    # for_user() renvoie TOUS les employés de TOUTES leurs boutiques mélangés (c'est exactement
    # le bug observé : un employé créé dans une boutique "apparaissant" dans une autre alors
    # qu'il n'a en réalité jamais changé de boutique_id — seule la LISTE affichée n'était pas
    # filtrée sur la boutique actuellement sélectionnée à l'écran).
    filterset_fields = ['boutique']
    search_fields = ['user__full_name', 'role']
    ordering_fields = ['user__full_name', 'hire_date']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return EmployeeProfileWriteSerializer
        return EmployeeProfileSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('employees')()]

    # Supprime aussi le COMPTE User lié — sans ça, il reste orphelin (EMPLOYEE sans profil,
    # donc plus jamais capable de se connecter, voir LoginSerializer) et son identifiant reste
    # bloqué pour toujours par la contrainte d'unicité sur username, empêchant même de recréer
    # un futur employé avec ce même identifiant.
    def perform_destroy(self, instance):
        user = instance.user
        instance.delete()
        user.delete()


class AttendanceRecordViewSet(BoutiqueScopedModelViewSet):
    feature_key = 'attendance'
    queryset = AttendanceRecord.objects.select_related('boutique', 'employee__user').all()
    # 'boutique' : voir le commentaire équivalent sur EmployeeProfileViewSet ci-dessus.
    filterset_fields = ['employee', 'type', 'boutique']
    ordering_fields = ['date']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return AttendanceRecordWriteSerializer
        return AttendanceRecordSerializer

    def get_permissions(self):
        # La présence se gère depuis la page Employés — pas de page dédiée séparée.
        return [IsAuthenticated(), required_page('employees', 'attendance')()]
