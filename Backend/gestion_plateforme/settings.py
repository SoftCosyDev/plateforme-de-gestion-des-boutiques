"""
Réglages Django du projet gestion_plateforme.

Plateforme multi-boutique : une seule base de données sert toutes les
boutiques (cloisonnées via BoutiqueScopedQuerySet.for_user), voir
Backend/docs/schema.md pour le schéma complet.
"""

# Path : pour construire des chemins de fichiers indépendants du système d'exploitation.
from pathlib import Path
# load_dotenv : charge les variables d'environnement depuis le fichier .env.
from dotenv import load_dotenv
# os : pour lire les variables d'environnement une fois chargées.
import os

# Charge le fichier .env s'il existe (en développement local).
load_dotenv()

# Racine du projet (dossier qui contient manage.py) — calculée depuis ce fichier.
BASE_DIR = Path(__file__).resolve().parent.parent

# Clé secrète Django (signatures de session, jetons CSRF...) — jamais en clair en production,
# vient de la variable d'environnement SECRET_KEY, avec une valeur de secours pour le dev local.
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-ht5m15r!)nkh4h*fb3!+=*-ptofq#$+g+##xvwrnnm)$c7x%v#')

# Mode debug : True affiche les erreurs détaillées (jamais en production) — lu depuis l'environnement.
DEBUG = os.getenv('DEBUG', 'False') == 'True'

# Domaines autorisés à servir cette application — lus depuis l'environnement, séparés par des virgules.
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# Liste des applications installées — l'ordre compte pour certaines (ex: cloudinary_storage).
INSTALLED_APPS = [
    # Gestion CORS (autorise le frontend Next.js à appeler cette API depuis un autre port/domaine).
    'corsheaders',
    # Comptes utilisateurs (User unique, 3 rôles) — voir accounts/models.py.
    'accounts',
    # Boutiques, cloisonnement multi-tenant, fonctionnalités à la carte.
    'boutiques',
    # Catalogue : catégories, produits, variantes.
    'catalog',
    # Stock : niveaux de stock et mouvements.
    'stock',
    # Clients (annuaire partagé ventes/commandes, ardoise).
    'customers',
    # Ventes comptoir.
    'sales',
    # Commandes à livrer (site web ou saisie manuelle).
    'orders',
    # Fournisseurs et commandes fournisseurs.
    'purchases',
    # Profils employés et présence.
    'employees',
    # Paie.
    'payroll',
    # Inventaires physiques.
    'inventory',
    # Rapports/statistiques (pas de modèle, agrégations seulement).
    'reports',
    # Apps Django standard.
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Django REST Framework (API).
    'rest_framework',
    # Authentification par jeton (utilisée par la connexion API).
    'rest_framework.authtoken',
    # Filtrage/recherche/tri générique sur les listes de l'API.
    'django_filters',
    # Génération automatique de la documentation API (Swagger/Redoc).
    'drf_spectacular',
    # Protection anti-bruteforce sur la connexion.
    'axes',
# ] + barre de debug uniquement en développement (jamais en production).
] + (['debug_toolbar'] if DEBUG else [])

# django-axes : verrouille un compte après 5 tentatives de connexion échouées.
AXES_FAILURE_LIMIT = 5
# Durée du verrouillage en heures (5 minutes = 5/60).
AXES_COOLOFF_TIME = 0.0833
# Vue personnalisée appelée en cas de verrouillage — répond en JSON, pas en HTML.
AXES_LOCKOUT_CALLABLE = 'gestion_plateforme.utils.axes_lockout_json'
# Journalise chaque tentative échouée (utile pour le support/l'audit).
AXES_ENABLE_ACCESS_FAILURE_LOG = True
# Réinitialise le compteur d'échecs dès qu'une connexion réussit.
AXES_RESET_ON_SUCCESS = True

# Backends d'authentification utilisés dans l'ordre : axes d'abord (vérifie le verrouillage),
# puis le backend standard Django (vérifie le mot de passe via USERNAME_FIELD = 'username').
AUTHENTICATION_BACKENDS = [
    'axes.backends.AxesStandaloneBackend',
    'django.contrib.auth.backends.ModelBackend',
]

# Modèle utilisateur personnalisé — un seul compte pour les 3 rôles de la plateforme
# (SUPERADMIN / OWNER / EMPLOYEE), voir accounts.models.User.
AUTH_USER_MODEL = 'accounts.User'

