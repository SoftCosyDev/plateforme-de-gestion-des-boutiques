# models : briques de base pour définir des modèles Django.
from django.db import models

# BoutiqueScopedQuerySet : applique le cloisonnement multi-tenant.
from boutiques.querysets import BoutiqueScopedQuerySet


# Une commande à livrer — nouveau pour Idrissou, repris de SoftCosy tel quel. Distincte d'une
# Sale (vente comptoir immédiate) : une commande a un cycle de vie de livraison avant d'être
# remise physiquement au client (site web ou saisie manuelle par le personnel).
class Order(models.Model):
    # D'où vient la commande.
    class Channel(models.TextChoices):
        SITE_WEB = 'SITE_WEB', 'Site web'
        APPLICATION = 'APPLICATION', 'Application'

    # Comment la commande sera payée.
    class PaymentMode(models.TextChoices):
        CASH_LIVRAISON = 'CASH_LIVRAISON', 'Paiement à la livraison'
        MOBILE_MONEY = 'MOBILE_MONEY', 'Mobile Money'

    # Où en est la commande dans son cycle de vie.
    class Status(models.TextChoices):
        EN_ATTENTE = 'EN_ATTENTE', 'En attente'
        EN_COURS = 'EN_COURS', 'En cours'
        LIVRE = 'LIVRE', 'Livré'
        ANNULE = 'ANNULE', 'Annulé'

    id = models.AutoField(primary_key=True)
    # Boutique qui reçoit cette commande.
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='orders')
    # Client rattaché — optionnel (repris via son téléphone au moment de la commande).
    customer = models.ForeignKey('customers.Customer', on_delete=models.SET_NULL, related_name='orders', null=True, blank=True)
    # Nom du client recopié au moment de la commande.
    customer_name = models.CharField(max_length=200)
    # Téléphone du client recopié au moment de la commande.
    customer_phone = models.CharField(max_length=32)
    # Adresse de livraison — optionnelle (ex: retrait en boutique).
    delivery_address = models.CharField(max_length=255, blank=True)
    channel = models.CharField(max_length=16, choices=Channel.choices, default=Channel.APPLICATION)
    payment_mode = models.CharField(max_length=20, choices=PaymentMode.choices, default=PaymentMode.CASH_LIVRAISON)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.EN_ATTENTE)
    # Somme des lignes de la commande.
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Montant final (pas de remise au niveau commande, contrairement à Sale — comme chez SoftCosy).
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    # Compte qui a saisi la commande — PAS forcément un employé (un propriétaire peut aussi
    # saisir une commande manuellement), donc User et non EmployeeProfile ici. Vide si la
    # commande vient directement du site web (aucun membre du personnel ne l'a saisie).
    user = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, related_name='orders_created', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Mis à jour à chaque changement (ex: changement de statut lors de la livraison).
    updated_at = models.DateTimeField(auto_now=True)

    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        db_table = 'customerorder'
        verbose_name = 'Commande'
        verbose_name_plural = 'Commandes'
        ordering = ['-id']

    def __str__(self):
        return f'Commande #{self.id}'


# Une ligne d'article d'une commande.
class OrderLine(models.Model):
    id = models.AutoField(primary_key=True)
    # Commande parente — CASCADE : une ligne n'a pas de sens sans sa commande.
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='lines')
    # Produit commandé — PROTECT : on garde l'historique même si le produit est retiré du catalogue.
    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT, related_name='order_lines')
    # Variante précise commandée — optionnelle et résolue côté serveur depuis variant_label
    # (la vitrine publique ne connaît pas les variantes exactes, voir ci-dessous).
    variant = models.ForeignKey('catalog.Variant', on_delete=models.SET_NULL, related_name='order_lines', null=True, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Description libre de la déclinaison choisie (ex: "Taille: M — Couleur: Noir") — la vitrine
    # publique ne connaît qu'une taille/couleur saisies en texte, pas la Variant exacte ; ce
    # texte reste la trace lisible même si la résolution vers `variant` échoue ou n'a pas eu lieu.
    variant_label = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'orderline'
        verbose_name = 'Ligne de commande'
        verbose_name_plural = 'Lignes de commande'

    def __str__(self):
        return f'Ligne #{self.id} (commande {self.order_id})'
