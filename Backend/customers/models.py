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


# Historique des règlements d'ardoise — ledger d'AJOUT UNIQUEMENT, jamais modifié après coup
# (même principe que stock.StockMovement pour le stock) : avant ce modèle, encaisser un paiement
# se limitait à réécrire Customer.balance_due en silence, sans aucune trace de QUI avait validé
# QUOI ni QUAND — voir CustomerViewSet.record_payment, seul point d'écriture légitime ici.
class CustomerPayment(models.Model):
    id = models.AutoField(primary_key=True)
    # Boutique concernée — recopiée depuis le client au moment du paiement (comme sur
    # StockMovement) pour permettre le cloisonnement direct sans remonter à chaque fois via customer.
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='customer_payments')
    # Client dont l'ardoise est réglée — CASCADE : l'historique d'un client n'a plus de sens si
    # le client lui-même est supprimé (contrairement à un compte utilisateur, voir `user` plus bas).
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='payments')
    # Montant réglé PENDANT ce paiement précis (toujours positif) — jamais le nouveau solde
    # directement, pour que l'historique reste lisible même après plusieurs paiements partiels.
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    # Solde restant dû juste APRÈS ce paiement — recopié à l'écriture (comme Sale.customer_name)
    # pour lire l'historique tel qu'il était à l'époque, sans avoir à rejouer tous les paiements
    # dans l'ordre pour reconstituer un solde à un instant donné.
    balance_after = models.DecimalField(max_digits=12, decimal_places=2)
    # Qui a encaissé ce paiement (employé OU propriétaire, les deux peuvent avoir accès à la page
    # Clients) — SET_NULL : l'historique reste même si ce compte est supprimé plus tard.
    user = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, related_name='customer_payments', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        verbose_name = 'Paiement ardoise'
        verbose_name_plural = 'Paiements ardoise'
        # Les plus récents en premier — un historique se lit toujours du plus récent au plus ancien.
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.customer.name} — {self.amount} FCFA'
