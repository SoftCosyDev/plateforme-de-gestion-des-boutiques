# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnWriteMixin

from .models import Customer
from .serializers import CustomerSerializer, CustomerWriteSerializer


class CustomerViewSet(FullRepresentationOnWriteMixin, BoutiqueScopedModelViewSet):
    feature_key = 'customers'
    queryset = Customer.objects.select_related('boutique').all()
    read_serializer_class = CustomerSerializer
    # 'boutique' : indispensable pour un SUPERADMIN/OWNER multi-boutiques — sans ce filtre,
    # for_user() renvoie TOUTES leurs boutiques mélangées, jamais juste celle affichée à l'écran.
    filterset_fields = ['boutique']
    search_fields = ['name', 'phone']
    ordering_fields = ['name', 'balance_due']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return CustomerWriteSerializer
        return CustomerSerializer

    def get_permissions(self):
        # Lecture accessible depuis la page Clients ET la Caisse (recherche d'un client pour
        # une vente à crédit) ; écriture réservée à la page Clients.
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), required_page('customers', 'cashier')()]
        return [IsAuthenticated(), required_page('customers')()]
