# models : briques de base pour définir des modèles Django (tables de base de données).
from django.db import models
# AbstractBaseUser : base minimale pour un modèle utilisateur personnalisé (gère le mot de passe).
# BaseUserManager : base pour écrire le gestionnaire (create_user/create_superuser) de ce modèle.
# PermissionsMixin : ajoute is_superuser, groups, user_permissions (système de permissions Django).
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin


# Gestionnaire personnalisé : Django a besoin de create_user()/create_superuser() pour un User custom.
class UserManager(BaseUserManager):
    # Crée un utilisateur normal (employé, propriétaire ou super admin selon account_type).
    def create_user(self, username, password=None, **extra_fields):
        # Un compte sans identifiant n'a pas de sens — on refuse tout de suite.
        if not username:
            raise ValueError("L'identifiant est obligatoire")
        # Instancie le modèle avec les champs fournis (account_type, full_name...).
        user = self.model(username=username, **extra_fields)
        # Hache le mot de passe (jamais stocké en clair).
        user.set_password(password)
        # Sauvegarde sur la base configurée (utile pour le multi-base, ici juste "default").
        user.save(using=self._db)
        return user

    # Crée un compte Super Admin — utilisé par `manage.py createsuperuser` et `ensure_admin`.
    def create_superuser(self, username, password=None, **extra_fields):
        # Un superuser doit être actif, membre du staff (accès admin Django) et superuser Django.
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        # Cohérence : un superuser Django est aussi un SUPERADMIN côté logique métier.
        extra_fields.setdefault('account_type', User.AccountType.SUPERADMIN)
        # Garde-fou : si l'appelant a explicitement mis is_superuser=False, on refuse (incohérent).
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Un superuser doit avoir is_superuser=True')
        return self.create_user(username, password, **extra_fields)


# Modèle utilisateur unique pour toute la plateforme — remplace les 3 tables séparées qu'aurait
# donné un modèle "à la SoftCosy" par boutique ; voir Backend/docs/schema.md pour le raisonnement.
class User(AbstractBaseUser, PermissionsMixin):
    # Les 3 niveaux de compte de la plateforme, voir le schéma pour le détail de chacun.
    class AccountType(models.TextChoices):
        # Exploitant de la plateforme — voit et gère toutes les boutiques.
        SUPERADMIN = 'SUPERADMIN', 'Super administrateur'
        # Propriétaire d'une ou plusieurs boutiques — voit uniquement les siennes.
        OWNER = 'OWNER', 'Propriétaire'
        # Membre du personnel d'une boutique — voit uniquement celle où il travaille.
        EMPLOYEE = 'EMPLOYEE', 'Employé'

    # Clé primaire entière auto-incrémentée (pas d'UUID, cohérent avec SoftCosy).
    id = models.AutoField(primary_key=True)
    # Identifiant de connexion (pas un email) — unique sur toute la plateforme.
    username = models.CharField(max_length=150, unique=True)
    # Le champ "password" (haché) est hérité automatiquement d'AbstractBaseUser.
    # Nom complet affiché dans l'interface.
    full_name = models.CharField(max_length=150)
    # Photo de profil — optionnelle, uploadée par l'utilisateur (pas d'emoji par défaut).
    profile_photo = models.ImageField(upload_to='profiles/', null=True, blank=True)
    # Quel type de compte — détermine le niveau d'accès de base (avant même allowed_pages).
    account_type = models.CharField(max_length=10, choices=AccountType.choices)
    # Compte actif ou désactivé — un compte inactif ne peut pas se connecter.
    is_active = models.BooleanField(default=True)
    # Accès à l'interface d'administration Django (distinct de account_type).
    is_staff = models.BooleanField(default=False)

    # Branche le gestionnaire personnalisé défini plus haut.
    objects = UserManager()

    # Django utilisera "username" comme identifiant de connexion (pas "email", qui n'existe pas ici).
    USERNAME_FIELD = 'username'
    # Aucun champ obligatoire supplémentaire lors de `createsuperuser` au-delà de username/password.
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = 'Utilisateur'
        verbose_name_plural = 'Utilisateurs'

    # Représentation lisible dans l'admin Django et les logs.
    def __str__(self):
        return f'{self.full_name} ({self.username})'
