# Q : combine deux conditions OU dans un même filtre (cashier OU sales, voir get_queryset ci-dessous).
from django.db.models import Q
# mixins : briques individuelles pour composer une vue sur mesure.
# viewsets : briques de base de DRF.
from rest_framework import mixins, viewsets
# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated

from accounts.models import User
from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnCreateMixin

from .models import Sale, SaleLine
from .permissions import IsEmployeeAccount
from .serializers import SaleLineSerializer, SaleSerializer, SaleWriteSerializer


class SaleViewSet(FullRepresentationOnCreateMixin, BoutiqueScopedModelViewSet):
    # Pas de feature_key unique ici (voir get_queryset ci-dessous) : une vente reste visible dès
    # que la boutique a activé 'cashier' (qui l'a créée) OU 'sales' (l'historique dédié) — une
    # boutique pourrait vouloir la 2e sans la 1re (ex: accès lecture seule pour un comptable).
    feature_key = None
    # Pas d'update/destroy : une vente encaissée ne se corrige pas après coup (voir
    # Backend/docs/schema.md, "certains champs sont volontairement recopiés").
    http_method_names = ['get', 'post', 'head', 'options']
    queryset = Sale.objects.select_related('boutique', 'customer', 'employee').prefetch_related('lines').all()
    read_serializer_class = SaleSerializer
    # 'boutique' : voir le commentaire équivalent sur catalog/views.py::CategoryViewSet.
    filterset_fields = ['customer', 'employee', 'payment_mode', 'status', 'boutique']
    ordering_fields = ['created_at', 'total']

    # Sérialiseur d'écriture (accepte les lignes imbriquées en brut ET pose les mouvements de
    # sortie de stock correspondants, voir SaleWriteSerializer) vs de lecture (expose le client/
    # l'employé imbriqués) — même idiome que le reste du backend.
    def get_serializer_class(self):
        if self.action == 'create':
            return SaleWriteSerializer
        return SaleSerializer

    # Remplace complètement BoutiqueScopedModelViewSet.get_queryset() : celui-ci ne sait filtrer
    # que sur UNE SEULE feature_key, insuffisant ici (voir le commentaire sur feature_key ci-dessus).
    def get_queryset(self):
        user = self.request.user
        qs = Sale.objects.for_user(user)
        if not (user.is_superuser or user.account_type == User.AccountType.SUPERADMIN):
            qs = qs.filter(
                Q(boutique__enabled_features__contains=['cashier'])
                | Q(boutique__enabled_features__contains=['sales'])
            )
        return qs

    def get_permissions(self):
        if self.action == 'create':
            # Encaisser exige à la fois l'accès à la page Caisse ET un vrai compte employé.
            return [IsAuthenticated(), required_page('cashier')(), IsEmployeeAccount()]
        # La lecture de l'historique des ventes reste utile depuis la Caisse, les Rapports, ET la
        # page dédiée Ventes (historique complet, recherche, filtre par période — voir sales/page.tsx).
        return [IsAuthenticated(), required_page('cashier', 'reports', 'sales')()]


# Lecture seule — le détail d'une vente vient déjà imbriqué dans SaleSerializer, cette vue sert
# surtout à filtrer/rechercher des lignes précises indépendamment de leur vente.
class SaleLineViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = SaleLine.objects.select_related('sale', 'product', 'variant').all()
    serializer_class = SaleLineSerializer
    # 'sale__boutique' : pas de champ boutique direct sur SaleLine, on filtre via la vente parente
    # (même besoin que sur SaleViewSet.boutique, voir get_queryset ci-dessous).
    filterset_fields = ['sale', 'product', 'variant', 'sale__boutique']

    def get_permissions(self):
        return [IsAuthenticated(), required_page('cashier', 'reports', 'sales')()]

    def get_queryset(self):
        # Pas de champ `boutique` direct sur SaleLine -> cloisonnement via la vente parente.
        return super().get_queryset().filter(sale__in=Sale.objects.for_user(self.request.user))
