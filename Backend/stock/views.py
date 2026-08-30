# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnCreateMixin

from .models import StockMovement
from .serializers import StockMovementSerializer, StockMovementWriteSerializer


# Ajustements manuels (réception, casse, correction) — les mouvements liés à une vente ou un
# achat sont créés automatiquement par sales/purchases, pas ici. Ledger d'ajout uniquement :
# pas d'update/destroy sur un mouvement déjà écrit (voir le commentaire du modèle).
class StockMovementViewSet(FullRepresentationOnCreateMixin, BoutiqueScopedModelViewSet):
    feature_key = 'products'
    # Seules les méthodes lecture + création sont exposées.
    http_method_names = ['get', 'post', 'head', 'options']
    queryset = StockMovement.objects.select_related('boutique', 'stock', 'product').all()
    read_serializer_class = StockMovementSerializer
    # 'boutique' : voir le commentaire équivalent sur catalog/views.py::CategoryViewSet.
    filterset_fields = ['product', 'movement_type', 'reason', 'boutique']
    ordering_fields = ['created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return StockMovementWriteSerializer
        return StockMovementSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('products')()]
