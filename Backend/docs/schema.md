# Registre Plateforme — schéma de données

Schéma unifié pour une plateforme multi-boutique façon Shopify : un seul backend, une seule base, plusieurs boutiques (de types différents) qui souscrivent chacune à leurs propres fonctionnalités. Fusionne le domaine métier déjà en production chez **SoftCosy** (produits à variantes, achats fournisseurs, commandes, inventaire) avec celui construit pour **Chez Idrissou** (cloisonnement multi-boutique, comptes à 3 niveaux, ardoise, paie/présence).

Ce document remplace le précédent schéma « Chez Idrissou seule » — la structure change en profondeur (produits à variantes, catégories par boutique, fonctionnalités à la carte), ce n'est pas une simple extension.

**Cohérence des noms avec SoftCosy** : pour toute entité qui existe dans les deux projets, les noms de champs et de tables reprennent **exactement** ceux de SoftCosy (y compris ses noms en français comme `quantite`, `total_variantes`, `ecart`, et ses tables courtes comme `saleline`, `customerorder`). Les seuls écarts sont marqués explicitly ci-dessous, avec la raison.

## Comment lire ce schéma

| Symbole | Signification |
|---|---|
| `PK` | clé primaire |
| `FK` | clé étrangère |
| `UK` | valeur unique |
| `\|\|` | exactement un |
| `o{` | zéro ou plusieurs |
| `\|{` | un ou plusieurs |
| `o\|` | zéro ou un |

Une entité citée sans liste de champs est définie dans un autre domaine — elle n'apparaît que pour montrer le lien.

Neuf domaines, vingt-et-une entités :

- **Comptes & boutiques** — qui se connecte, à quelle boutique il appartient, et ce que cette boutique a activé.
- **Catalogue** — produits et leurs déclinaisons (taille, couleur...), catégories propres à chaque boutique.
- **Stock** — niveau de stock par déclinaison, et chaque mouvement qui l'a fait bouger.
- **Clients** — annuaire partagé entre ventes comptoir et commandes, avec ardoise optionnelle.
- **Ventes** — une vente comptoir, ses lignes, son mode de paiement.
- **Commandes** — commande à livrer (site web ou saisie manuelle), cycle de vie distinct d'une vente.
- **Achats** — fournisseurs et commandes fournisseurs, qui réapprovisionnent le stock.
- **RH & paie** — présence, retards, salaire net calculé.
- **Inventaire** — stock attendu face au stock compté, écart par déclinaison.

## La pièce nouvelle : fonctionnalités à la carte

`Boutique.enabled_features` est une liste JSON de clés — exactement le même principe que `EmployeeProfile.allowed_pages` (un employé n'a que les pages qu'on lui coche), mais au niveau boutique : une boutique n'a que les fonctionnalités auxquelles elle a souscrit. Catalogue fusionné (le `PAGES`/`ALL_PAGES` de SoftCosy et Idrissou réunis) :

`dashboard, products, stocks, cashier, sales, orders, customers, employees, attendance, payroll, inventory, suppliers, purchases, reports, settings`

Un `OWNER` n'a plus un accès illimité par défaut (contrairement à l'ancien schéma Idrissou seul) : il a accès à tout ce que **sa** boutique a activé, ni plus ni moins. Seul `SUPERADMIN` (exploitant de la plateforme) voit tout, toujours.

