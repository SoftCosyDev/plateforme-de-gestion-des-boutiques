# serializers : briques de base de DRF pour convertir des modèles en JSON et valider les entrées.
from rest_framework import serializers

# User : pour comparer account_type dans le mixin ci-dessous.
from accounts.models import User

from .models import Boutique, BoutiqueSettings


# Mixin réutilisé par TOUS les sérialiseurs d'écriture des modèles à champ `boutique` (Product,
# Sale, Purchase...). Applique le cloisonnement à deux niveaux sur le champ `boutique` lui-même :
# - EMPLOYEE : le champ devient facultatif (BoutiqueScopedModelViewSet.perform_create l'écrase
#   de toute façon avec sa propre boutique, jamais avec une valeur envoyée par le client) ;
# - OWNER : ne peut choisir qu'une de SES boutiques, et seulement si elle a bien activé la
#   fonctionnalité concernée (feature_key, défini par la sous-classe concrète) ;
# - SUPERADMIN : aucune restriction, le champ reste obligatoire.
class BoutiqueScopedWriteSerializerMixin:
    # Clé de fonctionnalité à vérifier — chaque sérialiseur concret la redéfinit (ex: 'products').
    feature_key = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Le contexte de requête n'existe pas hors d'une vraie requête HTTP (ex: tests unitaires
        # sans contexte) — dans ce cas, on ne touche pas au champ.
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated or 'boutique' not in self.fields:
            return
        user = request.user
        if user.account_type == User.AccountType.OWNER:
            # Ne propose que les boutiques de CET owner.
            qs = Boutique.objects.filter(owner=user)
            # Et seulement celles qui ont réellement activé cette fonctionnalité.
            if self.feature_key:
                qs = qs.filter(enabled_features__contains=[self.feature_key])
            self.fields['boutique'].queryset = qs
        elif user.account_type == User.AccountType.EMPLOYEE:
            # La vue impose de toute façon sa propre boutique — le champ n'est plus obligatoire ici.
            self.fields['boutique'].required = False


# Sérialiseur de lecture — inclut les réglages imbriqués pour un affichage complet en un seul appel.
class BoutiqueSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoutiqueSettings
        # `id` exposé en lecture : indispensable pour que le client sache QUEL
        # `/boutique-settings/{id}/` cibler ensuite (PATCH), la ligne étant
        # imbriquée ici mais modifiée via son propre endpoint séparé.
        fields = [
            'id', 'low_stock_threshold', 'critical_stock_threshold',
            'notify_low_stock', 'notify_system_updates', 'notify_weekly_report',
        ]
        read_only_fields = ['id']


class BoutiqueSerializer(serializers.ModelSerializer):
    # Réglages imbriqués en lecture seule — modifiés via leur propre endpoint, pas ici.
    settings = BoutiqueSettingsSerializer(read_only=True)

    class Meta:
        model = Boutique
        fields = [
            'id', 'owner', 'name', 'neighborhood', 'theme_primary_color', 'theme_accent_color',
            'business_type', 'enabled_features', 'variant_attributes', 'is_active', 'settings', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# Sérialiseur d'écriture — création/modification d'une boutique elle-même (pas de mixin
# BoutiqueScopedWriteSerializerMixin ici : Boutique n'a pas de champ `boutique`, c'est elle-même
# la racine du cloisonnement).
class BoutiqueWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Boutique
        fields = [
            'id', 'owner', 'name', 'neighborhood', 'theme_primary_color', 'theme_accent_color',
            'business_type', 'enabled_features', 'variant_attributes', 'is_active',
        ]
        read_only_fields = ['id']
        # owner facultatif au niveau du champ — validate() ci-dessous impose la vraie règle.
        # is_active facultatif aussi : absent = ne touche pas au champ (voir validate()).
        # variant_attributes facultatif : librement modifiable par l'Owner lui-même (contrairement
        # à enabled_features) — c'est le vocabulaire de déclinaisons de SA boutique, pas un
        # abonnement vendu par la plateforme.
        extra_kwargs = {
            'owner': {'required': False}, 'is_active': {'required': False},
            'enabled_features': {'required': False}, 'variant_attributes': {'required': False},
        }

    def validate(self, attrs):
        user = self.context['request'].user
        if user.account_type == User.AccountType.SUPERADMIN:
            # Un Super Admin DOIT préciser qui est propriétaire (aucun moyen de le deviner).
            if not attrs.get('owner') and not self.instance:
                raise serializers.ValidationError({'owner': "Un super administrateur doit préciser le propriétaire."})
        else:
            # Un Owner ne peut créer/modifier une boutique que pour lui-même — jamais une autre valeur.
            attrs['owner'] = user
            # Activer/désactiver relève d'une décision d'abonnement, réservée à la plateforme —
            # un Owner ne doit jamais pouvoir se réactiver lui-même ni, pire, se désactiver par
            # erreur en modifiant autre chose sur sa propre fiche.
            if 'is_active' in attrs and attrs['is_active'] != (self.instance.is_active if self.instance else True):
                raise serializers.ValidationError({'is_active': "Seul un super administrateur peut activer/désactiver une boutique."})
            attrs.pop('is_active', None)
            # Les fonctionnalités activées correspondent à un abonnement vendu par la plateforme —
            # un Owner ne se les accorde jamais lui-même, seul un SUPERADMIN les attribue (à la
            # création comme à tout moment ensuite). Une boutique nouvellement créée par un Owner
            # démarre donc SANS aucune fonctionnalité, en attendant que la plateforme les active.
            if 'enabled_features' in attrs and attrs['enabled_features'] != (self.instance.enabled_features if self.instance else []):
                raise serializers.ValidationError({'enabled_features': "Seul un super administrateur peut modifier les fonctionnalités activées d'une boutique."})
            attrs.pop('enabled_features', None)
        return attrs
