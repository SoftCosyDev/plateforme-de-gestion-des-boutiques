# models : briques de base pour définir des modèles Django.
from django.db import models

# BoutiqueScopedQuerySet : applique le cloisonnement multi-tenant.
from boutiques.querysets import BoutiqueScopedQuerySet


# Un client — annuaire partagé entre les ventes comptoir et les commandes à livrer.
class Customer(models.Model):
    id = models.AutoField(primary_key=True)
    # Boutique à laquelle ce client est rattaché.
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='customers')
    # Nom du client.
    name = models.CharField(max_length=200)
    # Numéro de téléphone — identifiant naturel du client (utilisé pour le retrouver côté vente).
    # Unique PAR BOUTIQUE (pas globalement comme chez SoftCosy, qui est mono-boutique) : deux
    # boutiques différentes doivent pouvoir chacune avoir un client avec le même numéro.
    phone = models.CharField(max_length=32)
    # Adresse — optionnelle.
    address = models.CharField(max_length=255, blank=True)
    # Montant dû par ce client (crédit/"ardoise") — nouveau par rapport à SoftCosy, à 0 par
    # défaut donc totalement invisible pour une boutique qui n'utilise pas le crédit.
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Date de création du client.
    created_at = models.DateField(auto_now_add=True)

    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        db_table = 'customer'
        verbose_name = 'Client'
        verbose_name_plural = 'Clients'
        # Empêche le même numéro deux fois pour la même boutique (mais autorisé entre boutiques différentes).
        constraints = [
            models.UniqueConstraint(fields=['boutique', 'phone'], name='unique_customer_phone_per_boutique'),
        ]

    def __str__(self):
        return self.name
