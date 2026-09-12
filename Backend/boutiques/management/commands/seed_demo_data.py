# random : tirages déterministes (seed fixe) pour que --reset redonne toujours le même jeu de données.
import random
# date/timedelta : pour étaler ventes/achats/présences sur plusieurs mois (tableaux de bord réalistes).
from datetime import date, timedelta
# Decimal : tous les montants/quantités du schéma sont des DecimalField, jamais du float.
from decimal import Decimal

# get_user_model : récupère accounts.User sans import direct (voir accounts/management/commands/ensure_admin.py).
from django.contrib.auth import get_user_model
# BaseCommand : classe de base pour créer une commande `manage.py <nom>`.
from django.core.management.base import BaseCommand
# transaction.atomic : tout le seed réussit ensemble, ou rien n'est écrit.
from django.db import transaction
# timezone : pour dater les mouvements de stock avec une vraie heure (created_at).
from django.utils import timezone

from boutiques.models import Boutique, BoutiqueSettings
from catalog.models import Category, Product, Variant
from customers.models import Customer
from employees.models import ALL_FEATURES, AccessRole, AttendanceRecord, DEFAULT_PAGES_BY_ROLE, EmployeeProfile
from inventory.models import InventoryCount, InventoryLine
from orders.models import Order, OrderLine
from payroll.models import PayrollEntry
# Réutilise EXACTEMENT le calcul serveur réel (voir payroll/services.py) plutôt que de le
# réécrire ici — un seed qui divergerait du vrai calcul donnerait des données trompeuses.
from payroll.services import compute_for_employee, compute_net_pay, status_for
from purchases.models import Purchase, PurchaseLine, Supplier
from sales.models import Sale, SaleLine
from stock.models import Stock, StockMovement

User = get_user_model()

# Mot de passe unique pour TOUS les comptes créés par ce seed (propriétaires ET employés) —
# affiché en fin de commande, jamais à deviner.
DEMO_PASSWORD = 'Boutique2026!'

# Réutilisés pour trouver/nettoyer précisément les boutiques de CE seed (voir --reset) sans
# jamais toucher une boutique réelle créée manuellement (ex: "Chez Idrissou d'agoe").
SEED_MARKER = '[demo]'


