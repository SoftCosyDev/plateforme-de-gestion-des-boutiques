# mixins : briques individuelles (retrieve/update/...) pour composer une vue sur mesure.
# viewsets : briques de base de DRF pour construire des vues CRUD complètes.
from rest_framework import mixins, viewsets
# IsAuthenticated : exige une session valide.
from rest_framework.permissions import IsAuthenticated
# Response : pour construire une réponse HTTP explicite.
from rest_framework.response import Response

from accounts.models import User

from .models import Boutique, BoutiqueSettings
from .permissions import IsOwnerOrSuperAdmin
from .serializers import BoutiqueSerializer, BoutiqueSettingsSerializer, BoutiqueWriteSerializer


# Base commune à TOUTE vue sur un modèle métier avec un champ `boutique` — voir
# Backend/docs/schema.md. Le cloisonnement à deux niveaux (boutique du compte + fonctionnalité
# activée) s'applique une seule fois, ici : aucune vue métier ne doit le réimplémenter.
class BoutiqueScopedModelViewSet(viewsets.ModelViewSet):
    # Redéfini par chaque sous-classe concrète (ex: 'products', 'purchases') — la fonctionnalité
    # que la boutique doit avoir activée pour que ses données apparaissent ici. None = pas de
    # vérification (utilisé par des ressources qui n'ont pas de bascule dédiée).
    feature_key = None

    def get_queryset(self):
        user = self.request.user
        # Cloisonnement de base : SUPERADMIN voit tout, OWNER ses boutiques, EMPLOYEE la sienne.
        qs = super().get_queryset().for_user(user)
        # Filtre supplémentaire : sans ça, un Owner verrait les données d'une boutique qui a
        # DÉSACTIVÉ cette fonctionnalité entre-temps — vérifié même pour un EMPLOYEE (défense en
        # profondeur : allowed_pages est censé rester un sous-ensemble d'enabled_features, mais
        # on ne fait pas confiance uniquement à cette invariance ailleurs dans le code).
        if self.feature_key and not (user.is_superuser or user.account_type == User.AccountType.SUPERADMIN):
            qs = qs.filter(boutique__enabled_features__contains=[self.feature_key])
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if user.account_type == User.AccountType.EMPLOYEE:
            # Jamais le boutique_id du client : toujours celle de l'employé connecté.
            serializer.save(boutique=user.employee_profile.boutique)
        else:
            # OWNER/SUPERADMIN : la boutique vient du payload, déjà filtrée par
            # BoutiqueScopedWriteSerializerMixin (n'accepte qu'une boutique où feature_key est activé).
            serializer.save()


# Mixin technique : répond après un create/update avec le sérialiseur de LECTURE plutôt que
# celui d'écriture utilisé pour valider la requête — utile quand celui-ci n'expose pas les
# champs calculés/imbriqués (stock, net_pay, lignes d'une vente...) que le client veut voir
# immédiatement après coup, sans devoir refaire un GET séparé.
class _FullRepresentationMixinBase:
    # Redéfini par chaque vue concrète — le sérialiseur utilisé pour LIRE cette ressource.
    read_serializer_class = None

    def _read_response(self, instance, status_code):
        serializer = self.read_serializer_class(instance, context=self.get_serializer_context())
        return Response(serializer.data, status=status_code)


# Pour les vues qui ne supportent QUE la création (pas de modification après coup, ex: Sale).
class FullRepresentationOnCreateMixin(_FullRepresentationMixinBase):
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return self._read_response(serializer.instance, 201)


# Pour les vues qui supportent la modification (PUT/PATCH).
class FullRepresentationOnUpdateMixin(_FullRepresentationMixinBase):
    def update(self, request, *args, **kwargs):
        # DRF passe partial=True pour un PATCH, absent (donc False) pour un PUT complet.
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return self._read_response(serializer.instance, 200)


# Pour les vues qui supportent création ET modification (la majorité) — combine les deux mixins ci-dessus.
class FullRepresentationOnWriteMixin(FullRepresentationOnCreateMixin, FullRepresentationOnUpdateMixin):
    pass


# Gestion des boutiques elles-mêmes (pas de leur contenu) — création réservée OWNER/SUPERADMIN.
# PAS de suppression (voir http_method_names) : une boutique cliente ne se supprime jamais via
# l'API, aussi bien pour préserver son historique que parce que PROTECT sur les FK de tout ce
# qu'elle contient l'empêcherait de toute façon dès qu'elle a la moindre donnée — la désactiver
# (`is_active=False`, réservé SUPERADMIN, voir BoutiqueWriteSerializer) est la seule voie prévue
# pour une boutique qui ne souscrit plus à la plateforme.
class BoutiqueViewSet(FullRepresentationOnWriteMixin, viewsets.ModelViewSet):
    http_method_names = ['get', 'post', 'patch', 'put', 'head', 'options']
    queryset = Boutique.objects.select_related('owner', 'settings').all()
    read_serializer_class = BoutiqueSerializer

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return BoutiqueWriteSerializer
        return BoutiqueSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Boutique.objects.select_related('owner', 'settings').all()
        if user.is_superuser or user.account_type == User.AccountType.SUPERADMIN:
            return qs
        if user.account_type == User.AccountType.OWNER:
            return qs.filter(owner=user)
        # EMPLOYEE : lecture seule sur sa propre boutique (la création est bloquée par get_permissions).
        return qs.filter(pk=user.employee_profile.boutique_id)

    def get_permissions(self):
        # 'destroy' n'apparaît plus ici : jamais routée de toute façon (voir http_method_names).
        if self.action in ('create', 'update', 'partial_update'):
            return [IsAuthenticated(), IsOwnerOrSuperAdmin()]
        return [IsAuthenticated()]

    # Crée automatiquement la ligne de réglages par défaut dès qu'une boutique est créée — sans
    # ça, BoutiqueSettings resterait absent tant que personne n'y touche explicitement.
    def perform_create(self, serializer):
        boutique = serializer.save()
        BoutiqueSettings.objects.create(boutique=boutique)


# Modification des réglages d'une boutique (seuils, notifications) — jamais de création/suppression
# directe ici, la ligne existe déjà (créée automatiquement avec la boutique, voir ci-dessus).
class BoutiqueSettingsViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet,
):
    # Présent uniquement pour que la documentation Swagger devine le type de la clé primaire
    # (entier) — get_queryset() ci-dessous reste la SEULE source réelle utilisée à l'exécution.
    queryset = BoutiqueSettings.objects.all()
    serializer_class = BoutiqueSettingsSerializer

    def get_queryset(self):
        user = self.request.user
        qs = BoutiqueSettings.objects.select_related('boutique')
        if user.is_superuser or user.account_type == User.AccountType.SUPERADMIN:
            return qs
        if user.account_type == User.AccountType.OWNER:
            return qs.filter(boutique__owner=user)
        return qs.filter(boutique=user.employee_profile.boutique)

    def get_permissions(self):
        # Modifier les réglages reste une décision de propriétaire, pas d'un simple employé.
        if self.action in ('update', 'partial_update'):
            return [IsAuthenticated(), IsOwnerOrSuperAdmin()]
        return [IsAuthenticated()]
