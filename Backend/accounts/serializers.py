# authenticate : fonction Django qui vérifie un couple identifiant/mot de passe contre les
# "backends" configurés (voir AUTHENTICATION_BACKENDS dans settings.py).
from django.contrib.auth import authenticate
# serializers : briques de base de DRF.
from rest_framework import serializers

from .models import User


# Authentifie par IDENTIFIANT (`username`), jamais par email — cette plateforme n'en a pas.
# `USERNAME_FIELD = 'username'` étant la convention native de Django, `authenticate(username=...,
# password=...)` fonctionne directement, sans backend d'authentification personnalisé à écrire.
class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    # write_only : ne doit jamais être renvoyé dans une réponse, même par erreur.
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        # Le contexte de la vue transmet la requête HTTP en cours (nécessaire à authenticate()).
        request = self.context['request']
        user = authenticate(request=request, username=attrs['username'], password=attrs['password'])

        # Message volontairement générique dans TOUS les cas d'échec (mauvais mot de passe,
        # compte désactivé, employé "inactif") — ne jamais révéler LEQUEL, comme le fait déjà
        # le frontend historiquement (voir Frontend/src/lib/auth.tsx).
        error = serializers.ValidationError("Identifiant ou mot de passe incorrect.")
        if user is None or not user.is_active:
            raise error
        # Un employé désactivé (EmployeeProfile.status='inactif'), OU dont la boutique n'a plus
        # d'abonnement actif (Boutique.is_active=False, décision SUPERADMIN), ne doit pas pouvoir
        # se connecter même si son mot de passe reste correct. Un OWNER, lui, garde toujours accès
        # à son compte même si UNE de ses boutiques est désactivée — il peut en avoir d'autres.
        if user.account_type == User.AccountType.EMPLOYEE:
            profile = getattr(user, 'employee_profile', None)
            if profile is None or profile.status != profile.Status.ACTIF or not profile.boutique.is_active:
                raise error

        # Stocke l'utilisateur authentifié pour que la vue puisse le récupérer après validation.
        attrs['user'] = user
        return attrs


# Sérialiseur de lecture pour "mon propre compte" — jamais utilisé pour voir un AUTRE compte.
class UserSerializer(serializers.ModelSerializer):
    # Jamais le PIN lui-même (ni son hash) — juste "en a-t-il configuré un", pour que le
    # frontend sache proposer "Configurer" ou "Modifier" sur l'écran de profil.
    has_pin = serializers.BooleanField(read_only=True)
    # Même principe : jamais la question/réponse elles-mêmes, juste si le compte peut se servir
    # de "identifiant/mot de passe oublié" en autonomie (voir PasswordResetView).
    has_security_question = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'profile_photo', 'account_type', 'is_active',
            'has_pin', 'has_security_question', 'security_question',
        ]
        # Tous les champs en lecture seule ici : la modification passe par UserMeUpdateSerializer
        # (nom/téléphone) ou SetSecurityQuestionSerializer (question de sécurité).
        read_only_fields = fields


# Sérialiseur d'écriture pour la modification de SON PROPRE profil (nom complet, téléphone).
class UserMeUpdateSerializer(serializers.ModelSerializer):
    # Le téléphone vit sur EmployeeProfile, pas sur User — voir update() ci-dessous, qui
    # reproduit exactement le comportement de Frontend/src/components/profile-modal.tsx.
    phone = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = ['full_name', 'phone']

    def update(self, instance, validated_data):
        # Retire "phone" des champs à sauvegarder directement sur User (il n'existe pas dessus).
        phone = validated_data.pop('phone', None)
        instance = super().update(instance, validated_data)
        # Ne répercute le téléphone que si le compte a bien un profil employé.
        if phone is not None and instance.account_type == User.AccountType.EMPLOYEE:
            profile = getattr(instance, 'employee_profile', None)
            if profile is not None:
                profile.phone = phone
                profile.save(update_fields=['phone'])
        return instance


# Lecture d'un compte OWNER pour le sélecteur "propriétaire existant" de l'écran SuperAdmin
# (création d'une nouvelle boutique) — jamais utilisé pour un EMPLOYEE ou un autre SUPERADMIN,
# le filtrage par account_type se fait dans la vue (UserViewSet.list_owners).
class OwnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'profile_photo', 'is_active']
        # Lecture seule : la modification d'un propriétaire ne passe pas par cette action.
        read_only_fields = fields


# Création d'un NOUVEAU compte OWNER par le SuperAdmin (onboarding d'un commerçant sur la
# plateforme) — jamais accessible à un OWNER ou un EMPLOYEE, réservé via IsSuperAdmin côté vue.
class OwnerCreateSerializer(serializers.ModelSerializer):
    # write_only : ne doit jamais réapparaître dans la réponse, même par erreur.
    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = User
        fields = ['username', 'password', 'full_name']

    def create(self, validated_data):
        # create_user hache le mot de passe — jamais de création manuelle via User(...).
        return User.objects.create_user(account_type=User.AccountType.OWNER, **validated_data)


