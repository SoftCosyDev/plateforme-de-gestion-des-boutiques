# F : incrémente/décrémente un champ en base sans le relire d'abord (évite une condition de
# course entre deux paiements encaissés au même instant sur le même client).
from django.db.models import F
# transaction.atomic : le solde ET la ligne d'historique se posent ensemble, ou rien.
from django.db import transaction
# action : ajoute une route personnalisée (record-payment) à ce ViewSet.
from rest_framework.decorators import action
# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
# mixins/viewsets : composent une vue LECTURE SEULE pour l'historique des paiements.
from rest_framework import mixins, viewsets

from accounts.permissions import required_page
from boutiques.views import BoutiqueScopedModelViewSet, FullRepresentationOnWriteMixin

from .models import Customer, CustomerPayment
from .serializers import CustomerPaymentSerializer, CustomerSerializer, CustomerWriteSerializer, RecordPaymentSerializer


class CustomerViewSet(FullRepresentationOnWriteMixin, BoutiqueScopedModelViewSet):
    feature_key = 'customers'
    queryset = Customer.objects.select_related('boutique').all()
    read_serializer_class = CustomerSerializer
    # 'boutique' : indispensable pour un SUPERADMIN/OWNER multi-boutiques — sans ce filtre,
    # for_user() renvoie TOUTES leurs boutiques mélangées, jamais juste celle affichée à l'écran.
    filterset_fields = ['boutique']
    search_fields = ['name', 'phone']
    ordering_fields = ['name', 'balance_due']

    # Sérialiseur d'écriture (accepte le solde initial/ardoise en brut) vs de lecture (expose
    # aussi la boutique imbriquée) — même idiome que le reste du backend.
    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return CustomerWriteSerializer
        return CustomerSerializer

    def get_permissions(self):
        # Lecture accessible depuis la page Clients ET la Caisse (recherche d'un client pour
        # une vente à crédit) ; écriture réservée à la page Clients.
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), required_page('customers', 'cashier')()]
        return [IsAuthenticated(), required_page('customers')()]

    # SEUL point d'écriture légitime sur balance_due (voir CustomerWriteSerializer.validate_balance_due,
    # qui bloque tout PATCH direct) : encaisse un règlement d'ardoise en baissant le solde ET en
    # posant une ligne CustomerPayment dans le même mouvement — traçabilité complète de qui a
    # validé quoi, quand, exigée pour ce genre d'opération sensible (argent réellement encaissé).
    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        customer = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data['amount']

        # Refuse un paiement qui ferait passer l'ardoise sous zéro — un trop-perçu n'a pas de
        # sens ici (pas de mécanisme de "crédit client" au-delà de l'ardoise remboursée à 0).
        if amount > customer.balance_due:
            return Response({'amount': ["Le montant dépasse l'ardoise actuelle de ce client."]}, status=400)

        with transaction.atomic():
            # F() plutôt que `customer.balance_due -= amount` : la baisse se fait directement en
            # SQL, jamais à partir d'une valeur Python potentiellement déjà périmée si un autre
            # paiement a été encaissé entre-temps par un autre poste de caisse.
            Customer.objects.filter(pk=customer.pk).update(balance_due=F('balance_due') - amount)
            customer.refresh_from_db(fields=['balance_due'])
            CustomerPayment.objects.create(
                boutique=customer.boutique, customer=customer, amount=amount,
                balance_after=customer.balance_due, user=request.user,
            )

        return Response(CustomerSerializer(customer).data)


# Historique en LECTURE SEULE des règlements d'ardoise — la seule écriture possible passe par
# CustomerViewSet.record_payment ci-dessus, jamais directement ici.
class CustomerPaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = CustomerPayment.objects.select_related('customer', 'user', 'boutique').all()
    serializer_class = CustomerPaymentSerializer
    # 'boutique' : même besoin que sur CustomerViewSet.boutique ; 'customer' : pour n'afficher
    # QUE l'historique d'UN client précis depuis sa fiche, sans tout charger puis filtrer côté client.
    filterset_fields = ['customer', 'boutique']

    def get_queryset(self):
        return super().get_queryset().filter(customer__in=Customer.objects.for_user(self.request.user))

    def get_permissions(self):
        return [IsAuthenticated(), required_page('customers')()]
