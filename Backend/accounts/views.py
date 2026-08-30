# AxesProxyHandler : vérifie si un identifiant est actuellement verrouillé (trop d'échecs).
from axes.handlers.proxy import AxesProxyHandler
# get_lockout_response : construit la réponse HTTP standard de django-axes en cas de verrouillage.
from axes.helpers import get_lockout_response
# update_session_auth_hash : évite qu'un changement de mot de passe déconnecte l'utilisateur
# courant de sa propre session (sinon Django invaliderait la session en cours par sécurité).
from django.contrib.auth import update_session_auth_hash
# viewsets : briques de base de DRF.
from rest_framework import viewsets
# Token : modèle qui stocke les jetons d'authentification (un par utilisateur).
from rest_framework.authtoken.models import Token
# ObtainAuthToken : vue DRF standard pour échanger des identifiants contre un jeton — on la
# personnalise ci-dessous plutôt que de l'utiliser telle quelle.
from rest_framework.authtoken.views import ObtainAuthToken
# action : décorateur pour ajouter une route personnalisée à un ViewSet (ex: /users/me/).
from rest_framework.decorators import action
# AllowAny : aucune authentification requise (nécessaire pour la vue de connexion elle-même).
# IsAuthenticated : exige une session valide.
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import User
from .permissions import IsSuperAdmin
from .serializers import (
    LoginSerializer,
    OwnerCreateSerializer,
    OwnerSerializer,
    PasswordChangeSerializer,
    UserMeUpdateSerializer,
    UserSerializer,
)


# POST {username, password} -> jeton + de quoi rediriger sans second aller-retour
# (account_type, et boutique_id/allowed_pages/access_role pour un EMPLOYEE).
class LoginView(ObtainAuthToken):
    # Tout le monde peut tenter de se connecter (évidemment pas encore authentifié à ce stade).
    permission_classes = [AllowAny]
    # Ne pas essayer d'authentifier la requête ELLE-MÊME (elle contient justement les identifiants
    # à vérifier, pas un jeton déjà valide).
    authentication_classes = []
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        username = request.data.get('username')
        # Vérifie le verrouillage AVANT de tenter la validation (évite de gaspiller un essai
        # inutile côté axes si le compte est déjà bloqué).
        if AxesProxyHandler.is_locked(request, credentials={'username': username}):
            return get_lockout_response(request, credentials={'username': username})

        serializer = self.serializer_class(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        # get_or_create : réutilise le même jeton à chaque connexion (pas de multiplication).
        token, _ = Token.objects.get_or_create(user=user)

        payload = {
            'token': token.key,
            'id': user.id,
            'username': user.username,
            'full_name': user.full_name,
            'account_type': user.account_type,
            # .url lève une erreur si le champ est vide -> on protège avec le test avant.
            'profile_photo': user.profile_photo.url if user.profile_photo else None,
        }
        # Informations supplémentaires nécessaires seulement pour rediriger un EMPLOYEE au bon endroit.
        if user.account_type == User.AccountType.EMPLOYEE:
            profile = user.employee_profile
            payload['boutique_id'] = profile.boutique_id
            payload['allowed_pages'] = profile.allowed_pages
            payload['access_role'] = profile.access_role
        return Response(payload)


# Actions en libre-service sur SON PROPRE compte — jamais sur celui d'un autre (voir
# Frontend/src/components/profile-modal.tsx). La gestion des AUTRES comptes passe par
# EmployeeProfileViewSet (employés) ou BoutiqueViewSet (propriétaires), jamais par ici.
class UserViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all()
    serializer_class = UserSerializer

    # GET renvoie mon profil, PATCH le modifie — les deux sur la même route /users/me/.
    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        if request.method == 'GET':
            return Response(UserSerializer(request.user).data)
        serializer = UserMeUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Renvoie la représentation complète à jour après modification.
        return Response(UserSerializer(request.user).data)

    @action(detail=False, methods=['post'], url_path='change-password')
    def change_password(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Sans ceci, changer son propre mot de passe déconnecterait immédiatement la session en cours.
        update_session_auth_hash(request, request.user)
        return Response({'detail': 'Mot de passe modifié avec succès.'})

    @action(detail=False, methods=['post'], url_path='upload-photo')
    def upload_photo(self, request):
        fichier = request.FILES.get('photo')
        if not fichier:
            return Response({'detail': 'Aucun fichier fourni (champ "photo").'}, status=400)
        # ImageField réel (pas une galerie) : l'assignation directe suffit et route
        # automatiquement vers Cloudinary ou le disque local selon settings.py.
        request.user.profile_photo = fichier
        request.user.save(update_fields=['profile_photo'])
        return Response({'url': request.user.profile_photo.url})

    # Réservé au SuperAdmin : liste tous les comptes OWNER de la plateforme, pour le sélecteur
    # "propriétaire existant" de l'écran de création de boutique (Frontend/src/app/admin/page.tsx).
    @action(detail=False, methods=['get'], url_path='list-owners', permission_classes=[IsSuperAdmin])
    def list_owners(self, request):
        # Filtre explicitement sur OWNER : jamais un EMPLOYEE ni un autre SUPERADMIN dans ce sélecteur.
        owners = User.objects.filter(account_type=User.AccountType.OWNER).order_by('full_name')
        return Response(OwnerSerializer(owners, many=True).data)

    # Réservé au SuperAdmin : crée un NOUVEAU compte OWNER (onboarding d'un commerçant), toujours
    # séparé de la création de sa boutique elle-même (voir BoutiqueViewSet.perform_create).
    @action(detail=False, methods=['post'], url_path='create-owner', permission_classes=[IsSuperAdmin])
    def create_owner(self, request):
        serializer = OwnerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        owner = serializer.save()
        # Renvoie la même forme que list-owners, pour que le frontend l'ajoute directement à sa liste.
        return Response(OwnerSerializer(owner).data, status=201)