# Configuration de Django REST Framework (l'API elle-même).
REST_FRAMEWORK = {
    # Comment un client s'authentifie : jeton (API) ou session (interface d'admin/navigable).
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    # Par défaut, toute route exige d'être connecté (chaque vue peut resserrer davantage).
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    # Filtrage par champ, recherche texte et tri disponibles sur toutes les listes.
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    # Pagination commune à toute l'API — voir pagination.py.
    'DEFAULT_PAGINATION_CLASS': 'gestion_plateforme.pagination.FlexiblePagination',
    # Génère le schéma OpenAPI utilisé par la documentation Swagger/Redoc.
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    # Nombre d'éléments par page par défaut.
    'PAGE_SIZE': 20,
    # Limite le nombre de requêtes pour se protéger des abus.
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    # Quotas : un visiteur non connecté a une limite plus stricte qu'un compte authentifié.
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/day',
        'user': '1000/hour',
        # Un code PIN à 4 chiffres n'a que 10 000 combinaisons — django-axes ne le protège pas
        # (il ne réagit qu'aux échecs de authenticate(), voir UserViewSet.unlock), ce quota freine
        # donc lui-même un essai systématique (10/min -> ~16h pour épuiser 10 000 combinaisons).
        'pin_unlock': '10/min',
        # Flux public "identifiant/mot de passe oublié" (SecurityQuestionLookupView +
        # PasswordResetView) : django-axes ne protège que /token/ (authenticate()), ces deux
        # routes ont donc besoin de leur propre limite pour freiner un essai systématique des
        # réponses à la question de sécurité. Partagé entre les deux vues (même scope) — un
        # attaquant qui alterne les deux appels reste soumis au même quota global par IP.
        'password_recovery': '10/hour',
    },
}

# Informations affichées sur la page de documentation Swagger/Redoc de l'API.
SPECTACULAR_SETTINGS = {
    'TITLE': 'API Plateforme',
    'DESCRIPTION': "API multi-boutique : catalogue, stock, ventes, commandes, achats, RH et inventaire.",
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    # Plusieurs modèles ont chacun un champ `status` avec des choix différents —
    # sans ceci, la documentation génère un seul nom d'enum en collision entre eux.
    'ENUM_NAME_OVERRIDES': {
        'EmployeeStatusEnum': 'employees.models.EmployeeProfile.Status',
        'InventoryCountStatusEnum': 'inventory.models.InventoryCount.Status',
        'PayrollStatusEnum': 'payroll.models.PayrollEntry.Status',
        'SaleStatusEnum': 'sales.models.Sale.Status',
        'OrderStatusEnum': 'orders.models.Order.Status',
        # Sale ET Order ont chacun leur propre `channel`/`payment_mode` avec des valeurs
        # différentes — même collision de nom que pour "status" ci-dessus.
        'SaleChannelEnum': 'sales.models.Sale.Channel',
        'OrderChannelEnum': 'orders.models.Order.Channel',
        'SalePaymentModeEnum': 'sales.models.Sale.PaymentMode',
        'OrderPaymentModeEnum': 'orders.models.Order.PaymentMode',
    },
}

# Ordre des algorithmes de hachage de mot de passe — Argon2 en premier (le plus sûr en 2026),
# les suivants restent disponibles pour vérifier d'anciens mots de passe déjà hachés autrement.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
    'django.contrib.auth.hashers.ScryptPasswordHasher',
]

# Chaîne de traitement appliquée à chaque requête HTTP, dans cet ordre précis.
MIDDLEWARE = [
    # Ajoute les en-têtes CORS — doit passer avant tout le reste.
    'corsheaders.middleware.CorsMiddleware',
    # Vérifie les verrouillages anti-bruteforce.
    'axes.middleware.AxesMiddleware',
    # Protections de sécurité standard Django (HTTPS, en-têtes...).
    'django.middleware.security.SecurityMiddleware',
    # Sert les fichiers statiques directement depuis Django en production.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    # Gère les sessions (utilisées par l'admin Django et SessionAuthentication).
    'django.contrib.sessions.middleware.SessionMiddleware',
    # Traitements communs (redirections, en-têtes basiques).
    'django.middleware.common.CommonMiddleware',
    # Protection CSRF pour les formulaires/sessions.
    'django.middleware.csrf.CsrfViewMiddleware',
    # Attache request.user à partir de la session ou du jeton.
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # Système de messages flash de Django (utilisé par l'admin).
    'django.contrib.messages.middleware.MessageMiddleware',
    # Empêche l'affichage du site dans une iframe étrangère (anti-clickjacking).
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
# Barre de debug uniquement en développement.
] + (['debug_toolbar.middleware.DebugToolbarMiddleware'] if DEBUG else [])

# Fichier qui définit les routes (urls.py) de ce projet.
ROOT_URLCONF = 'gestion_plateforme.urls'

