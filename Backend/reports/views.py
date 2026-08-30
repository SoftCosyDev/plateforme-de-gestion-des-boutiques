# date/timedelta : calculs de dates pour la tendance sur 6 mois.
from datetime import date

# F : référence un champ dans une requête (ex: available_qty * variant__selling_price).
# Sum/Count : agrégations.
from django.db.models import Count, F, Sum
# APIView : vue DRF générique, pas liée à un modèle précis (adapté à des agrégations transverses).
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import required_page
from catalog.models import Category, Product
from stock.models import Stock, StockMovement
from sales.models import Sale, SaleLine

from .serializers import (
    DashboardCategorySliceSerializer,
    DashboardChartPointSerializer,
    DashboardProductPerformanceSerializer,
    DashboardRecentDataSerializer,
    DashboardSummarySerializer,
)


# Port du DashboardViewSet de SoftCosy, cloisonné par boutique — chaque méthode ci-dessous
# correspond à un des 5 endpoints qu'il exposait (summary/charts/categories/product_performance/
# recent_data), avec deux corrections : un vrai découpage par mois calendaire (SoftCosy
# approxime avec `-timedelta(days=i*30)`, ce qui dérive au fil des mois), et `low_rotation`
# réellement calculé (chez SoftCosy c'est toujours une liste vide, jamais implémenté).

class DashboardSummaryView(APIView):
    # Sert uniquement à documenter la forme de la réponse (Swagger) — pas de queryset ici.
    serializer_class = DashboardSummarySerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('dashboard', 'reports')()]

    def get(self, request):
        user = request.user
        products = Product.objects.for_user(user)
        # Stock cloisonné indirectement : une variante -> son produit -> la boutique du compte.
        stocks = Stock.objects.filter(variant__product__in=products)
        sales = Sale.objects.for_user(user)

        total_products = products.count()
        # Valeur du stock = somme, pour chaque variante, de son stock disponible * son prix de vente.
        total_stock_value = stocks.aggregate(
            total=Sum(F('available_qty') * F('variant__selling_price'))
        )['total'] or 0
        # Nombre de PRODUITS distincts ayant au moins une variante sous son seuil d'alerte.
        active_alerts = products.filter(
            variants__stock__available_qty__lte=F('variants__low_stock_threshold')
        ).distinct().count()
        total_sales_amount = sales.aggregate(total=Sum('total'))['total'] or 0
        today = date.today()
        today_refunds = (
            sales.filter(status=Sale.Status.REMBOURSE, sold_at__date=today).count()
            + StockMovement.objects.filter(
                boutique__in=[b.id for b in _boutiques_for(user)],
                reason__in=[StockMovement.Reason.RETOUR_CLIENT, StockMovement.Reason.REMBOURSEMENT],
                date=today,
            ).count()
        )

        return Response({
            'total_products': total_products,
            'total_stock_value': total_stock_value,
            'active_alerts': active_alerts,
            'total_sales_amount': total_sales_amount,
            'today_refunds': today_refunds,
        })


class DashboardChartsView(APIView):
    serializer_class = DashboardChartPointSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('dashboard', 'reports')()]

    def get(self, request):
        user = request.user
        sale_lines = SaleLine.objects.filter(sale__in=Sale.objects.for_user(user))
        movements = StockMovement.objects.filter(boutique__in=[b.id for b in _boutiques_for(user)])

        data = []
        # 6 vrais mois calendaires (pas une approximation en jours) : remonte mois par mois
        # depuis le mois courant, en gérant correctement le changement d'année.
        today = date.today()
        year, month = today.year, today.month
        months = []
        for _ in range(6):
            months.append((year, month))
            month -= 1
            if month == 0:
                month = 12
                year -= 1
        for year, month in reversed(months):
            ventes = sale_lines.filter(sale__sold_at__year=year, sale__sold_at__month=month).aggregate(
                total=Sum('quantity')
            )['total'] or 0
            entrees = movements.filter(
                movement_type=StockMovement.MovementType.ENTREE, date__year=year, date__month=month,
            ).aggregate(total=Sum('quantite'))['total'] or 0
            data.append({'month': f'{year}-{month:02d}', 'ventes': ventes, 'entrees': entrees})

        return Response(data)


