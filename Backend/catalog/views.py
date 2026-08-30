# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated

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

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ProductWriteSerializer
        return ProductSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), required_page('products', 'cashier')()]
        return [IsAuthenticated(), required_page('products')()]
