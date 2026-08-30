# models : briques de base pour définir des modèles Django.
from django.db import models

# BoutiqueScopedQuerySet : applique le cloisonnement multi-tenant.
from boutiques.querysets import BoutiqueScopedQuerySet


# Une vente comptoir — transaction immédiate, sans cycle de livraison (voir l'app orders pour
# les commandes à livrer, qui sont un objet distinct).
class Sale(models.Model):
    # Où la vente a eu lieu.
    class Channel(models.TextChoices):
        STORE = 'store', 'Boutique'
        ONLINE = 'en_ligne', 'En ligne'

    # Comment la vente a été payée.
    class PaymentMode(models.TextChoices):
        CASH = 'cash', 'Espèces'
        MOBILE_MONEY = 'mobile_money', 'Mobile Money'
        CREDIT = 'credit', 'Crédit (ardoise)'

    # Où en est le paiement — inclut REMBOURSE, absent des choix du modèle chez SoftCosy alors
    # qu'utilisé dans son tableau de bord (incohérence corrigée ici).
    class Status(models.TextChoices):
        PAYE = 'PAYE', 'Payé'
        NONPAYE = 'NONPAYE', 'Non payé'
        PARTIEL = 'PARTIEL', 'Partiel'
        REMBOURSE = 'REMBOURSE', 'Remboursé'

    id = models.AutoField(primary_key=True)
    # Boutique où la vente a été encaissée.
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='sales')
    # Numéro de facture, auto-généré PAR BOUTIQUE (voir save() plus bas) — pas de compteur
    # global comme chez SoftCosy (mono-boutique), pour éviter toute collision entre boutiques.
    invoice_number = models.IntegerField(null=True, blank=True)
    # Employé qui a encaissé cette vente — ÉCART VOLONTAIRE par rapport à SoftCosy (qui pointe
    # vers User) : ici, seul un compte EMPLOYEE peut encaisser, donc EmployeeProfile est plus
    # précis. SET_NULL : l'historique de vente survit même si l'employé quitte l'entreprise.
    employee = models.ForeignKey('employees.EmployeeProfile', on_delete=models.SET_NULL, related_name='sales', null=True, blank=True)
    # Client rattaché à cette vente — optionnel (vente comptoir anonyme possible).
    customer = models.ForeignKey('customers.Customer', on_delete=models.SET_NULL, related_name='sales', null=True, blank=True)
    # Nom du client recopié au moment de la vente (utile pour une vente rapide sans fiche client).
    customer_name = models.CharField(max_length=200, blank=True)
    # Date et heure réelles de la vente (peut différer de created_at si saisie a posteriori).
    sold_at = models.DateTimeField(null=True, blank=True)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.STORE)
    payment_mode = models.CharField(max_length=20, choices=PaymentMode.choices, default=PaymentMode.CASH)
    # Référence de la transaction Mobile Money — rempli seulement si payment_mode=mobile_money.
    mobile_money_reference = models.CharField(max_length=100, blank=True)
    # Numéro de l'expéditeur Mobile Money — idem.
    mobile_money_sender = models.CharField(max_length=32, blank=True)
    # Somme des lignes avant remise globale.
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Remise appliquée sur l'ensemble de la vente (en plus des remises ligne par ligne).
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Montant final = subtotal - discount_amount.
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NONPAYE)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        db_table = 'sale'
        verbose_name = 'Vente'
        verbose_name_plural = 'Ventes'
        ordering = ['-id']

    # Génère automatiquement invoice_number (séquentiel PAR BOUTIQUE) à la création si absent.
    def save(self, *args, **kwargs):
        if not self.pk and not self.invoice_number:
            # Cherche la dernière vente numérotée de la MÊME boutique.
            last = Sale.objects.filter(boutique=self.boutique).exclude(invoice_number=None).order_by('invoice_number').last()
            # Premier numéro si aucune vente précédente, sinon +1.
            self.invoice_number = (last.invoice_number + 1) if last else 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Vente #{self.invoice_number or self.id}'


# Une ligne de vente — un produit/variante vendu, avec sa quantité et son prix au moment de la vente.
class SaleLine(models.Model):
    id = models.AutoField(primary_key=True)
    # Vente parente — CASCADE : une ligne n'a pas de sens sans sa vente.
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='lines')
    # Produit vendu — PROTECT : on ne supprime jamais un produit qui a un historique de vente.
    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT, related_name='sale_lines')
    # Variante précise vendue — SET_NULL (pas PROTECT comme product) : si la variante est
    # supprimée plus tard, la ligne garde quand même la trace du produit via `product` ci-dessus.
    variant = models.ForeignKey('catalog.Variant', on_delete=models.SET_NULL, related_name='sale_lines', null=True, blank=True)
    # Quantité vendue — Decimal pour les unités fractionnaires (kg, litres...).
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Prix unitaire au moment de la vente (peut différer du prix catalogue actuel, historique figé).
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Remise appliquée sur cette ligne précisément.
    line_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Total de la ligne = (quantity * unit_price) - line_discount.
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'saleline'
        verbose_name = 'Ligne de vente'
        verbose_name_plural = 'Lignes de vente'

    def __str__(self):
        return f'Ligne #{self.id} (vente {self.sale_id})'