class DashboardCategoriesView(APIView):
    serializer_class = DashboardCategorySliceSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('dashboard', 'reports')()]

    def get(self, request):
        palette = ['#A8650F', '#1F6E5C', '#8A7B5C', '#C77F1B', '#45A38C']
        categories = Category.objects.for_user(request.user).annotate(product_count=Count('products'))
        return Response([
            {'name': c.name, 'value': c.product_count, 'color': palette[i % len(palette)]}
            for i, c in enumerate(categories)
        ])


class DashboardProductPerformanceView(APIView):
    serializer_class = DashboardProductPerformanceSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('dashboard', 'reports')()]

    def get(self, request):
        user = request.user
        products = Product.objects.for_user(user).annotate(
            total_sold=Sum('variants__sale_lines__quantity'),
            total_stock=Sum('variants__stock__available_qty'),
        )
        rotation = []
        for p in products:
            sold = p.total_sold or 0
            stock = p.total_stock or 0
            if sold == 0 and stock == 0:
                # Ni vendu ni en stock -> rien à dire sur sa rotation, on l'exclut du classement.
                continue
            # +1 au dénominateur pour ne jamais diviser par zéro sans pour autant fausser le
            # classement (un produit à stock=0 mais très vendu reste en haut du classement).
            rotation.append({'id': p.id, 'name': p.name, 'sold': sold, 'stock': stock, 'rotation': sold / (stock + 1)})

        rotation.sort(key=lambda r: r['rotation'], reverse=True)
        high_rotation = rotation[:5]
        # low_rotation réellement calculé ici (symétrique de high_rotation) — chez SoftCosy cette
        # liste est toujours vide, jamais implémentée.
        low_rotation = list(reversed(rotation[-5:])) if len(rotation) > 5 else []

        return Response({'high_rotation': high_rotation, 'low_rotation': low_rotation})


class DashboardRecentDataView(APIView):
    serializer_class = DashboardRecentDataSerializer

    def get_permissions(self):
        return [IsAuthenticated(), required_page('dashboard', 'reports', 'settings')()]

    def get(self, request):
        user = request.user
        low_stock_qs = Stock.objects.filter(
            variant__product__in=Product.objects.for_user(user),
            available_qty__lte=F('variant__low_stock_threshold'),
        ).select_related('variant__product').order_by('available_qty')

        seen_products = set()
        low_stock = []
        for stock in low_stock_qs:
            product = stock.variant.product
            # Dédoublonné par produit — ne garde que la pire ligne de stock par produit (comme SoftCosy).
            if product.id in seen_products:
                continue
            seen_products.add(product.id)
            threshold = stock.variant.low_stock_threshold or 0
            if stock.available_qty <= 0:
                severity, message = 'critical', f'{product.name} — rupture de stock'
            elif stock.available_qty <= threshold / 2:
                severity, message = 'critical', f'{product.name} — stock critique ({stock.available_qty})'
            else:
                severity, message = 'warning', f'{product.name} — stock faible ({stock.available_qty})'
            low_stock.append({'product': product.name, 'available_qty': stock.available_qty, 'severity': severity, 'message': message})

        movements = StockMovement.objects.filter(
            boutique__in=[b.id for b in _boutiques_for(user)]
        ).select_related('product', 'stock__variant__product').order_by('-created_at')[:5]
        recent_movements = [{
            'product_name': (m.product.name if m.product else (m.stock.variant.product.name if m.stock else '')),
            'type': m.movement_type, 'qty': m.quantite, 'date': m.date,
        } for m in movements]

        return Response({'low_stock': low_stock, 'movements': recent_movements})


# Petite aide partagée : liste des boutiques visibles pour ce compte, pour les agrégations qui
# filtrent directement sur `boutique__in` (StockMovement n'a pas de manager cloisonné dédié ici
# car il est déjà accessible via Product/Sale dans la plupart des cas, sauf ici).
def _boutiques_for(user):
    from boutiques.models import Boutique
    if user.is_superuser or user.account_type == user.AccountType.SUPERADMIN:
        return Boutique.objects.all()
    if user.account_type == user.AccountType.OWNER:
        return Boutique.objects.filter(owner=user)
    return Boutique.objects.filter(pk=user.employee_profile.boutique_id)