## Vue d'ensemble

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "13px"}, "er": {"diagramPadding": 18}} }%%
erDiagram
  User ||--o{ Boutique : possede
  User ||--o| EmployeeProfile : est
  Boutique ||--o| BoutiqueSettings : configure
  Boutique ||--o{ EmployeeProfile : emploie
  Boutique ||--o{ Category : range
  Boutique ||--o{ Product : catalogue
  Boutique ||--o{ Customer : connait
  Boutique ||--o{ Sale : encaisse
  Boutique ||--o{ Order : recoit
  Boutique ||--o{ Supplier : approvisionne_par
  Boutique ||--o{ Purchase : commande
  Boutique ||--o{ StockMovement : journalise
  Boutique ||--o{ AttendanceRecord : suit
  Boutique ||--o{ PayrollEntry : verse
  Boutique ||--o{ InventoryCount : audite
  Category ||--o{ Product : groupe
  Product ||--o{ Variant : decline
  Variant ||--o| Stock : suit
  Customer |o--o{ Sale : credite
  Customer |o--o{ Order : passe
  EmployeeProfile ||--o{ Sale : encaisse_via
  Sale ||--|{ SaleLine : detaille
  Product ||--o{ SaleLine : vendue_via
  Variant ||--o{ SaleLine : vendue_via
  Order ||--|{ OrderLine : detaille
  Product ||--o{ OrderLine : commandee_via
  Variant ||--o{ OrderLine : commandee_via
  Supplier ||--o{ Purchase : fournit
  Purchase ||--|{ PurchaseLine : detaille
  Product ||--o{ PurchaseLine : achetee_via
  Variant ||--o{ PurchaseLine : achetee_via
  Product ||--o{ StockMovement : bouge_sans_variante
  EmployeeProfile ||--o{ AttendanceRecord : pointe
  EmployeeProfile ||--o{ PayrollEntry : percoit
  InventoryCount ||--|{ InventoryLine : detaille
  Product ||--o{ InventoryLine : comptee_via
  Variant ||--o{ InventoryLine : comptee_via
```

## Comptes & boutiques

Un seul `User` pour les trois rôles ; `EmployeeProfile` ne s'ajoute que pour les employés. `BoutiqueSettings` (1-1) reprend les champs de `SystemSettings` de SoftCosy à l'identique, mais par boutique — chez SoftCosy c'était une ligne unique partagée par tout le monde, incompatible avec plusieurs boutiques indépendantes (nom de table différent en conséquence : `boutiquesettings`, pas `systemsettings`).

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "14px"}, "er": {"diagramPadding": 20}} }%%
erDiagram
  User {
    int id PK
    string username UK
    string password "hashe, jamais en clair"
    string full_name
    image profile_photo "optionnelle"
    string account_type "SUPERADMIN / OWNER / EMPLOYEE"
    bool is_active
    bool is_staff
  }
  Boutique {
    int id PK
    int owner_id FK
    string name
    string neighborhood
    string theme_primary_color
    string theme_accent_color
    string business_type "epicerie / mode / sport... libre"
    json enabled_features "fonctionnalites souscrites"
    datetime created_at
  }
  BoutiqueSettings {
    int id PK
    int boutique_id FK, UK "OneToOne"
    int low_stock_threshold
    int critical_stock_threshold
    bool notify_low_stock
    bool notify_system_updates
    bool notify_weekly_report
  }
  EmployeeProfile {
    int id PK
    int user_id FK, UK "OneToOne"
    int boutique_id FK
    string role
    string phone
    date hire_date
    decimal base_salary
    string status "actif / inactif"
    string access_role "gerant / manager / staff"
    json allowed_pages "sous-ensemble de enabled_features"
  }

  User ||--o{ Boutique : possede
  User ||--o| EmployeeProfile : est
  Boutique ||--o| BoutiqueSettings : configure
  Boutique ||--o{ EmployeeProfile : emploie
```

## Catalogue

`Category` passe de globale (Idrissou seul) à **propre à chaque boutique** : une épicerie et une boutique de mode n'ont aucune catégorie en commun — mais garde les champs `description`/`image_url` de SoftCosy. `Product` récupère `code_produit` (nom exact SoftCosy — pas `barcode`, qui reste sur `Variant` comme chez SoftCosy). `Product` + `Variant` reprend le modèle SoftCosy tel quel — un produit simple (épicerie) n'a qu'une seule variante par défaut, un produit à déclinaisons (mode) en a plusieurs.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "14px"}, "er": {"diagramPadding": 20}} }%%
erDiagram
  Category {
    int id PK
    int boutique_id FK
    string name
    string description
    string image_url
  }
  Product {
    int id PK
    int boutique_id FK
    int category_id FK
    string name
    string description
    string code_produit "code interne (pas le code-barres, voir Variant)"
    string brand
    string badge
    string icon
    string emoji
    string fabric
    json colors
    bool is_published
    string unit "unite / kg / g / l / cl / carton / sachet — NOUVEAU (Idrissou)"
    date expiration_date "optionnel — NOUVEAU (Idrissou)"
  }
  Variant {
    int id PK
    int product_id FK
    string sku "auto-genere, sequence PAR BOUTIQUE (pas globale comme SoftCosy)"
    string barcode "code-barres scannable"
    string model
    string size
    decimal selling_price
    decimal cost_price
    decimal low_stock_threshold "NOUVEAU (Idrissou) — SoftCosy n'a qu'un seuil global"
    json attributes "couleur, matiere... libre"
    bool is_active
    datetime created_or_updated_at
  }
  Boutique

  Boutique ||--o{ Category : range
  Boutique ||--o{ Product : catalogue
  Category ||--o{ Product : groupe
  Product ||--o{ Variant : decline
```

## Stock

`Stock` reste par variante (noms de champs identiques à SoftCosy). `StockMovement` reprend les 16 raisons de SoftCosy, son champ `quantite` (en français dans le code SoftCosy — pas `quantity`), sa liaison `product` optionnelle pour les mouvements sans variante encore assignée, et ses deux champs de date (`date` pour comparaison exacte par des scripts, `created_at` pour le tri chronologique réel) — gagne seulement `boutique_id`, absent chez SoftCosy (mono-boutique). Jamais de mouvement écrit à la main sur `Stock` — toujours via `StockMovement`.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "14px"}, "er": {"diagramPadding": 20}} }%%
erDiagram
  Stock {
    int id PK
    int variant_id FK, UK "une ligne de stock par variante"
    decimal on_hand_qty
    decimal reserved_qty
    decimal available_qty
    date last_counted_at
  }
  StockMovement {
    int id PK
    int boutique_id FK "NOUVEAU (Idrissou) — SoftCosy est mono-boutique"
    int stock_id FK "optionnel"
    int product_id FK "optionnel — mouvement au niveau produit, sans variante"
    int sale_line_id FK "optionnel"
    int purchase_line_id FK "optionnel"
    int user_id FK "optionnel"
    string movement_type "ENTREE / SORTIE / AJUSTEMENT"
    decimal quantite "nom exact SoftCosy (francais), type Decimal (pas Integer)"
    string reason "16 codes repris de SoftCosy"
    date date "comparaison exacte (scripts)"
    datetime created_at "tri chronologique reel"
    text notes
  }
  Product

  Product ||--o{ StockMovement : bouge_sans_variante
```

## Clients

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "14px"}, "er": {"diagramPadding": 20}} }%%
erDiagram
  Customer {
    int id PK
    int boutique_id FK
    string name
    string phone "unique PAR BOUTIQUE (SoftCosy : unique globalement, mono-boutique)"
    string address
    decimal balance_due "ardoise, 0 par defaut — NOUVEAU (Idrissou)"
    date created_at
  }
  Boutique
  Sale
  Order

  Boutique ||--o{ Customer : connait
  Customer |o--o{ Sale : credite
  Customer |o--o{ Order : passe
```

## Ventes

Vente comptoir immédiate — pas de cycle de livraison (voir Commandes). `channel` (où) + `payment_mode` (comment) + `status` (où en est le paiement) sont trois axes distincts. `status` inclut `REMBOURSE`, corrigeant une incohérence relevée chez SoftCosy (utilisé dans le tableau de bord mais absent des choix du modèle). **Écart volontaire** : `employee_id` remplace le `user_id` de SoftCosy — seul un compte Employé peut encaisser (règle déjà construite côté Idrissou), donc pointer vers `EmployeeProfile` plutôt que le `User` brut est plus précis ici.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "14px"}, "er": {"diagramPadding": 20}} }%%
erDiagram
  Sale {
    int id PK
    int boutique_id FK
    int invoice_number "sequence PAR BOUTIQUE"
    int employee_id FK "ECART : User chez SoftCosy, EmployeeProfile ici"
    int customer_id FK "optionnel"
    string customer_name "recopie au moment de la vente"
    datetime sold_at
    string channel "store / en_ligne"
    string payment_mode "cash / mobile_money / credit — NOUVEAU (Idrissou)"
    string mobile_money_reference "NOUVEAU (Idrissou)"
    string mobile_money_sender "NOUVEAU (Idrissou)"
    decimal subtotal
    decimal discount_amount
    decimal total
    string status "PAYE / NONPAYE / PARTIEL / REMBOURSE"
    text notes
    datetime created_at
  }
  SaleLine {
    int id PK
    int sale_id FK
    int product_id FK
    int variant_id FK "optionnel"
    decimal quantity
    decimal unit_price
    decimal line_discount
    decimal line_total
    datetime created_at
  }
  Boutique
  Customer
  EmployeeProfile
  Product
  Variant

  Boutique ||--o{ Sale : encaisse
  Customer |o--o{ Sale : credite
  EmployeeProfile ||--o{ Sale : encaisse_via
  Sale ||--|{ SaleLine : detaille
  Product ||--o{ SaleLine : vendue_via
  Variant ||--o{ SaleLine : vendue_via
```

## Commandes

Nouveau pour Idrissou, repris de SoftCosy tel quel (y compris `user_id` — un propriétaire peut aussi saisir une commande manuellement, pas seulement un employé, donc pas le même écart que sur `Sale`). Cycle de livraison distinct d'une vente (`EN_ATTENTE → EN_COURS → LIVRE/ANNULE`). `variant_label` reste du texte libre — la vitrine publique ne connaît qu'une taille/couleur choisies, pas la variante exacte ; la résolution vers un vrai `Variant` se fait côté serveur, avec repli sur ce texte si elle échoue.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "14px"}, "er": {"diagramPadding": 20}} }%%
erDiagram
  Order {
    int id PK
    int boutique_id FK
    int customer_id FK "optionnel"
    string customer_name
    string customer_phone
    string delivery_address
    string channel "SITE_WEB / APPLICATION"
    string payment_mode "CASH_LIVRAISON / MOBILE_MONEY"
    string status "EN_ATTENTE / EN_COURS / LIVRE / ANNULE"
    decimal subtotal
    decimal total
    text notes
    int user_id FK "vide si saisie web, rempli si staff"
    datetime created_at
    datetime updated_at
  }
  OrderLine {
    int id PK
    int order_id FK
    int product_id FK
    int variant_id FK "optionnel, resolu depuis variant_label"
    string variant_label "texte libre, saisie vitrine publique"
    decimal quantity
    decimal unit_price
    decimal line_total
  }
  Boutique
  Customer
  Product
  Variant

  Boutique ||--o{ Order : recoit
  Customer |o--o{ Order : passe
  Order ||--|{ OrderLine : detaille
  Product ||--o{ OrderLine : commandee_via
  Variant ||--o{ OrderLine : commandee_via
```

## Achats

Nouveau pour Idrissou, repris de SoftCosy. Passer une commande fournisseur au statut « reçu » déclenche automatiquement des `StockMovement` d'entrée — repris tel quel, bon design déjà éprouvé.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "14px"}, "er": {"diagramPadding": 20}} }%%
erDiagram
  Supplier {
    int id PK
    int boutique_id FK
    string name
    string phone
    string address
    date created_at
  }
  Purchase {
    int id PK
    int boutique_id FK
    string reference "auto CMD-annee-sequence, PAR BOUTIQUE"
    int supplier_id FK "optionnel"
    decimal sub_total
    decimal purchase_cost
    decimal total
    date purchased_at
    string status "declenche l'entree de stock a RECU"
    text notes
    datetime created_at
  }
  PurchaseLine {
    int id PK
    int purchase_id FK
    int product_id FK
    int variant_id FK "optionnel"
    decimal quantity
    decimal unit_cost
    decimal line_cost
    string note
    datetime created_at
  }
  Boutique
  Product
  Variant

  Boutique ||--o{ Supplier : approvisionne_par
  Boutique ||--o{ Purchase : commande
  Supplier ||--o{ Purchase : fournit
  Purchase ||--|{ PurchaseLine : detaille
  Product ||--o{ PurchaseLine : achetee_via
  Variant ||--o{ PurchaseLine : achetee_via
```

## RH & paie

Inchangé depuis Idrissou (SoftCosy n'a ni présence ni paie).

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "14px"}, "er": {"diagramPadding": 20}} }%%
erDiagram
  AttendanceRecord {
    int id PK
    int boutique_id FK
    int employee_id FK
    date date
    string type "retard / absence"
    string reason
    time scheduled_time
    time actual_time
    bool justified
  }
  PayrollEntry {
    int id PK
    int boutique_id FK
    int employee_id FK
    string period_label
    date period_start
    date period_end
    int unjustified_absences
    int late_count
    decimal base_salary
    decimal bonus
    decimal deduction
    decimal net_pay
    decimal amount_paid
    string status "non_paye / partiel / paye"
  }
  Boutique
  EmployeeProfile

  Boutique ||--o{ AttendanceRecord : suit
  Boutique ||--o{ PayrollEntry : verse
  EmployeeProfile ||--o{ AttendanceRecord : pointe
  EmployeeProfile ||--o{ PayrollEntry : percoit
```

## Inventaire

Garde la mécanique Idrissou (finalisation = pose des `StockMovement` d'ajustement) et reprend les champs de synthèse de SoftCosy sur l'en-tête avec leurs noms exacts (`total_variantes`, `quantite_comptee`, `ecart` — en français dans le code SoftCosy). **Écart volontaire** : `ecart`/`discrepancy` en `Decimal`, pas en texte comme chez SoftCosy (`"+3"`/`"OK"`, illisible pour un calcul) ; `ecart = compte - attendu`, sans l'incohérence relevée chez SoftCosy entre le commentaire du champ et le calcul réel du sérialiseur ; `user_id` en `SET_NULL` plutôt que le `CASCADE` de SoftCosy (supprimer un compte ne doit pas supprimer l'historique des inventaires, comme partout ailleurs dans ce schéma).

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#F1E9D2", "primaryTextColor": "#2A2420", "primaryBorderColor": "#8A7B5C", "lineColor": "#8A7B5C", "secondaryColor": "#E8DFC0", "tertiaryColor": "#FBF8EF", "fontFamily": "ui-monospace, Consolas, monospace", "fontSize": "14px"}, "er": {"diagramPadding": 20}} }%%
erDiagram
  InventoryCount {
    int id PK
    int boutique_id FK "NOUVEAU (Idrissou)"
    string status "en_cours / termine"
    text notes
    date created_at
    int user_id FK "optionnel, SET_NULL (ecart volontaire vs CASCADE chez SoftCosy)"
    int total_variantes "synthese, nom exact SoftCosy (francais)"
    decimal quantite_comptee "synthese, nom exact SoftCosy (francais)"
    decimal ecart "synthese, nom exact SoftCosy (francais) = compte - attendu"
  }
  InventoryLine {
    int id PK
    int inventory_count_id FK
    int product_id FK
    int variant_id FK "optionnel"
    decimal expected_qty "stock au lancement du comptage"
    decimal counted_qty "vide = pas encore compte"
    decimal discrepancy "Decimal ici (ecart volontaire vs texte chez SoftCosy)"
    datetime created_or_updated_at
  }
  Boutique
  Product
  Variant

  Boutique ||--o{ InventoryCount : audite
  InventoryCount ||--|{ InventoryLine : detaille
  Product ||--o{ InventoryLine : comptee_via
  Variant ||--o{ InventoryLine : comptee_via
```

## Pourquoi ce schéma, pas un autre

### Produit + Variante fusionnés, pas deux modèles séparés

Une épicerie vend des produits simples (un sac de riz, une variante unique) ; une boutique de mode vend des déclinaisons (taille, couleur). Plutôt que deux systèmes de catalogue différents, le modèle Produit/Variante de SoftCosy couvre les deux : un produit simple a juste une seule `Variant` par défaut.

### `Category` devient propre à chaque boutique

Chez Idrissou seule, les catégories étaient globales (toutes les boutiques étaient des épiceries, partager « Boissons »/« Épicerie » avait du sens). Sur une plateforme à boutiques de types différents, une épicerie et une boutique de mode n'ont plus aucune catégorie en commun.

### `product_id` gardé À CÔTÉ de `variant_id` sur les lignes (vente, achat, commande, inventaire, mouvement de stock)

Ce n'est pas de la redondance gratuite : chez SoftCosy, `variant` est en `SET_NULL` alors que `product` est en `PROTECT`. Si une variante est supprimée, la ligne garde quand même la trace du produit — sans le doublon, cette information serait perdue.

### `enabled_features` sur `Boutique`, en plus de `allowed_pages` sur `EmployeeProfile`

Deux niveaux : ce que la boutique a souscrit (`enabled_features`), et ce qu'un employé précis peut utiliser parmi ce qui est souscrit (`allowed_pages`, déjà construit). Un `OWNER` n'a plus un accès illimité par défaut — seul `SUPERADMIN` (exploitant plateforme) voit tout.

### `Decimal` partout pour les quantités, jamais `Integer`

SoftCosy utilise des entiers (articles vendus à l'unité). Idrissou a besoin de fractions (kg, litres). La plateforme doit supporter les deux boutiques à la fois — mêmes noms de champs que SoftCosy, mais type `Decimal`.

### `sku`/`invoice_number`/`reference` : séquences PAR BOUTIQUE, pas globales

Chez SoftCosy (mono-boutique), un compteur global suffisait. Sur la plateforme, deux boutiques différentes doivent chacune pouvoir avoir leur propre `SKU-00001` sans collision.

## Hors périmètre, pour l'instant

Pas de site vitrine public multi-tenant dans ce schéma (la résolution de variante depuis une saisie texte libre, `OrderLine.variant_label`, est prévue mais son API reste à construire). Pas de gestion de plans tarifaires/abonnement de la plateforme elle-même — `enabled_features` est une liste ouverte, pas encore reliée à une facturation.

## Et ensuite

Étape 2 traduit ce schéma en modèles Django (une app par domaine ci-dessus) + migrations. Étape 3 reconstruit l'API REST par-dessus (sérialiseurs/vues), adaptée au nouveau schéma — travail séparé, pas fait dans la même session que les modèles.
