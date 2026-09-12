# serializers : briques de base de DRF — servent ici uniquement à décrire la FORME de la
# réponse pour la documentation Swagger (ces vues n'ont pas de modèle, voir reports/models.py).
from rest_framework import serializers


class DashboardSummarySerializer(serializers.Serializer):
    total_products = serializers.IntegerField()
    total_stock_value = serializers.DecimalField(max_digits=14, decimal_places=2)
    active_alerts = serializers.IntegerField()
    total_sales_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_profit = serializers.DecimalField(max_digits=14, decimal_places=2)
    today_sales_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    today_sales_count = serializers.IntegerField()
    today_refunds = serializers.IntegerField()


class DashboardChartPointSerializer(serializers.Serializer):
    month = serializers.CharField()
    ventes = serializers.DecimalField(max_digits=14, decimal_places=2)
    entrees = serializers.DecimalField(max_digits=14, decimal_places=2)


class DashboardCategorySliceSerializer(serializers.Serializer):
    name = serializers.CharField()
    value = serializers.IntegerField()
    color = serializers.CharField()


class DashboardProductRotationSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    sold = serializers.DecimalField(max_digits=14, decimal_places=2)
    stock = serializers.DecimalField(max_digits=14, decimal_places=2)
    rotation = serializers.FloatField()


class DashboardProductPerformanceSerializer(serializers.Serializer):
    high_rotation = DashboardProductRotationSerializer(many=True)
    low_rotation = DashboardProductRotationSerializer(many=True)


class DashboardLowStockSerializer(serializers.Serializer):
    product = serializers.CharField()
    available_qty = serializers.DecimalField(max_digits=10, decimal_places=2)
    severity = serializers.CharField()
    message = serializers.CharField()


class DashboardMovementSerializer(serializers.Serializer):
    product_name = serializers.CharField()
    type = serializers.CharField()
    qty = serializers.DecimalField(max_digits=10, decimal_places=2)
    date = serializers.DateField()


class DashboardRecentDataSerializer(serializers.Serializer):
    low_stock = DashboardLowStockSerializer(many=True)
    movements = DashboardMovementSerializer(many=True)
