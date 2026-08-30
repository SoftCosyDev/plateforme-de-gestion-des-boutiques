# settings : accès aux réglages du projet (DEBUG, MEDIA_URL...).
from django.conf import settings
# static : sert les fichiers médias directement par Django (développement seulement).
from django.conf.urls.static import static
# admin : interface d'administration Django.
from django.contrib import admin
# path/include : pour déclarer des routes.
from django.urls import include, path
# Vues de documentation OpenAPI générées automatiquement par drf-spectacular.
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
# DefaultRouter : génère automatiquement les routes CRUD (list/create/retrieve/update/destroy)
# pour chaque ViewSet enregistré ci-dessous.
from rest_framework.routers import DefaultRouter

from accounts.views import LoginView, UserViewSet
from boutiques.views import BoutiqueSettingsViewSet, BoutiqueViewSet
from catalog.views import CategoryViewSet, ProductViewSet
from customers.views import CustomerViewSet
from employees.views import AttendanceRecordViewSet, EmployeeProfileViewSet
from inventory.views import InventoryCountViewSet, InventoryLineViewSet
from orders.views import OrderViewSet
from payroll.views import PayrollEntryViewSet
from purchases.views import PurchaseViewSet, SupplierViewSet
from reports.views import (
    DashboardCategoriesView,
    DashboardChartsView,
    DashboardProductPerformanceView,
    DashboardRecentDataView,
    DashboardSummaryView,
)
from sales.views import SaleLineViewSet, SaleViewSet
from stock.views import StockMovementViewSet

# Un seul routeur centralisé pour toute l'API — pas de urls.py par app laissés non branchés.
router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'boutiques', BoutiqueViewSet, basename='boutique')
router.register(r'boutique-settings', BoutiqueSettingsViewSet, basename='boutique-settings')
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'stock-movements', StockMovementViewSet, basename='stock-movement')
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'sales', SaleViewSet, basename='sale')
router.register(r'sale-lines', SaleLineViewSet, basename='sale-line')
router.register(r'orders', OrderViewSet, basename='order')
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'purchases', PurchaseViewSet, basename='purchase')
router.register(r'employees', EmployeeProfileViewSet, basename='employee')
router.register(r'attendance-records', AttendanceRecordViewSet, basename='attendance-record')
router.register(r'payroll-entries', PayrollEntryViewSet, basename='payroll-entry')
router.register(r'inventory-counts', InventoryCountViewSet, basename='inventory-count')
router.register(r'inventory-lines', InventoryLineViewSet, basename='inventory-line')

urlpatterns = [
    # ── Authentification ────────────────────────────────────────────────────
    path('api/token/', LoginView.as_view(), name='api_token_auth'),

    # ── Interface d'administration Django ──────────────────────────────────
    path('admin/', admin.site.urls),

    # ── API ──────────────────────────────────────────────────────────────────
    path('api/', include(router.urls)),
    # Rapports : pas de ViewSet (pas de modèle), routes déclarées à la main.
    path('api/reports/summary/', DashboardSummaryView.as_view(), name='reports-summary'),
    path('api/reports/charts/', DashboardChartsView.as_view(), name='reports-charts'),
    path('api/reports/categories/', DashboardCategoriesView.as_view(), name='reports-categories'),
    path('api/reports/product-performance/', DashboardProductPerformanceView.as_view(), name='reports-product-performance'),
    path('api/reports/recent-data/', DashboardRecentDataView.as_view(), name='reports-recent-data'),

    # ── Documentation API (Swagger / ReDoc) ────────────────────────────────
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

# En développement seulement : sert les fichiers médias uploadés (photos de profil...)
# directement par Django, pour pouvoir les visualiser sans configurer Cloudinary.
if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [path('__debug__/', include('debug_toolbar.urls'))]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