# Changement de mot de passe — exige de connaître l'ancien (empêche un vol de session de
# changer le mot de passe sans le connaître).
class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    # Longueur minimale de 4, cohérente avec la règle déjà appliquée côté frontend.
    new_password = serializers.CharField(write_only=True, min_length=4)

    def validate_current_password(self, value):
        # check_password compare au mot de passe HACHÉ stocké, jamais en clair.
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError("Le mot de passe actuel est incorrect.")
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        # set_password hache automatiquement la nouvelle valeur.
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


# Configure/change le code PIN de déverrouillage — exige le VRAI mot de passe (jamais l'ancien
# PIN, qui n'existe peut-être pas encore) : sans ça, quelqu'un profitant d'une session déjà
# ouverte pourrait s'attribuer un code PIN à son insu et revenir déverrouiller plus tard.
class SetPinSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)
    # 4 à 6 chiffres — assez court pour se taper vite au comptoir, assez long pour ne pas se
    # deviner en 3 essais (le débit de requêtes reste de toute façon limité, voir UserViewSet.unlock).
    pin = serializers.RegexField(r'^\d{4,6}$', write_only=True, error_messages={
        'invalid': 'Le code PIN doit contenir entre 4 et 6 chiffres.',
    })

    def validate_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError("Mot de passe incorrect.")
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_pin(self.validated_data['pin'])
        user.save(update_fields=['pin_hash'])
        return user


# Déverrouille une session mise en veille par inactivité (voir LockOverlay côté frontend) — PAS
# une connexion : le jeton reste le même, cette route confirme seulement "c'est toujours toi".
# Accepte indifféremment le code PIN OU le mot de passe complet, pour ne jamais coincer un compte
# qui n'a pas encore configuré de PIN (voir User.has_pin).
class UnlockSerializer(serializers.Serializer):
    pin = serializers.CharField(write_only=True)

    def validate_pin(self, value):
        user = self.context['request'].user
        if user.check_pin(value) or user.check_password(value):
            return value
        raise serializers.ValidationError("Code incorrect.")


# Configure/change la question de sécurité — exige le VRAI mot de passe, même raison que
# SetPinSerializer : sans ça, une session déjà ouverte laissée sans surveillance permettrait à
# n'importe qui d'imposer SA PROPRE question/réponse et de revenir plus tard voler le compte via
# "mot de passe oublié" (voir PasswordResetView).
class SetSecurityQuestionSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)
    question = serializers.CharField(max_length=255)
    # La réponse ne doit jamais réapparaître dans une réponse HTTP, même par erreur.
    answer = serializers.CharField(write_only=True, min_length=2)

    def validate_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError("Mot de passe incorrect.")
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_security_answer(self.validated_data['question'], self.validated_data['answer'])
        user.save(update_fields=['security_question', 'security_answer_hash'])
        return user


# Étape 1 du flux public "identifiant/mot de passe oublié" (voir accounts/views.py) : retrouve
# LA QUESTION à partir du seul identifiant, sans authentification. Message d'échec volontairement
# générique (compte inconnu ET compte sans question configurée renvoient la même erreur) pour ne
# pas confirmer via ce seul appel qu'un identifiant donné existe bien sur la plateforme.
class SecurityQuestionLookupSerializer(serializers.Serializer):
    username = serializers.CharField()

    def validate(self, attrs):
        error = serializers.ValidationError(
            "Compte introuvable, ou aucune question de sécurité n'est configurée pour ce compte. "
            "Contactez ton responsable pour réinitialiser ton mot de passe."
        )
        try:
            user = User.objects.get(username=attrs['username'])
        except User.DoesNotExist:
            raise error
        if not user.is_active or not user.has_security_question:
            raise error
        # Même garde qu'à la connexion (voir LoginSerializer) : un employé désactivé ou dont la
        # boutique n'est plus active ne doit pas pouvoir relancer l'accès par ce biais non plus.
        if user.account_type == User.AccountType.EMPLOYEE:
            profile = getattr(user, 'employee_profile', None)
            if profile is None or profile.status != profile.Status.ACTIF or not profile.boutique.is_active:
                raise error

        attrs['user'] = user
        return attrs


# Étape 2 : vérifie la réponse et pose le nouveau mot de passe, sans jamais exiger l'ancien
# (c'est justement lui que l'utilisateur a oublié) — la question/réponse en tient lieu de preuve
# d'identité. Revalide tout depuis zéro (username + question configurée + statut du compte),
# jamais confiance dans un état côté frontend laissé par l'étape 1.
class PasswordResetSerializer(serializers.Serializer):
    username = serializers.CharField()
    answer = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=4)

    def validate(self, attrs):
        not_found = serializers.ValidationError(
            "Compte introuvable, ou aucune question de sécurité n'est configurée pour ce compte."
        )
        try:
            user = User.objects.get(username=attrs['username'])
        except User.DoesNotExist:
            raise not_found
        if not user.is_active or not user.has_security_question:
            raise not_found
        if user.account_type == User.AccountType.EMPLOYEE:
            profile = getattr(user, 'employee_profile', None)
            if profile is None or profile.status != profile.Status.ACTIF or not profile.boutique.is_active:
                raise not_found

        if not user.check_security_answer(attrs['answer']):
            raise serializers.ValidationError({'answer': ["Réponse incorrecte."]})

        attrs['user'] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data['user']
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user
