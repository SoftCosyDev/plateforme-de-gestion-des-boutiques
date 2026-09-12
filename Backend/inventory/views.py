# transaction.atomic : clôturer un inventaire pose plusieurs mouvements d'ajustement d'un coup.
from django.db import transaction
# mixins : briques individuelles pour composer une vue sur mesure (InventoryLineViewSet).
# viewsets : briques de base de DRF.
from rest_framework import mixins, viewsets
# action : ajoute une route personnalisée (finish) à ce ViewSet.
from rest_framework.decorators import action
# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnCreateMixin
from stock.models import StockMovement

from .models import InventoryCount, InventoryLine
from .serializers import InventoryCountSerializer, InventoryCountWriteSerializer, InventoryLineSerializer, InventoryLineUpdateSerializer


class InventoryCountViewSet(FullRepresentationOnCreateMixin, BoutiqueScopedModelViewSet):
    feature_key = 'inventory'
    # Pas d'update générique : le seul changement d'état possible passe par l'action `finish`.
    http_method_names = ['get', 'post', 'head', 'options']
    queryset = InventoryCount.objects.select_related('boutique', 'user').prefetch_related('lines').all()
    read_serializer_class = InventoryCountSerializer
    # 'boutique' : voir le commentaire équivalent sur catalog/views.py::CategoryViewSet.
    filterset_fields = ['status', 'boutique']
    ordering_fields = ['created_at']

    # Sérialiseur d'écriture (à la création, pose une ligne par variante avec le stock système
    # comme quantité attendue, voir InventoryCountWriteSerializer) vs de lecture (expose les
    # lignes déjà comptées) — même idiome que le reste du backend.
    def get_serializer_class(self):
        if self.action == 'create':
            return InventoryCountWriteSerializer
        return InventoryCountSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('inventory')()]

    # Clôture l'inventaire : pour chaque ligne comptée dont l'écart avec le stock système n'est
    # pas nul, pose un StockMovement AJUSTEMENT — le 3e chemin (avec vente et achat) qui
    # alimente le ledger de stock (voir Backend/docs/schema.md). Recalcule aussi les champs de
    # synthèse de l'en-tête (total_variantes/quantite_comptee/ecart) à cette occasion.
    @action(detail=True, methods=['post'])
    def finish(self, request, pk=None):
        count = self.get_object()
        if count.status == InventoryCount.Status.TERMINE:
            return Response({'detail': 'Cet inventaire est déjà terminé.'}, status=400)

        with transaction.atomic():
            quantite_comptee_totale = 0
            ecart_total = 0
            for line in count.lines.select_related('variant__stock', 'product').all():
                if line.counted_qty is None:
                    # Ligne pas encore comptée physiquement -> ignorée, pas d'ajustement posé.
                    continue
                quantite_comptee_totale += line.counted_qty
                ecart_total += line.discrepancy or 0
                if line.discrepancy:
                    StockMovement.objects.create(
                        boutique=count.boutique, stock=getattr(line.variant, 'stock', None),
                        product=line.product, user=request.user,
                        movement_type=StockMovement.MovementType.AJUSTEMENT,
                        quantite=line.discrepancy, reason=StockMovement.Reason.CORRECTION_INVENTAIRE,
                    )
            count.quantite_comptee = quantite_comptee_totale
            count.ecart = ecart_total
            count.status = InventoryCount.Status.TERMINE
            count.save(update_fields=['quantite_comptee', 'ecart', 'status'])

        return Response(InventoryCountSerializer(count).data)


# Enregistre le comptage physique ligne par ligne — pas de create/destroy direct ici, les
# lignes n'existent qu'à travers leur session d'inventaire (voir InventoryCountWriteSerializer).
class InventoryLineViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = InventoryLine.objects.select_related('inventory_count', 'product', 'variant').all()
    # 'inventory_count__boutique' : pas de champ boutique direct sur InventoryLine, on filtre via
    # la session d'inventaire parente (même besoin que sur InventoryCountViewSet.boutique).
    filterset_fields = ['inventory_count', 'variant', 'inventory_count__boutique']

    # En écriture, seule `counted_qty` est modifiable (voir InventoryLineUpdateSerializer, qui
    # recalcule discrepancy côté serveur) — en lecture, la ligne complète avec produit/variante.
    def get_serializer_class(self):
        if self.action in ('update', 'partial_update'):
            return InventoryLineUpdateSerializer
        return InventoryLineSerializer

    def get_queryset(self):
        # Pas de champ `boutique` direct sur InventoryLine -> cloisonnement via la session parente.
        return super().get_queryset().filter(
            inventory_count__in=InventoryCount.objects.for_user(self.request.user),
        )

    def get_permissions(self):
        return [IsAuthenticated(), required_page('inventory')()]
