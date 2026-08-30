# mixins : briques individuelles pour composer une vue sur mesure.
# viewsets : briques de base de DRF.
from rest_framework import mixins, viewsets
# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnCreateMixin

from .models import Sale, SaleLine
from .permissions import IsEmployeeAccount
from .serializers import SaleLineSerializer, SaleSerializer, SaleWriteSerializer


class SaleViewSet(FullRepresentationOnCreateMixin, BoutiqueScopedModelViewSet):
    feature_key = 'cashier'
    # Pas d'update/destroy : une vente encaissée ne se corrige pas après coup (voir
    # Backend/docs/schema.md, "certains champs sont volontairement recopiés").
    http_method_names = ['get', 'post', 'head', 'options']
    queryset = Sale.objects.select_related('boutique', 'customer', 'employee').prefetch_related('lines').all()
    read_serializer_class = SaleSerializer
    # 'boutique' : voir le commentaire équivalent sur catalog/views.py::CategoryViewSet.
    filterset_fields = ['customer', 'employee', 'payment_mode', 'status', 'boutique']
    ordering_fields = ['created_at', 'total']

    def get_serializer_class(self):
        if self.action == 'create':
            return SaleWriteSerializer
        return SaleSerializer

    def get_permissions(self):
        if self.action == 'create':
            # Encaisser exige à la fois l'accès à la page Caisse ET un vrai compte employé.
            return [IsAuthenticated(), required_page('cashier')(), IsEmployeeAccount()]
        # La lecture de l'historique des ventes reste utile depuis la Caisse ET les Rapports.
        return [IsAuthenticated(), required_page('cashier', 'reports')()]


# Lecture seule — le détail d'une vente vient déjà imbriqué dans SaleSerializer, cette vue sert
# surtout à filtrer/rechercher des lignes précises indépendamment de leur vente.
class SaleLineViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = SaleLine.objects.select_related('sale', 'product', 'variant').all()
    serializer_class = SaleLineSerializer
    # 'sale__boutique' : pas de champ boutique direct sur SaleLine, on filtre via la vente parente
    # (même besoin que sur SaleViewSet.boutique, voir get_queryset ci-dessous).
    filterset_fields = ['sale', 'product', 'variant', 'sale__boutique']

    def get_permissions(self):
        return [IsAuthenticated(), required_page('cashier', 'reports')()]

    def get_queryset(self):
        # Pas de champ `boutique` direct sur SaleLine -> cloisonnement via la vente parente.
        return super().get_queryset().filter(sale__in=Sale.objects.for_user(self.request.user))