# Configuration des templates HTML (utilisés par l'admin Django, pas par l'API elle-même).
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# Point d'entrée WSGI (utilisé par gunicorn en production).
WSGI_APPLICATION = 'gestion_plateforme.wsgi.application'

# Connexion à la base de données Postgres (Supabase), via le pooler partagé.
# CONN_MAX_AGE à 0 : le pooler gère déjà ses propres connexions persistantes côté Supabase.
DATABASES = {
    'default': {
        # Moteur Postgres (pas SQLite) — la vraie base de production dès le développement.
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME'),
        'USER': os.getenv('DB_USER'),
        'PASSWORD': os.getenv('DB_PASSWORD'),
        'HOST': os.getenv('DB_HOST'),
        'PORT': os.getenv('DB_PORT'),
        'CONN_MAX_AGE': 0,
        'OPTIONS': {
            # Connexion chiffrée obligatoire vers Supabase.
            'sslmode': 'require',
        },
    }
}

# Règles de robustesse imposées aux mots de passe choisis par les utilisateurs.
AUTH_PASSWORD_VALIDATORS = [
    # Interdit un mot de passe trop proche du nom/identifiant du compte.
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    # Impose une longueur minimale.
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    # Interdit les mots de passe trop courants (ex: "password123").
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    # Interdit un mot de passe entièrement numérique.
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Langue de l'interface d'administration Django — français, comme tout le reste du projet.
LANGUAGE_CODE = 'fr'
# Fuseau horaire de référence — Lomé (Togo), UTC toute l'année (pas de changement d'heure).
TIME_ZONE = 'Africa/Lome'
# Active la traduction des textes Django (labels de champs, messages d'erreur...).
USE_I18N = True
# Stocke les dates/heures en UTC en base, converties à l'affichage — bonne pratique multi-fuseaux.
USE_TZ = True

# URL publique sous laquelle les fichiers statiques (CSS admin, etc.) sont servis.
STATIC_URL = '/static/'
# Dossier où `collectstatic` rassemble tous les fichiers statiques avant déploiement.
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Backends de stockage des fichiers — statiques (CSS/JS) et médias (photos de profil...).
STORAGES = {
    "staticfiles": {
        # WhiteNoise sait déjà compresser/mettre en cache, donc pas besoin d'un stockage compressant en plus.
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
    "default": {
        # Disque local par défaut — remplacé par Cloudinary plus bas si les clés sont fournies.
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
}
# Compatibilité : django-cloudinary-storage 0.3.0 lit encore l'ancien réglage STATICFILES_STORAGE.
STATICFILES_STORAGE = STORAGES["staticfiles"]["BACKEND"]

# Type de clé primaire par défaut pour les modèles qui n'en précisent pas — entier auto-incrémenté.
DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'

# Domaines autorisés à appeler cette API depuis un navigateur (le frontend Next.js).
# En développement : localhost. Les domaines de production s'ajoutent via la variable d'environnement.
_cors_extra = os.getenv('CORS_ALLOWED_ORIGINS', '')
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
] + [o.strip() for o in _cors_extra.split(',') if o.strip()]

# Autorise le frontend à envoyer le jeton d'authentification avec chaque requête.
CORS_ALLOW_CREDENTIALS = True

# ── Stockage des fichiers média (photos de profil, images produits) ─────────────
# En production : Cloudinary. En développement (clés absentes) : disque local.
_USE_CLOUDINARY = all([
    os.getenv('CLOUDINARY_CLOUD_NAME'),
    os.getenv('CLOUDINARY_API_KEY'),
    os.getenv('CLOUDINARY_API_SECRET'),
])

if _USE_CLOUDINARY:
    # cloudinary_storage doit être déclaré avant django.contrib.staticfiles.
    _sf_idx = next(
        (i for i, app in enumerate(INSTALLED_APPS) if app == 'django.contrib.staticfiles'),
        len(INSTALLED_APPS)
    )
    INSTALLED_APPS.insert(_sf_idx, 'cloudinary_storage')
    INSTALLED_APPS.append('cloudinary')
    # Remplace le stockage par défaut (disque) par Cloudinary pour tous les FileField/ImageField.
    STORAGES["default"]["BACKEND"] = "cloudinary_storage.storage.MediaCloudinaryStorage"
    CLOUDINARY_STORAGE = {
        'CLOUD_NAME': os.getenv('CLOUDINARY_CLOUD_NAME'),
        'API_KEY': os.getenv('CLOUDINARY_API_KEY'),
        'API_SECRET': os.getenv('CLOUDINARY_API_SECRET'),
    }
    MEDIA_URL = '/media/'
else:
    # Pas de clés Cloudinary : les fichiers uploadés vont sur le disque local du serveur de dev.
    MEDIA_URL = '/media/'
    MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
