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
    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'profile_photo', 'account_type', 'is_active']
        # Tous les champs en lecture seule ici : la modification passe par UserMeUpdateSerializer.
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