# ─────────────────────────────────────────────────────────────────────────────
# Données des 11 boutiques de démonstration — SoftCosy (boutique de référence, TOUTES les
# fonctionnalités activées) + 10 commerces de nature très différente, avec des combinaisons
# volontairement variées de `enabled_features` pour exercer le cloisonnement à deux niveaux
# (Boutique.enabled_features ET EmployeeProfile.allowed_pages) sous tous les angles :
# boutiques sans aucun employé (le propriétaire gère seul), boutiques avec présences/paie,
# boutiques sans stock détaillé (restaurant), avec/sans variantes (mode vs épicerie), etc.
# ─────────────────────────────────────────────────────────────────────────────
BOUTIQUE_PROFILES = [
    {
        'name': 'SoftCosy',
        'neighborhood': 'Adidogomé, Lomé',
        'business_type': 'Mode & Vêtements',
        'theme_primary_color': '#7c3aed',
        'theme_accent_color': '#f472b6',
        'variant_attributes': ['Taille', 'Couleur'],
        'features': list(ALL_FEATURES),
        'owner': {'username': 'owner_akofa', 'full_name': 'Akofa Mensah'},
        'employees': [
            {'username': 'kossi.softcosy', 'full_name': 'Kossi Agbeko', 'role': 'Gérant boutique', 'access_role': AccessRole.GERANT, 'base_salary': 120000},
            {'username': 'delali.softcosy', 'full_name': 'Delali Klutse', 'role': 'Responsable vente', 'access_role': AccessRole.MANAGER, 'base_salary': 85000},
            {'username': 'sitso.softcosy', 'full_name': 'Sitso Amoussou', 'role': 'Vendeuse', 'access_role': AccessRole.STAFF, 'base_salary': 55000, 'restrict': ['customers']},
        ],
        'categories': [
            {'name': 'Robes', 'products': [
                {'name': 'Robe wax imprimée', 'emoji': '👗', 'variants': [
                    {'attrs': {'Taille': 'S', 'Couleur': 'Rouge'}, 'price': 15000, 'cost': 9000, 'stock': 14},
                    {'attrs': {'Taille': 'M', 'Couleur': 'Bleu'}, 'price': 15000, 'cost': 9000, 'stock': 10},
                    {'attrs': {'Taille': 'L', 'Couleur': 'Jaune'}, 'price': 16000, 'cost': 9500, 'stock': 6},
                ]},
                {'name': 'Robe de soirée élégante', 'emoji': '👗', 'variants': [
                    {'attrs': {'Taille': 'M', 'Couleur': 'Noir'}, 'price': 32000, 'cost': 19000, 'stock': 5},
                    {'attrs': {'Taille': 'L', 'Couleur': 'Bordeaux'}, 'price': 34000, 'cost': 20000, 'stock': 3},
                ]},
                {'name': 'Robe casual coton', 'emoji': '👗', 'variants': [
                    {'attrs': {'Taille': 'S', 'Couleur': 'Blanc'}, 'price': 11000, 'cost': 6500, 'stock': 18},
                    {'attrs': {'Taille': 'M', 'Couleur': 'Vert'}, 'price': 11000, 'cost': 6500, 'stock': 12},
                ]},
            ]},
            {'name': 'Chemises', 'products': [
                {'name': 'Chemise homme slim', 'emoji': '👔', 'variants': [
                    {'attrs': {'Taille': 'M', 'Couleur': 'Blanc'}, 'price': 9500, 'cost': 5500, 'stock': 20},
                    {'attrs': {'Taille': 'L', 'Couleur': 'Bleu ciel'}, 'price': 9500, 'cost': 5500, 'stock': 15},
                ]},
                {'name': 'Chemise à motifs africains', 'emoji': '👔', 'variants': [
                    {'attrs': {'Taille': 'M', 'Couleur': 'Multicolore'}, 'price': 13000, 'cost': 7800, 'stock': 9},
                    {'attrs': {'Taille': 'XL', 'Couleur': 'Orange'}, 'price': 13000, 'cost': 7800, 'stock': 7},
                ]},
            ]},
            {'name': 'Chaussures & Accessoires', 'products': [
                {'name': 'Sandales cuir artisanales', 'emoji': '👡', 'variants': [
                    {'attrs': {'Taille': '38', 'Couleur': 'Marron'}, 'price': 12000, 'cost': 7000, 'stock': 11},
                    {'attrs': {'Taille': '40', 'Couleur': 'Noir'}, 'price': 12000, 'cost': 7000, 'stock': 8},
                ]},
                {'name': 'Sac à main tissé', 'emoji': '👜', 'variants': [
                    {'attrs': {'Taille': 'Unique', 'Couleur': 'Beige'}, 'price': 8500, 'cost': 5000, 'stock': 16},
                ]},
                {'name': 'Ceinture cuir', 'emoji': '👞', 'variants': [
                    {'attrs': {'Taille': 'Unique', 'Couleur': 'Marron'}, 'price': 4500, 'cost': 2500, 'stock': 22},
                ]},
            ]},
        ],
    },
    {
        'name': 'Pharmacie Bénédiction',
        'neighborhood': 'Bè, Lomé',
        'business_type': 'Pharmacie',
        'theme_primary_color': '#0f766e',
        'theme_accent_color': '#22d3ee',
        'variant_attributes': [],
        # Fonctionnalités volontairement réduites : pas d'employés déclarés -> la pharmacienne
        # gère seule son officine (teste le cas "propriétaire sans aucun compte employé").
        'features': ['dashboard', 'products', 'stocks', 'cashier', 'sales', 'customers', 'reports', 'settings'],
        'owner': {'username': 'owner_kokou', 'full_name': 'Dr Kokou Amégan'},
        'employees': [],
        'categories': [
            {'name': 'Médicaments', 'products': [
                {'name': 'Paracétamol 500mg (boîte)', 'emoji': '💊', 'variants': [{'attrs': {}, 'price': 500, 'cost': 250, 'stock': 120}]},
                {'name': 'Amoxicilline 500mg (boîte)', 'emoji': '💊', 'variants': [{'attrs': {}, 'price': 1800, 'cost': 1100, 'stock': 45}]},
                {'name': 'Sirop antitussif', 'emoji': '🍯', 'variants': [{'attrs': {}, 'price': 2200, 'cost': 1400, 'stock': 30}]},
            ]},
            {'name': 'Hygiène', 'products': [
                {'name': 'Savon antiseptique', 'emoji': '🧼', 'variants': [{'attrs': {}, 'price': 900, 'cost': 500, 'stock': 60}]},
                {'name': 'Gel hydroalcoolique 250ml', 'emoji': '🧴', 'variants': [{'attrs': {}, 'price': 1500, 'cost': 900, 'stock': 40}]},
            ]},
            {'name': 'Parapharmacie', 'products': [
                {'name': 'Crème hydratante visage', 'emoji': '🧴', 'variants': [{'attrs': {}, 'price': 3500, 'cost': 2000, 'stock': 25}]},
                {'name': 'Vitamine C effervescente', 'emoji': '💊', 'variants': [{'attrs': {}, 'price': 2800, 'cost': 1700, 'stock': 35}]},
            ]},
        ],
    },
    {
        'name': 'Quincaillerie Bâtir Plus',
        'neighborhood': 'Hédzranawoé, Lomé',
        'business_type': 'Quincaillerie & Matériaux',
        'theme_primary_color': '#b45309',
        'theme_accent_color': '#fbbf24',
        'variant_attributes': ['Taille'],
        'features': ['dashboard', 'products', 'stocks', 'cashier', 'sales', 'customers', 'suppliers', 'purchases', 'reports', 'settings', 'employees'],
        'owner': {'username': 'owner_kossi_d', 'full_name': 'Kossi Dogbe'},
        'employees': [
            {'username': 'mawuli.quincaillerie', 'full_name': 'Mawuli Sossou', 'role': 'Vendeur comptoir', 'access_role': AccessRole.MANAGER, 'base_salary': 70000},
        ],
        'categories': [
            {'name': 'Outillage', 'products': [
                {'name': 'Marteau charpentier', 'emoji': '🔨', 'variants': [{'attrs': {'Taille': 'Standard'}, 'price': 3500, 'cost': 2000, 'stock': 25}]},
                {'name': 'Perceuse électrique', 'emoji': '🛠️', 'variants': [{'attrs': {'Taille': '13mm'}, 'price': 28000, 'cost': 18000, 'stock': 8}]},
                {'name': 'Scie égoïne', 'emoji': '🪚', 'variants': [{'attrs': {'Taille': '45cm'}, 'price': 5500, 'cost': 3200, 'stock': 15}]},
            ]},
            {'name': 'Plomberie', 'products': [
                {'name': 'Tuyau PVC (barre)', 'emoji': '🔧', 'variants': [
                    {'attrs': {'Taille': '20mm'}, 'price': 2500, 'cost': 1500, 'stock': 40},
                    {'attrs': {'Taille': '32mm'}, 'price': 3800, 'cost': 2300, 'stock': 22},
                ]},
                {'name': 'Robinet mitigeur', 'emoji': '🚰', 'variants': [{'attrs': {'Taille': 'Standard'}, 'price': 9500, 'cost': 6000, 'stock': 10}]},
            ]},
            {'name': 'Électricité', 'products': [
                {'name': 'Câble électrique (rouleau 100m)', 'emoji': '🔌', 'variants': [{'attrs': {'Taille': '2.5mm²'}, 'price': 32000, 'cost': 24000, 'stock': 6}]},
                {'name': 'Ampoule LED', 'emoji': '💡', 'variants': [{'attrs': {'Taille': '9W'}, 'price': 1200, 'cost': 700, 'stock': 55}]},
            ]},
        ],
    },
    {
        'name': 'Librairie Savoir Plus',
        'neighborhood': 'Tokoin, Lomé',
        'business_type': 'Librairie & Papeterie',
        'theme_primary_color': '#1d4ed8',
        'theme_accent_color': '#fb923c',
        'variant_attributes': [],
        # Toutes les fonctionnalités SAUF présence/paie -> teste une boutique avec employés mais
        # sans suivi RH poussé (petite structure).
        'features': [p for p in ALL_FEATURES if p not in ('attendance', 'payroll')],
        'owner': {'username': 'owner_ama', 'full_name': 'Ama Klutse'},
        'employees': [
            {'username': 'selom.librairie', 'full_name': 'Selom Adjovi', 'role': 'Libraire', 'access_role': AccessRole.STAFF, 'base_salary': 60000},
        ],
        'categories': [
            {'name': 'Fournitures scolaires', 'products': [
                {'name': 'Cahier 100 pages', 'emoji': '📓', 'variants': [{'attrs': {}, 'price': 500, 'cost': 300, 'stock': 200}]},
                {'name': 'Stylo à bille (lot de 10)', 'emoji': '🖊️', 'variants': [{'attrs': {}, 'price': 1000, 'cost': 600, 'stock': 90}]},
                {'name': 'Cartable scolaire', 'emoji': '🎒', 'variants': [{'attrs': {}, 'price': 8500, 'cost': 5500, 'stock': 20}]},
            ]},
            {'name': 'Livres', 'products': [
                {'name': 'Roman africain contemporain', 'emoji': '📖', 'variants': [{'attrs': {}, 'price': 4500, 'cost': 2800, 'stock': 18}]},
                {'name': 'Manuel scolaire CM2', 'emoji': '📚', 'variants': [{'attrs': {}, 'price': 3200, 'cost': 2000, 'stock': 25}]},
            ]},
            {'name': 'Papeterie bureau', 'products': [
                {'name': 'Ramette papier A4', 'emoji': '📄', 'variants': [{'attrs': {}, 'price': 3800, 'cost': 2600, 'stock': 30}]},
                {'name': 'Agrafeuse de bureau', 'emoji': '📎', 'variants': [{'attrs': {}, 'price': 2200, 'cost': 1400, 'stock': 14}]},
            ]},
        ],
    },
    {
        'name': 'Boulangerie Pain Doré',
        'neighborhood': 'Nyékonakpoè, Lomé',
        'business_type': 'Boulangerie & Pâtisserie',
        'theme_primary_color': '#92400e',
        'theme_accent_color': '#facc15',
        'variant_attributes': [],
        # Ni clients, ni commandes, ni fournisseurs : petite boulangerie de quartier, vente
        # comptoir uniquement, mais AVEC suivi des présences (horaires matinaux stricts).
        'features': ['dashboard', 'products', 'stocks', 'cashier', 'sales', 'reports', 'settings', 'employees', 'attendance'],
        'owner': {'username': 'owner_yawa', 'full_name': 'Yawa Sossou'},
        'employees': [
            {'username': 'edoh.boulangerie', 'full_name': 'Edoh Kponou', 'role': 'Boulanger', 'access_role': AccessRole.STAFF, 'base_salary': 65000},
        ],
        'categories': [
            {'name': 'Pains', 'products': [
                {'name': 'Baguette traditionnelle', 'emoji': '🥖', 'variants': [{'attrs': {}, 'price': 250, 'cost': 130, 'stock': 80}]},
                {'name': 'Pain complet', 'emoji': '🍞', 'variants': [{'attrs': {}, 'price': 600, 'cost': 350, 'stock': 40}]},
            ]},
            {'name': 'Pâtisseries', 'products': [
                {'name': 'Croissant beurre', 'emoji': '🥐', 'variants': [{'attrs': {}, 'price': 700, 'cost': 400, 'stock': 35}]},
                {'name': 'Gâteau au chocolat (part)', 'emoji': '🍰', 'variants': [{'attrs': {}, 'price': 1500, 'cost': 850, 'stock': 20}]},
            ]},
            {'name': 'Boissons', 'products': [
                {'name': 'Jus de bissap (bouteille)', 'emoji': '🧃', 'variants': [{'attrs': {}, 'price': 800, 'cost': 450, 'stock': 30}]},
                {'name': 'Eau minérale 50cl', 'emoji': '💧', 'variants': [{'attrs': {}, 'price': 300, 'cost': 180, 'stock': 100}]},
            ]},
        ],
    },
    {
        'name': 'Électro Plus',
        'neighborhood': 'Kodjoviakopé, Lomé',
        'business_type': 'Électronique & Multimédia',
        'theme_primary_color': '#1e293b',
        'theme_accent_color': '#38bdf8',
        'variant_attributes': ['Couleur', 'Stockage'],
        'features': list(ALL_FEATURES),
        'owner': {'username': 'owner_edem', 'full_name': 'Edem Lawson'},
        'employees': [
            {'username': 'nathan.electro', 'full_name': 'Nathan Djobo', 'role': 'Responsable magasin', 'access_role': AccessRole.MANAGER, 'base_salary': 95000},
            {'username': 'grace.electro', 'full_name': 'Grâce Tetteh', 'role': 'Vendeuse', 'access_role': AccessRole.STAFF, 'base_salary': 60000},
        ],
        'categories': [
            {'name': 'Téléphones', 'products': [
                {'name': 'Smartphone Idris A14', 'emoji': '📱', 'variants': [
                    {'attrs': {'Couleur': 'Noir', 'Stockage': '64Go'}, 'price': 65000, 'cost': 48000, 'stock': 10},
                    {'attrs': {'Couleur': 'Bleu', 'Stockage': '128Go'}, 'price': 78000, 'cost': 58000, 'stock': 7},
                ]},
                {'name': 'Smartphone Idris B7 Pro', 'emoji': '📱', 'variants': [
                    {'attrs': {'Couleur': 'Argent', 'Stockage': '256Go'}, 'price': 145000, 'cost': 110000, 'stock': 4},
                ]},
            ]},
            {'name': 'Accessoires', 'products': [
                {'name': 'Chargeur rapide 20W', 'emoji': '🔌', 'variants': [{'attrs': {'Couleur': 'Blanc', 'Stockage': 'N/A'}, 'price': 6500, 'cost': 4000, 'stock': 40}]},
                {'name': 'Écouteurs Bluetooth', 'emoji': '🎧', 'variants': [
                    {'attrs': {'Couleur': 'Noir', 'Stockage': 'N/A'}, 'price': 12000, 'cost': 7500, 'stock': 20},
                    {'attrs': {'Couleur': 'Blanc', 'Stockage': 'N/A'}, 'price': 12000, 'cost': 7500, 'stock': 18},
                ]},
            ]},
            {'name': 'Électroménager', 'products': [
                {'name': 'Ventilateur sur pied', 'emoji': '🌀', 'variants': [{'attrs': {'Couleur': 'Gris', 'Stockage': 'N/A'}, 'price': 22000, 'cost': 15000, 'stock': 9}]},
                {'name': 'Fer à repasser', 'emoji': '🔥', 'variants': [{'attrs': {'Couleur': 'Rouge', 'Stockage': 'N/A'}, 'price': 15000, 'cost': 10000, 'stock': 12}]},
            ]},
        ],
    },
    {
        'name': 'Cosmétiques Belle Peau',
        'neighborhood': 'Akodessewa, Lomé',
        'business_type': 'Beauté & Cosmétiques',
        'theme_primary_color': '#be185d',
        'theme_accent_color': '#fda4af',
        'variant_attributes': ['Couleur', 'Contenance'],
        # Pas d'employés, de fournisseurs ni de paie : la gérante travaille seule et achète
        # elle-même son stock en direct (teste une boutique "commandes en ligne" sans staff).
        'features': ['dashboard', 'products', 'stocks', 'cashier', 'sales', 'customers', 'orders', 'reports', 'settings'],
        'owner': {'username': 'owner_enyonam', 'full_name': 'Enyonam Adjovi'},
        'employees': [],
        'categories': [
            {'name': 'Soins visage', 'products': [
                {'name': 'Crème éclaircissante douce', 'emoji': '🧴', 'variants': [
                    {'attrs': {'Couleur': 'N/A', 'Contenance': '50ml'}, 'price': 4500, 'cost': 2700, 'stock': 22},
                    {'attrs': {'Couleur': 'N/A', 'Contenance': '100ml'}, 'price': 7500, 'cost': 4600, 'stock': 14},
                ]},
            ]},
            {'name': 'Maquillage', 'products': [
                {'name': 'Rouge à lèvres mat', 'emoji': '💄', 'variants': [
                    {'attrs': {'Couleur': 'Rouge', 'Contenance': '3g'}, 'price': 3200, 'cost': 1900, 'stock': 25},
                    {'attrs': {'Couleur': 'Rose', 'Contenance': '3g'}, 'price': 3200, 'cost': 1900, 'stock': 19},
                ]},
            ]},
            {'name': 'Parfumerie', 'products': [
                {'name': 'Parfum femme signature', 'emoji': '💐', 'variants': [{'attrs': {'Couleur': 'N/A', 'Contenance': '75ml'}, 'price': 18000, 'cost': 11000, 'stock': 8}]},
                {'name': 'Parfum homme intense', 'emoji': '🧴', 'variants': [{'attrs': {'Couleur': 'N/A', 'Contenance': '100ml'}, 'price': 21000, 'cost': 13000, 'stock': 6}]},
            ]},
        ],
    },
    {
        'name': 'Restaurant Chez Fifi',
        'neighborhood': 'Doulassamé, Lomé',
        'business_type': 'Restauration',
        'theme_primary_color': '#b91c1c',
        'theme_accent_color': '#fbbf24',
        'variant_attributes': [],
        # Pas de suivi de stock détaillé côté UI (restaurant : cuisine au jour le jour), pas de
        # commandes/fournisseurs — juste caisse + un seul serveur.
        'features': ['dashboard', 'products', 'cashier', 'sales', 'customers', 'reports', 'settings', 'employees'],
        'owner': {'username': 'owner_fifi', 'full_name': 'Fifi Amoussou'},
        'employees': [
            {'username': 'kodjo.restaurant', 'full_name': 'Kodjo Dossou', 'role': 'Serveur', 'access_role': AccessRole.STAFF, 'base_salary': 50000},
        ],
        'categories': [
            {'name': 'Plats', 'products': [
                {'name': 'Riz sauce arachide + poulet', 'emoji': '🍛', 'variants': [{'attrs': {}, 'price': 2000, 'cost': 1100, 'stock': 50}]},
                {'name': 'Fufu + sauce gombo', 'emoji': '🍲', 'variants': [{'attrs': {}, 'price': 1800, 'cost': 1000, 'stock': 40}]},
                {'name': 'Pâte + sauce tomate', 'emoji': '🍝', 'variants': [{'attrs': {}, 'price': 1500, 'cost': 850, 'stock': 45}]},
            ]},
            {'name': 'Boissons', 'products': [
                {'name': 'Coca-Cola 33cl', 'emoji': '🥤', 'variants': [{'attrs': {}, 'price': 500, 'cost': 300, 'stock': 60}]},
                {'name': 'Bissap glacé maison', 'emoji': '🧊', 'variants': [{'attrs': {}, 'price': 600, 'cost': 300, 'stock': 30}]},
            ]},
        ],
    },
    {
        'name': 'Supermarché Le Grenier',
        'neighborhood': 'Baguida, Lomé',
        'business_type': 'Supermarché',
        'theme_primary_color': '#15803d',
        'theme_accent_color': '#facc15',
        'variant_attributes': [],
        'features': list(ALL_FEATURES),
        'owner': {'username': 'owner_komla', 'full_name': 'Komla Tetteh'},
        'employees': [
            {'username': 'akouvi.grenier', 'full_name': 'Akouvi Amégan', 'role': 'Gérante rayon', 'access_role': AccessRole.GERANT, 'base_salary': 110000},
            {'username': 'elom.grenier', 'full_name': 'Elom Sossou', 'role': 'Caissier', 'access_role': AccessRole.STAFF, 'base_salary': 58000},
        ],
        'categories': [
            {'name': 'Épicerie', 'products': [
                {'name': 'Riz parfumé (sac 25kg)', 'emoji': '🍚', 'variants': [{'attrs': {}, 'price': 17500, 'cost': 14000, 'stock': 18}]},
                {'name': 'Huile végétale 5L', 'emoji': '🛢️', 'variants': [{'attrs': {}, 'price': 6500, 'cost': 5200, 'stock': 30}]},
                {'name': 'Sucre en poudre 1kg', 'emoji': '🍬', 'variants': [{'attrs': {}, 'price': 900, 'cost': 650, 'stock': 60}]},
                {'name': 'Farine de blé 1kg', 'emoji': '🌾', 'variants': [{'attrs': {}, 'price': 750, 'cost': 550, 'stock': 45}]},
            ]},
            {'name': 'Boissons', 'products': [
                {'name': 'Eau minérale (pack 12)', 'emoji': '💧', 'variants': [{'attrs': {}, 'price': 2400, 'cost': 1800, 'stock': 40}]},
                {'name': 'Bière locale (casier)', 'emoji': '🍺', 'variants': [{'attrs': {}, 'price': 7200, 'cost': 5800, 'stock': 15}]},
                {'name': 'Jus de fruit 1L', 'emoji': '🧃', 'variants': [{'attrs': {}, 'price': 1500, 'cost': 1050, 'stock': 25}]},
            ]},
            {'name': 'Hygiène', 'products': [
                {'name': 'Savon de toilette', 'emoji': '🧼', 'variants': [{'attrs': {}, 'price': 400, 'cost': 250, 'stock': 80}]},
                {'name': 'Papier toilette (lot 4)', 'emoji': '🧻', 'variants': [{'attrs': {}, 'price': 1200, 'cost': 850, 'stock': 50}]},
            ]},
            {'name': 'Produits laitiers', 'products': [
                {'name': 'Lait en poudre (boîte)', 'emoji': '🥛', 'variants': [{'attrs': {}, 'price': 3200, 'cost': 2500, 'stock': 28}]},
                {'name': 'Yaourt nature (pack 4)', 'emoji': '🍦', 'variants': [{'attrs': {}, 'price': 1400, 'cost': 950, 'stock': 22}]},
            ]},
        ],
    },
    {
        'name': 'Boutique Bébé & Maman',
        'neighborhood': 'Adakpamé, Lomé',
        'business_type': 'Puériculture',
        'theme_primary_color': '#0369a1',
        'theme_accent_color': '#fda4af',
        'variant_attributes': ['Taille'],
        'features': ['dashboard', 'products', 'stocks', 'cashier', 'sales', 'customers', 'orders', 'reports', 'settings', 'employees'],
        # Même propriétaire que SoftCosy -> teste le sélecteur multi-boutiques d'un même OWNER.
        'owner': {'username': 'owner_akofa', 'full_name': 'Akofa Mensah'},
        'employees': [
            {'username': 'abra.bebemaman', 'full_name': 'Abra Lawson', 'role': 'Conseillère vente', 'access_role': AccessRole.STAFF, 'base_salary': 55000},
        ],
        'categories': [
            {'name': 'Vêtements bébé', 'products': [
                {'name': 'Body bébé coton', 'emoji': '👶', 'variants': [
                    {'attrs': {'Taille': '0-3 mois'}, 'price': 3500, 'cost': 2000, 'stock': 20},
                    {'attrs': {'Taille': '3-6 mois'}, 'price': 3500, 'cost': 2000, 'stock': 18},
                ]},
                {'name': 'Pyjama bébé molleton', 'emoji': '🧸', 'variants': [{'attrs': {'Taille': '6-12 mois'}, 'price': 5500, 'cost': 3200, 'stock': 12}]},
            ]},
            {'name': 'Puériculture', 'products': [
                {'name': 'Couches taille 2 (paquet)', 'emoji': '🍼', 'variants': [{'attrs': {'Taille': 'T2'}, 'price': 6500, 'cost': 4800, 'stock': 25}]},
                {'name': 'Biberon anti-colique', 'emoji': '🍼', 'variants': [{'attrs': {'Taille': '260ml'}, 'price': 4200, 'cost': 2600, 'stock': 16}]},
            ]},
            {'name': 'Poussettes & Sièges', 'products': [
                {'name': 'Poussette pliable urbaine', 'emoji': '🛒', 'variants': [{'attrs': {'Taille': 'Standard'}, 'price': 65000, 'cost': 45000, 'stock': 4}]},
            ]},
        ],
    },
    {
        'name': 'Garage Auto Rapide',
        'neighborhood': 'Amoutivé, Lomé',
        'business_type': 'Pièces auto & Mécanique',
        'theme_primary_color': '#334155',
        'theme_accent_color': '#f97316',
        'variant_attributes': ['Référence'],
        'features': ['dashboard', 'products', 'stocks', 'cashier', 'sales', 'customers', 'suppliers', 'purchases', 'reports', 'settings', 'employees', 'inventory'],
        'owner': {'username': 'owner_sena', 'full_name': 'Sena Djobo'},
        'employees': [
            {'username': 'yao.garage', 'full_name': 'Yao Kpodo', 'role': 'Chef mécanicien', 'access_role': AccessRole.MANAGER, 'base_salary': 90000},
        ],
        'categories': [
            {'name': 'Pièces moteur', 'products': [
                {'name': 'Filtre à huile', 'emoji': '🔩', 'variants': [{'attrs': {'Référence': 'FH-A12'}, 'price': 4500, 'cost': 2800, 'stock': 30}]},
                {'name': "Bougie d'allumage", 'emoji': '🔧', 'variants': [{'attrs': {'Référence': 'BA-07'}, 'price': 2200, 'cost': 1300, 'stock': 45}]},
            ]},
            {'name': 'Pneumatiques', 'products': [
                {'name': 'Pneu 175/65R14', 'emoji': '🛞', 'variants': [{'attrs': {'Référence': '175-65-14'}, 'price': 38000, 'cost': 28000, 'stock': 8}]},
                {'name': 'Pneu 185/60R15', 'emoji': '🛞', 'variants': [{'attrs': {'Référence': '185-60-15'}, 'price': 42000, 'cost': 31000, 'stock': 6}]},
            ]},
            {'name': 'Accessoires', 'products': [
                {'name': 'Batterie 12V 60Ah', 'emoji': '🔋', 'variants': [{'attrs': {'Référence': 'BAT-60'}, 'price': 55000, 'cost': 41000, 'stock': 5}]},
                {'name': 'Huile moteur 5L', 'emoji': '🛢️', 'variants': [{'attrs': {'Référence': '5W30'}, 'price': 18000, 'cost': 13000, 'stock': 14}]},
            ]},
        ],
    },
]

