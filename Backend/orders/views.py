# transaction.atomic : passer une commande en "livré" pose plusieurs mouvements de stock d'un
# coup — soit tous, soit aucun.
from django.db import transaction
# action : ajoute une route personnalisée (mark-delivered) à ce ViewSet.
from rest_framework.decorators import action
# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnCreateMixin
from stock.models import StockMovement

from .models import Order
from .serializers import OrderSerializer, OrderWriteSerializer


class OrderViewSet(FullRepresentationOnCreateMixin, BoutiqueScopedModelViewSet):
    feature_key = 'orders'
    # Pas de update générique : le seul changement d'état possible passe par les actions
    # dédiées ci-dessous (mark-delivered, mark-cancelled), qui posent aussi les bons mouvements.
    http_method_names = ['get', 'post', 'head', 'options']
    queryset = Order.objects.select_related('boutique', 'customer', 'user').prefetch_related('lines').all()
    read_serializer_class = OrderSerializer
    # 'boutique' : voir le commentaire équivalent sur catalog/views.py::CategoryViewSet.
    filterset_fields = ['status', 'channel', 'customer', 'boutique']
    ordering_fields = ['created_at']

    # Sérialiseur d'écriture (accepte les lignes imbriquées en brut, avec variant_label en repli
    # si la variante exacte n'est pas connue) vs de lecture (expose le client/la boutique
    # imbriqués) — même idiome que le reste du backend.
    def get_serializer_class(self):
        if self.action == 'create':
            return OrderWriteSerializer
        return OrderSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('orders')()]

    # Fait passer une commande "en attente"/"en cours" à "livrée" — vérifie D'ABORD que le
    # stock disponible suffit pour chaque ligne dont la variante est connue (une ligne encore
    # non résolue, `variant=None`, ne peut pas être vérifiée et est simplement ignorée ici,
    # comme chez SoftCosy), PUIS pose les mouvements de sortie correspondants.
    @action(detail=True, methods=['post'], url_path='mark-delivered')
    def mark_delivered(self, request, pk=None):
        order = self.get_object()
        if order.status == Order.Status.LIVRE:
            return Response({'detail': 'Cette commande est déjà livrée.'}, status=400)
        if order.status == Order.Status.ANNULE:
            return Response({'detail': 'Cette commande est annulée.'}, status=400)

        lines = order.lines.filter(variant__isnull=False).select_related('variant__stock')
        # Vérifie le stock de CHAQUE ligne avant de rien modifier — on préfère un refus net à
        # une livraison partiellement posée.
        insuffisants = []
        for line in lines:
            stock = getattr(line.variant, 'stock', None)
            disponible = stock.available_qty if stock else 0
            if disponible < line.quantity:
                insuffisants.append(f'{line.variant} (disponible : {disponible}, demandé : {line.quantity})')
        if insuffisants:
            return Response({'detail': 'Stock insuffisant pour : ' + ', '.join(insuffisants)}, status=400)

        with transaction.atomic():
            for line in lines:
                StockMovement.objects.create(
                    boutique=order.boutique, stock=line.variant.stock, product=line.product,
                    user=request.user, movement_type=StockMovement.MovementType.SORTIE,
                    quantite=-line.quantity, reason=StockMovement.Reason.COMMANDE_LIVREE,
                )
            order.status = Order.Status.LIVRE
            order.save(update_fields=['status'])

        return Response(OrderSerializer(order).data)

    # Annule une commande — aucun mouvement de stock à poser (rien n'a encore été sorti tant
    # qu'elle n'était pas livrée).
    @action(detail=True, methods=['post'], url_path='mark-cancelled')
    def mark_cancelled(self, request, pk=None):
        order = self.get_object()
        if order.status == Order.Status.LIVRE:
            return Response({'detail': 'Une commande déjà livrée ne peut plus être annulée.'}, status=400)
        order.status = Order.Status.ANNULE
        order.save(update_fields=['status'])
        return Response(OrderSerializer(order).data)
