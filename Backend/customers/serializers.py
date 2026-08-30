# serializers : briques de base de DRF.
from rest_framework import serializers

from boutiques.serializers import BoutiqueScopedWriteSerializerMixin

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ['id', 'boutique', 'name', 'phone', 'address', 'balance_due', 'created_at']
        read_only_fields = ['id', 'created_at']


class CustomerWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'customers'

    class Meta:
        model = Customer
        fields = ['id', 'boutique', 'name', 'phone', 'address', 'balance_due']
        read_only_fields = ['id']