# Pool de noms pour les clients générés génériquement (pas besoin d'un nom par boutique — la
# variété importe plus que la précision ici, contrairement au catalogue).
CUSTOMER_FIRST_NAMES = ['Adjo', 'Kofi', 'Ama', 'Yao', 'Afi', 'Kwame', 'Esi', 'Kwesi', 'Abla', 'Kojo', 'Akosua', 'Sena']
CUSTOMER_LAST_NAMES = ['Mensah', 'Agbeko', 'Dogbe', 'Klutse', 'Sossou', 'Amoussou', 'Tetteh', 'Adjovi', 'Kpodo', 'Lawson']

SUPPLIER_NAMES = [
    'Comptoir Togolais de Distribution', 'Import Export Togo SARL', 'Grossiste Lomé Plus',
    'Africa Trading Company', 'Sourcing Ouest-Africain',
]


# Génère un numéro de téléphone togolais plausible et déterministe (seed fixée -> reproductible
# à l'identique à chaque exécution avec --reset).
def _phone(n):
    prefix = ['90', '91', '92', '93', '96', '97', '98', '99'][n % 8]
    return f"+228 {prefix} {10 + (n * 7) % 90:02d} {10 + (n * 13) % 90:02d} {10 + (n * 19) % 90:02d}"


class Command(BaseCommand):
    help = (
        "Peuple la base avec des données de démonstration réalistes : SoftCosy (boutique de "
        "référence, toutes fonctionnalités) + 10 commerces de nature différente, chacun avec "
        "son propriétaire, ses employés, son catalogue, ses clients, ses ventes, achats, "
        "commandes, inventaires, présences et paies — de quoi tester toutes les pages de "
        "l'application sans rien créer à la main."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset', action='store_true',
            help=(
                "Supprime d'abord les boutiques de démonstration déjà présentes (identifiées "
                "par leur nom, voir BOUTIQUE_PROFILES) avant de les recréer. N'affecte JAMAIS "
                "une boutique dont le nom ne figure pas dans cette liste."
            ),
        )

    def handle(self, *args, **options):
        # Seed fixe : deux exécutions avec --reset produisent EXACTEMENT le même jeu de
        # données (montants, dates, quantités) — pratique pour comparer un bug avant/après.
        random.seed(42)

        if options['reset']:
            self._reset()

        created_boutiques = []
        with transaction.atomic():
            for profile in BOUTIQUE_PROFILES:
                created_boutiques.append(self._seed_boutique(profile))

        self._print_summary(created_boutiques)

    # ── Suppression ciblée (--reset) ────────────────────────────────────────
    def _reset(self):
        names = [p['name'] for p in BOUTIQUE_PROFILES]
        boutiques = list(Boutique.objects.filter(name__in=names))
        if not boutiques:
            return
        self.stdout.write(f'Suppression de {len(boutiques)} boutique(s) de démonstration existante(s)...')
        owner_ids = {b.owner_id for b in boutiques}
        with transaction.atomic():
            for boutique in boutiques:
                self._wipe_boutique(boutique)
            # Ne supprime un propriétaire QUE s'il n'a plus aucune boutique restante (cas d'un
            # propriétaire partagé entre deux boutiques de démonstration, ex: Akofa Mensah).
            for owner_id in owner_ids:
                if owner_id and not Boutique.objects.filter(owner_id=owner_id).exists():
                    User.objects.filter(id=owner_id).delete()

    # Supprime une boutique et TOUT ce qui en dépend, dans l'ordre imposé par les PROTECT du
    # schéma (voir Backend/docs/schema.md) — un simple `boutique.delete()` échouerait sinon.
    def _wipe_boutique(self, boutique):
        PayrollEntry.objects.filter(boutique=boutique).delete()
        AttendanceRecord.objects.filter(boutique=boutique).delete()
        InventoryCount.objects.filter(boutique=boutique).delete()  # cascade -> InventoryLine
        StockMovement.objects.filter(boutique=boutique).delete()
        Sale.objects.filter(boutique=boutique).delete()  # cascade -> SaleLine
        Order.objects.filter(boutique=boutique).delete()  # cascade -> OrderLine
        Purchase.objects.filter(boutique=boutique).delete()  # cascade -> PurchaseLine
        Supplier.objects.filter(boutique=boutique).delete()
        Customer.objects.filter(boutique=boutique).delete()
        # Les comptes employés eux-mêmes (le CASCADE User -> EmployeeProfile fait le reste).
        employee_user_ids = list(EmployeeProfile.objects.filter(boutique=boutique).values_list('user_id', flat=True))
        User.objects.filter(id__in=employee_user_ids).delete()
        Product.objects.filter(boutique=boutique).delete()  # cascade -> Variant -> Stock
        Category.objects.filter(boutique=boutique).delete()
        boutique.delete()  # cascade -> BoutiqueSettings

    # ── Construction d'une boutique complète ────────────────────────────────
    def _seed_boutique(self, profile):
        if Boutique.objects.filter(name=profile['name']).exists():
            self.stdout.write(self.style.WARNING(
                f"« {profile['name']} » existe déjà — ignorée (relancer avec --reset pour la recréer)."
            ))
            return None

        owner = self._get_or_create_owner(profile['owner'])

        boutique = Boutique.objects.create(
            owner=owner,
            name=profile['name'],
            neighborhood=profile['neighborhood'],
            business_type=profile['business_type'],
            theme_primary_color=profile['theme_primary_color'],
            theme_accent_color=profile['theme_accent_color'],
            enabled_features=profile['features'],
            variant_attributes=profile['variant_attributes'],
        )
        BoutiqueSettings.objects.create(boutique=boutique)

        variants_by_product = self._create_catalog(boutique, profile)
        all_variants = [v for variants in variants_by_product.values() for v in variants]

        employees = self._create_employees(boutique, profile)
        customers = self._create_customers(boutique) if 'customers' in boutique.enabled_features else []
        suppliers = self._create_suppliers(boutique) if 'suppliers' in boutique.enabled_features else []

        if 'purchases' in boutique.enabled_features and suppliers:
            self._create_purchases(boutique, suppliers, variants_by_product, owner)

        if 'sales' in boutique.enabled_features or 'cashier' in boutique.enabled_features:
            self._create_sales(boutique, all_variants, customers, employees)

        if 'orders' in boutique.enabled_features:
            self._create_orders(boutique, all_variants, customers, owner)

        if 'inventory' in boutique.enabled_features:
            self._create_inventory(boutique, all_variants, owner)

        if employees:
            if 'attendance' in boutique.enabled_features:
                self._create_attendance(boutique, employees)
            if 'payroll' in boutique.enabled_features:
                self._create_payroll(boutique, employees)

        self.stdout.write(self.style.SUCCESS(f"[OK] {boutique.name} ({len(all_variants)} variantes, {len(employees)} employe(s))"))
        return {'boutique': boutique, 'owner': owner, 'employees': employees}

    def _get_or_create_owner(self, spec):
        existing = User.objects.filter(username=spec['username']).first()
        if existing:
            return existing
        return User.objects.create_user(
            username=spec['username'], password=DEMO_PASSWORD,
            full_name=spec['full_name'], account_type=User.AccountType.OWNER,
        )

    # ── Catalogue (catégories, produits, variantes, stock initial) ─────────
    def _create_catalog(self, boutique, profile):
        variants_by_product = {}
        for cat_data in profile['categories']:
            category = Category.objects.create(boutique=boutique, name=cat_data['name'])
            for product_data in cat_data['products']:
                product = Product.objects.create(
                    boutique=boutique, category=category, name=product_data['name'],
                    emoji=product_data.get('emoji', '📦'),
                )
                created_variants = []
                for variant_data in product_data['variants']:
                    variant = Variant.objects.create(
                        product=product,
                        selling_price=Decimal(str(variant_data['price'])),
                        cost_price=Decimal(str(variant_data['cost'])),
                        attributes=variant_data['attrs'],
                    )
                    stock = Stock.objects.create(variant=variant)
                    # Stock de départ posé via un VRAI mouvement (jamais Stock.on_hand_qty en
                    # direct, voir StockMovement — un signal recalcule Stock à chaque mouvement).
                    StockMovement.objects.create(
                        boutique=boutique, stock=stock, movement_type=StockMovement.MovementType.ENTREE,
                        quantite=Decimal(str(variant_data['stock'])), reason=StockMovement.Reason.STOCK_INITIAL,
                    )
                    created_variants.append(variant)
                variants_by_product[product.id] = created_variants
        return variants_by_product

    # ── Employés ─────────────────────────────────────────────────────────────
    def _create_employees(self, boutique, profile):
        employees = []
        for emp_data in profile.get('employees', []):
            user = User.objects.create_user(
                username=emp_data['username'], password=DEMO_PASSWORD,
                full_name=emp_data['full_name'], account_type=User.AccountType.EMPLOYEE,
            )
            # Toujours un sous-ensemble de ce que LA BOUTIQUE a elle-même activé (voir
            # EmployeeProfile.allowed_pages) — jamais plus, même si le gabarit du rôle le permettrait.
            allowed = [p for p in DEFAULT_PAGES_BY_ROLE[emp_data['access_role']] if p in boutique.enabled_features]
            # Une restriction manuelle explicite pour au moins un employé (ex: Sitso chez
            # SoftCosy privée de "customers") -> teste le réglage fin page par page.
            for restricted_page in emp_data.get('restrict', []):
                if restricted_page in allowed:
                    allowed.remove(restricted_page)
            profile_obj = EmployeeProfile.objects.create(
                user=user, boutique=boutique, role=emp_data['role'], access_role=emp_data['access_role'],
                base_salary=Decimal(str(emp_data['base_salary'])), allowed_pages=allowed,
                hire_date=date.today() - timedelta(days=random.randint(60, 500)),
            )
            employees.append(profile_obj)
        return employees

    # ── Clients ──────────────────────────────────────────────────────────────
    def _create_customers(self, boutique):
        customers = []
        for i in range(4):
            name = f'{random.choice(CUSTOMER_FIRST_NAMES)} {random.choice(CUSTOMER_LAST_NAMES)}'
            # La moitié a une ardoise (balance_due) en cours -> teste l'écran clients ET les
            # ventes à crédit du même coup.
            balance_due = Decimal(str(random.choice([0, 0, 2500, 6000])))
            customers.append(Customer.objects.create(
                boutique=boutique, name=name, phone=_phone(boutique.id * 100 + i), balance_due=balance_due,
            ))
        return customers

    # ── Fournisseurs ─────────────────────────────────────────────────────────
    def _create_suppliers(self, boutique):
        chosen = random.sample(SUPPLIER_NAMES, 2)
        return [
            Supplier.objects.create(boutique=boutique, name=name, phone=_phone(boutique.id * 200 + i))
            for i, name in enumerate(chosen)
        ]

    # ── Achats fournisseurs (un reçu + un en attente) ───────────────────────
    def _create_purchases(self, boutique, suppliers, variants_by_product, owner):
        variants = [v for vs in variants_by_product.values() for v in vs]
        if not variants:
            return

        # Achat n°1 : déjà reçu il y a 3 semaines -> entrée de stock déjà comptabilisée.
        received_dt = timezone.now() - timedelta(days=21)
        purchase = Purchase.objects.create(boutique=boutique, supplier=suppliers[0], purchased_at=received_dt.date(), status='RECU')
        sub_total = Decimal('0')
        for variant in random.sample(variants, min(3, len(variants))):
            qty = Decimal(str(random.randint(10, 30)))
            line = PurchaseLine.objects.create(
                purchase=purchase, product=variant.product, variant=variant,
                quantity=qty, unit_cost=variant.cost_price, line_cost=qty * variant.cost_price,
            )
            sub_total += line.line_cost
            movement = StockMovement.objects.create(
                boutique=boutique, stock=variant.stock, purchase_line=line, user=owner,
                movement_type=StockMovement.MovementType.ENTREE, quantite=qty,
                reason=StockMovement.Reason.ACHAT_FOURNISSEUR,
            )
            self._backdate(movement, received_dt)
        Purchase.objects.filter(pk=purchase.pk).update(sub_total=sub_total, purchase_cost=sub_total, total=sub_total)

        # Achat n°2 : commande passée mais pas encore livrée -> ne touche pas le stock.
        pending = Purchase.objects.create(boutique=boutique, supplier=suppliers[-1], purchased_at=date.today(), status='')
        variant = random.choice(variants)
        qty = Decimal(str(random.randint(5, 15)))
        PurchaseLine.objects.create(purchase=pending, product=variant.product, variant=variant, quantity=qty, unit_cost=variant.cost_price, line_cost=qty * variant.cost_price)
        Purchase.objects.filter(pk=pending.pk).update(sub_total=qty * variant.cost_price, purchase_cost=qty * variant.cost_price, total=qty * variant.cost_price)

    # ── Ventes (étalées sur 45 jours, dont au moins deux aujourd'hui) ───────
    def _create_sales(self, boutique, variants, customers, employees):
        if not variants:
            return
        channels = [Sale.Channel.STORE, Sale.Channel.STORE, Sale.Channel.ONLINE]
        # Le crédit (ardoise) n'a de sens QUE si la boutique suit ses clients — sans ça, la
        # vente n'aurait personne à qui rattacher la dette.
        payment_modes = [Sale.PaymentMode.CASH, Sale.PaymentMode.CASH, Sale.PaymentMode.MOBILE_MONEY]
        if customers:
            payment_modes.append(Sale.PaymentMode.CREDIT)
        # Décalages en jours dans le passé -> les deux derniers (0) tombent AUJOURD'HUI, pour
        # que la carte "Vente du jour" du tableau de bord ne soit jamais vide après le seed.
        day_offsets = [40, 32, 25, 18, 12, 7, 3, 1, 0, 0]

        # Stock restant suivi EN MÉMOIRE pendant la génération (jamais `variant.stock.on_hand_qty`,
        # périmé dès qu'un achat a déjà bougé le stock via signal — voir _current_stock_map) —
        # sans ce suivi, des ventes aléatoires successives peuvent vider un stock sous zéro.
        remaining = self._current_stock_map(variants)

        for offset in day_offsets:
            sellable = [v for v in variants if remaining[v.id] > 0]
            if not sellable:
                break
            sold_at = timezone.now() - timedelta(days=offset, hours=random.randint(0, 10))
            payment_mode = random.choice(payment_modes)
            customer = random.choice(customers) if (customers and payment_mode == Sale.PaymentMode.CREDIT) else None
            employee = random.choice(employees) if employees else None
            sale = Sale.objects.create(
                boutique=boutique, sold_at=sold_at, channel=random.choice(channels), payment_mode=payment_mode,
                customer=customer, employee=employee,
                status=Sale.Status.PAYE if payment_mode != Sale.PaymentMode.CREDIT else Sale.Status.PARTIEL,
            )
            subtotal = Decimal('0')
            for variant in random.sample(sellable, min(random.randint(1, 3), len(sellable))):
                available = remaining[variant.id]
                if available <= 0:
                    continue
                qty = Decimal(str(min(random.randint(1, 3), int(available))))
                remaining[variant.id] -= qty
                line_total = qty * variant.selling_price
                line = SaleLine.objects.create(
                    sale=sale, product=variant.product, variant=variant,
                    quantity=qty, unit_price=variant.selling_price, line_total=line_total,
                )
                subtotal += line_total
                movement = StockMovement.objects.create(
                    boutique=boutique, stock=variant.stock, sale_line=line,
                    movement_type=StockMovement.MovementType.SORTIE, quantite=-qty,
                    reason=StockMovement.Reason.VENTE,
                )
                self._backdate(movement, sold_at)
            Sale.objects.filter(pk=sale.pk).update(subtotal=subtotal, total=subtotal)

    # ── Commandes à livrer (une de chaque statut clé) ───────────────────────
    def _create_orders(self, boutique, variants, customers, owner):
        if not variants:
            return
        scenarios = [
            (Order.Status.EN_ATTENTE, Order.Channel.SITE_WEB, None),
            (Order.Status.LIVRE, Order.Channel.APPLICATION, owner),
            (Order.Status.ANNULE, Order.Channel.SITE_WEB, None),
        ]
        # Stock réel au moment de la génération — seule la commande LIVRÉE en a besoin (elle
        # décrémente réellement le stock), mais un seul calcul suffit pour les trois scénarios.
        stock_map = self._current_stock_map(variants)
        for i, (status, channel, user) in enumerate(scenarios):
            customer = customers[i % len(customers)] if customers else None
            order = Order.objects.create(
                boutique=boutique, customer=customer,
                customer_name=customer.name if customer else 'Cliente sans compte',
                customer_phone=customer.phone if customer else _phone(boutique.id * 300 + i),
                channel=channel, status=status, user=user,
            )
            # Pour la commande livrée, ne choisit QUE parmi les variantes encore en stock —
            # sans ça, cette sortie pourrait faire passer le stock sous zéro (voir _create_sales).
            candidates = [v for v in variants if status != Order.Status.LIVRE or stock_map.get(v.id, 0) > 0] or variants
            variant = random.choice(candidates)
            qty = Decimal(str(min(random.randint(1, 2), int(stock_map.get(variant.id, 1)) or 1)))
            line_total = qty * variant.selling_price
            line = OrderLine.objects.create(
                order=order, product=variant.product, variant=variant, quantity=qty,
                unit_price=variant.selling_price, line_total=line_total,
                variant_label=', '.join(f'{k}: {v}' for k, v in variant.attributes.items()),
            )
            Order.objects.filter(pk=order.pk).update(subtotal=line_total, total=line_total)
            # Une commande livrée sort réellement du stock (voir COMMANDE_LIVREE) — une
            # commande annulée ou en attente ne touche jamais le stock.
            if status == Order.Status.LIVRE:
                StockMovement.objects.create(
                    boutique=boutique, stock=variant.stock, movement_type=StockMovement.MovementType.SORTIE,
                    quantite=-qty, reason=StockMovement.Reason.COMMANDE_LIVREE,
                )

    # ── Inventaire physique (terminé, avec un écart volontaire) ─────────────
    def _create_inventory(self, boutique, variants, owner):
        if len(variants) < 2:
            return
        counted_variants = random.sample(variants, min(4, len(variants)))
        # Stock RÉEL au moment du comptage — jamais `variant.stock.on_hand_qty` en mémoire, voir
        # le même souci dans _create_sales (périmé dès qu'une vente/un achat a déjà eu lieu).
        stock_map = self._current_stock_map(counted_variants)
        count = InventoryCount.objects.create(boutique=boutique, status=InventoryCount.Status.TERMINE, user=owner)
        total_counted = Decimal('0')
        total_ecart = Decimal('0')
        for i, variant in enumerate(counted_variants):
            expected = stock_map[variant.id]
            # La première ligne a volontairement un écart (perte constatée) -> teste bien le
            # calcul de discrepancy et la correction de stock qui en découle. max(..., 0) : un
            # comptage physique ne peut jamais être négatif, même si expected était déjà bas.
            counted = max(expected - Decimal('2'), Decimal('0')) if i == 0 else expected
            discrepancy = counted - expected
            InventoryLine.objects.create(
                inventory_count=count, product=variant.product, variant=variant,
                expected_qty=expected, counted_qty=counted, discrepancy=discrepancy,
            )
            total_counted += counted
            total_ecart += discrepancy
            if discrepancy != 0:
                StockMovement.objects.create(
                    boutique=boutique, stock=variant.stock, movement_type=StockMovement.MovementType.AJUSTEMENT,
                    quantite=discrepancy, reason=StockMovement.Reason.CORRECTION_INVENTAIRE,
                    notes=f'Écart constaté lors de l\'inventaire #{count.id}.',
                )
        InventoryCount.objects.filter(pk=count.pk).update(
            total_variantes=len(counted_variants), quantite_comptee=total_counted, ecart=total_ecart,
        )

    # ── Présences (une absence non justifiée + un retard par employé, ce mois-ci) ──
    def _create_attendance(self, boutique, employees):
        today = date.today()
        for employee in employees:
            AttendanceRecord.objects.create(
                boutique=boutique, employee=employee, date=today.replace(day=min(5, today.day)),
                type=AttendanceRecord.Type.ABSENCE, justified=False, reason='Non communiqué',
            )
            AttendanceRecord.objects.create(
                boutique=boutique, employee=employee, date=today.replace(day=min(12, today.day)),
                type=AttendanceRecord.Type.RETARD, reason='Embouteillage',
            )

    # ── Paie du mois en cours, calculée avec le VRAI moteur de calcul serveur ──
    def _create_payroll(self, boutique, employees):
        today = date.today()
        period_start = today.replace(day=1)
        period_end = today
        period_label = period_start.strftime('%B %Y').capitalize()
        for i, employee in enumerate(employees):
            calc = compute_for_employee(employee, period_start, period_end)
            net_pay = compute_net_pay(employee.base_salary, Decimal('0'), calc['deduction'])
            # Un employé sur deux est déjà payé intégralement, l'autre partiellement -> teste
            # les trois statuts (payé/partiel/non payé) sur l'ensemble du jeu de données.
            amount_paid = net_pay if i % 2 == 0 else (net_pay / 2).quantize(Decimal('1'))
            PayrollEntry.objects.create(
                boutique=boutique, employee=employee, period_label=period_label,
                period_start=period_start, period_end=period_end,
                unjustified_absences=calc['unjustified_absences'], late_count=calc['late_count'],
                base_salary=employee.base_salary, deduction=calc['deduction'], net_pay=net_pay,
                amount_paid=amount_paid, status=status_for(net_pay, amount_paid),
            )

    # ── Contourne auto_now_add pour dater un StockMovement dans le passé ────
    def _backdate(self, movement, when):
        StockMovement.objects.filter(pk=movement.pk).update(date=when.date(), created_at=when)

    # ── Stock réellement en base pour ces variantes (jamais l'attribut Python en mémoire,
    #    devenu périmé dès qu'un signal a recalculé Stock ailleurs — voir StockMovement) ──
    def _current_stock_map(self, variants):
        rows = Stock.objects.filter(variant__in=variants).values_list('variant_id', 'on_hand_qty')
        return dict(rows)

    # ── Résumé final affiché dans le terminal ───────────────────────────────
    def _print_summary(self, created_boutiques):
        rows = [row for row in created_boutiques if row]
        if not rows:
            self.stdout.write(self.style.WARNING('Aucune nouvelle boutique créée (déjà présentes — relancer avec --reset).'))
            return
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'{len(rows)} boutique(s) de démonstration prête(s).'))
        self.stdout.write(f'Mot de passe commun à TOUS les comptes créés : {DEMO_PASSWORD}')
        self.stdout.write('')
        for row in rows:
            boutique, owner, employees = row['boutique'], row['owner'], row['employees']
            self.stdout.write(f"— {boutique.name} ({boutique.business_type})")
            self.stdout.write(f"    Propriétaire : {owner.username}")
            for emp in employees:
                self.stdout.write(f"    Employé      : {emp.user.username} ({emp.get_access_role_display()})")
