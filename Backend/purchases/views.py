# transaction.atomic : recevoir un achat pose plusieurs mouvements de stock d'un coup.
from django.db import transaction
# action : ajoute une route personnalisée (mark-received) à ce ViewSet.
from rest_framework.decorators import action
# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnWriteMixin
from stock.models import StockMovement

from .models import Purchase, Supplier
from .serializers import PurchaseSerializer, PurchaseWriteSerializer, SupplierSerializer, SupplierWriteSerializer


class SupplierViewSet(FullRepresentationOnWriteMixin, BoutiqueScopedModelViewSet):
    feature_key = 'suppliers'
    queryset = Supplier.objects.select_related('boutique').all()
    read_serializer_class = SupplierSerializer
    # 'boutique' : voir le commentaire équivalent sur catalog/views.py::CategoryViewSet.
    filterset_fields = ['boutique']
    search_fields = ['name']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return SupplierWriteSerializer
        return SupplierSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('suppliers', 'purchases')()]


class PurchaseViewSet(FullRepresentationOnWriteMixin, BoutiqueScopedModelViewSet):
    feature_key = 'purchases'
    queryset = Purchase.objects.select_related('boutique', 'supplier').prefetch_related('lines').all()
    read_serializer_class = PurchaseSerializer
    # 'boutique' : voir le commentaire équivalent sur catalog/views.py::CategoryViewSet.
    filterset_fields = ['status', 'supplier', 'boutique']
    ordering_fields = ['purchased_at', 'created_at']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return PurchaseWriteSerializer
        return PurchaseSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('purchases')()]

    # Marque l'achat comme reçu — déclenche automatiquement une entrée de stock par ligne
    # (port direct de `_trigger_stock_reception()` chez SoftCosy).
    @action(detail=True, methods=['post'], url_path='mark-received')
    def mark_received(self, request, pk=None):
        purchase = self.get_object()
        if purchase.status == 'RECU':
            return Response({'detail': 'Cet achat est déjà marqué comme reçu.'}, status=400)

        with transaction.atomic():
            for line in purchase.lines.select_related('variant__stock', 'product').all():
                StockMovement.objects.create(
                    boutique=purchase.boutique, stock=getattr(line.variant, 'stock', None),
                    product=line.product, purchase_line=line, user=request.user,
                    movement_type=StockMovement.MovementType.ENTREE, quantite=line.quantity,
                    reason=StockMovement.Reason.ACHAT_FOURNISSEUR,
                )
            purchase.status = 'RECU'
            purchase.save(update_fields=['status'])

        return Response(PurchaseSerializer(purchase).data)
