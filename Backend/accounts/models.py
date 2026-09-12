# models : briques de base pour définir des modèles Django (tables de base de données).
from django.db import models
# AbstractBaseUser : base minimale pour un modèle utilisateur personnalisé (gère le mot de passe).
# BaseUserManager : base pour écrire le gestionnaire (create_user/create_superuser) de ce modèle.
# PermissionsMixin : ajoute is_superuser, groups, user_permissions (système de permissions Django).
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
# make_password/check_password : même mécanisme de hachage que le mot de passe, réutilisé pour
# le code PIN (voir User.pin_hash) — mais dans un champ séparé, indépendant du mot de passe.
from django.contrib.auth.hashers import check_password, make_password


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
    # Code PIN court (4 à 6 chiffres), choisi par l'utilisateur lui-même — sert UNIQUEMENT à
    # redéverrouiller une session déjà ouverte, mise en veille après 30 min d'inactivité (voir
    # LockOverlay côté frontend), jamais à se CONNECTER depuis zéro (voir LoginSerializer, qui ne
    # l'utilise jamais). Haché comme le mot de passe mais dans un champ séparé : changer l'un
    # n'affecte jamais l'autre. Vide tant que non configuré — dans ce cas le déverrouillage
    # retombe sur le mot de passe complet (voir UnlockSerializer), pour ne jamais bloquer personne.
    pin_hash = models.CharField(max_length=128, blank=True)

    # Question de sécurité choisie par l'utilisateur (texte libre, ex: "Nom de mon premier
    # animal ?") — utilisée UNIQUEMENT par le flux "identifiant/mot de passe oublié" public
    # (voir PasswordResetView), jamais ailleurs. Vide tant que non configurée : dans ce cas la
    # récupération autonome n'est pas possible pour ce compte, voir SecurityQuestionLookupView.
    security_question = models.CharField(max_length=255, blank=True)
    # Réponse hachée (jamais en clair) comme le mot de passe/PIN, mais dans un champ séparé.
    security_answer_hash = models.CharField(max_length=128, blank=True)

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

    # Enregistre un nouveau code PIN (toujours haché, jamais stocké en clair) — n'appelle jamais
    # .save() lui-même, à l'appelant de le faire (voir SetPinSerializer.save()).
    def set_pin(self, raw_pin):
        self.pin_hash = make_password(raw_pin)

    # Compare au PIN haché stocké — renvoie toujours False tant qu'aucun PIN n'a été configuré.
    def check_pin(self, raw_pin):
        if not self.pin_hash:
            return False
        return check_password(raw_pin, self.pin_hash)

    @property
    def has_pin(self):
        return bool(self.pin_hash)

    # Normalise la réponse (espaces + casse) avant hachage/comparaison — sans ça, une réponse
    # tapée "Paris" à la configuration puis "paris " à la récupération serait jugée incorrecte
    # pour une différence purement cosmétique, sans rapport avec la sécurité de la réponse.
    @staticmethod
    def _normalize_security_answer(raw_answer):
        return raw_answer.strip().lower()

    # Enregistre la question + la réponse hachée — n'appelle jamais .save() lui-même, à
    # l'appelant de le faire (voir SetSecurityQuestionSerializer.save()).
    def set_security_answer(self, question, raw_answer):
        self.security_question = question
        self.security_answer_hash = make_password(self._normalize_security_answer(raw_answer))

    # Compare à la réponse hachée stockée — renvoie toujours False tant qu'aucune question n'a
    # été configurée.
    def check_security_answer(self, raw_answer):
        if not self.security_answer_hash:
            return False
        return check_password(self._normalize_security_answer(raw_answer), self.security_answer_hash)

    @property
    def has_security_question(self):
        return bool(self.security_question and self.security_answer_hash)
