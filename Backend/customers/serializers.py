# Decimal : calcul monétaire exact (jamais de float pour de l'argent).
from decimal import Decimal

# serializers : briques de base de DRF.
from rest_framework import serializers

from boutiques.serializers import BoutiqueScopedWriteSerializerMixin

from .models import Customer, CustomerPayment


# Lecture : simple, aucun champ calculé/imbriqué à exposer ici (contrairement à Product/Sale...)
# — un client reste une fiche plate (nom, téléphone, ardoise), voir Backend/docs/schema.md.
class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ['id', 'boutique', 'name', 'phone', 'address', 'balance_due', 'created_at']
        read_only_fields = ['id', 'created_at']


# BoutiqueScopedWriteSerializerMixin (voir boutiques/serializers.py) : vérifie que la boutique
# ciblée a bien 'customers' dans ses enabled_features avant d'accepter la création/modification.
class CustomerWriteSerializer(BoutiqueScopedWriteSerializerMixin, serializers.ModelSerializer):
    feature_key = 'customers'

    class Meta:
        model = Customer
        fields = ['id', 'boutique', 'name', 'phone', 'address', 'balance_due']
        read_only_fields = ['id']

    # balance_due reste modifiable à la CRÉATION (reprise d'une ardoise déjà due avant l'arrivée
    # sur la plateforme, voir aussi Frontend/src/lib/queries/customers.ts) mais plus JAMAIS après
    # coup : toute évolution ultérieure doit obligatoirement passer par
    # CustomerViewSet.record_payment, le seul point qui pose une ligne CustomerPayment — sans
    # cette garde, un simple PATCH silencieux redeviendrait possible et l'historique mentirait.
    def validate_balance_due(self, value):
        if self.instance is not None and value != self.instance.balance_due:
            raise serializers.ValidationError(
                "Le solde ne se modifie plus directement ici — utilise l'action \"Encaisser un paiement\"."
            )
        return value


# Historique de règlement d'un client — voir CustomerPayment pour le pourquoi de ce ledger séparé.
class CustomerPaymentSerializer(serializers.ModelSerializer):
    # Nom lisible de qui a encaissé ce paiement — évite un second appel (vers /users/) juste pour
    # afficher "encaissé par ...". Vide si le compte a depuis été supprimé (voir User SET_NULL).
    user_name = serializers.CharField(source='user.full_name', read_only=True, default='')

    class Meta:
        model = CustomerPayment
        fields = ['id', 'boutique', 'customer', 'amount', 'balance_after', 'user', 'user_name', 'created_at']
        # Purement en lecture : la seule écriture possible passe par RecordPaymentSerializer,
        # jamais directement sur ce modèle (voir CustomerViewSet.record_payment).
        read_only_fields = fields


# Utilisé uniquement par CustomerViewSet.record_payment — pas un ModelSerializer classique : le
# client (au sens HTTP) ne fournit QUE le montant réglé, tout le reste (boutique, solde après
# paiement, qui a encaissé) est calculé côté serveur, jamais reçu tel quel.
class RecordPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
