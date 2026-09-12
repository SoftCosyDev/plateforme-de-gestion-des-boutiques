# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnWriteMixin

from .models import PayrollEntry
from .serializers import PayrollEntrySerializer, PayrollEntryWriteSerializer


class PayrollEntryViewSet(FullRepresentationOnWriteMixin, BoutiqueScopedModelViewSet):
    feature_key = 'payroll'
    queryset = PayrollEntry.objects.select_related('boutique', 'employee__user').all()
    read_serializer_class = PayrollEntrySerializer
    # 'boutique' : voir le commentaire équivalent sur employees/views.py::EmployeeProfileViewSet.
    filterset_fields = ['employee', 'status', 'boutique']
    ordering_fields = ['period_start']

    # Sérialiseur d'écriture (accepte les montants bruts saisis) vs de lecture (expose aussi le
    # nom de l'employé et sa boutique, imbriqués) — même idiome que le reste du backend.
    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return PayrollEntryWriteSerializer
        return PayrollEntrySerializer

    def get_permissions(self):
        # La paie se gère depuis la page Employés — pas de page dédiée séparée.
        return [IsAuthenticated(), required_page('employees', 'payroll')()]
