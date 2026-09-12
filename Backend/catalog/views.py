# action : ajoute une route personnalisée (upload-image/delete-image) à ProductViewSet.
from rest_framework.decorators import action
# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnWriteMixin

from .models import Category, Product
from .serializers import CategorySerializer, CategoryWriteSerializer, ProductSerializer, ProductWriteSerializer


# Catégories d'UNE boutique — pas de vue globale (Category a toujours un boutique_id, voir le
# modèle) : cloisonnée comme toute ressource métier, via BoutiqueScopedModelViewSet.
class CategoryViewSet(FullRepresentationOnWriteMixin, BoutiqueScopedModelViewSet):
    # Une catégorie n'a de sens que si le catalogue ('products') est activé sur la boutique.
    feature_key = 'products'
    queryset = Category.objects.select_related('boutique').all()
    read_serializer_class = CategorySerializer
    # 'boutique' : indispensable pour un SUPERADMIN/OWNER multi-boutiques — sans ce filtre,
    # for_user() renvoie TOUTES leurs boutiques mélangées, jamais juste celle affichée à l'écran.
    filterset_fields = ['boutique']
    # Recherche texte disponible sur le nom.
    search_fields = ['name']
    ordering_fields = ['name']

    # Sérialiseur d'écriture (accepte juste le nom/description/image bruts) vs de lecture
    # (expose aussi la boutique imbriquée) — même idiome que le reste du backend.
    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return CategoryWriteSerializer
        return CategorySerializer

    def get_permissions(self):
        # Lecture accessible depuis la page Produits ET la Caisse (qui affiche aussi les
        # catégories pour filtrer) ; écriture réservée à la page Produits.
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), required_page('products', 'cashier')()]
        return [IsAuthenticated(), required_page('products')()]


class ProductViewSet(FullRepresentationOnWriteMixin, BoutiqueScopedModelViewSet):
    feature_key = 'products'
    queryset = Product.objects.select_related('boutique', 'category').prefetch_related('variants', 'variants__stock').all()
    read_serializer_class = ProductSerializer
    # Filtres directement disponibles en paramètre de requête (?category=1, ?unit=kg...).
    # 'boutique' : voir le commentaire équivalent sur CategoryViewSet ci-dessus.
    filterset_fields = ['category', 'unit', 'is_published', 'boutique']
    search_fields = ['name', 'code_produit', 'variants__sku', 'variants__barcode']
    ordering_fields = ['name']

    # Sérialiseur d'écriture (accepte le produit ET ses variantes imbriquées en un seul appel,
    # voir ProductWriteSerializer) vs de lecture (expose aussi le stock calculé de chaque
    # variante) — même idiome que le reste du backend, mais avec une charge utile plus riche ici.
    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ProductWriteSerializer
        return ProductSerializer

    # Même règle que CategoryViewSet ci-dessus : lecture ouverte à la Caisse (recherche d'un
    # article à encaisser), écriture réservée à la page Produits.
    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), required_page('products', 'cashier')()]
        return [IsAuthenticated(), required_page('products')()]

    # Photo du produit — remplace visuellement l'emoji par défaut dès qu'elle est présente (voir
    # ProductSerializer.image et products/page.tsx). Séparée du JSON de création/modification,
    # même principe que EmployeeProfileViewSet.upload_photo (multipart, jamais mêlé aux variantes
    # imbriquées) — `get_object()` applique déjà le cloisonnement habituel par boutique.
    @action(detail=True, methods=['post'], url_path='upload-image')
    def upload_image(self, request, pk=None):
        instance = self.get_object()
        fichier = request.FILES.get('image')
        if not fichier:
            return Response({'detail': 'Aucun fichier fourni (champ "image").'}, status=400)
        instance.image = fichier
        instance.save(update_fields=['image'])
        return Response(ProductSerializer(instance, context={'request': request}).data)

    # Retire la photo -> l'affichage retombe sur l'emoji (voir products/page.tsx), jamais une
    # suppression du produit lui-même.
    @action(detail=True, methods=['post'], url_path='delete-image')
    def delete_image(self, request, pk=None):
        instance = self.get_object()
        instance.image.delete(save=False)
        instance.image = None
        instance.save(update_fields=['image'])
        return Response(ProductSerializer(instance, context={'request': request}).data)
