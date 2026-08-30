# models : briques de base pour définir des modèles Django.
from django.db import models

# BoutiqueScopedQuerySet : applique le cloisonnement multi-tenant.
from boutiques.querysets import BoutiqueScopedQuerySet


# Une session de comptage physique du stock — regroupe plusieurs InventoryLine (une par variante comptée).
class InventoryCount(models.Model):
    class Status(models.TextChoices):
        EN_COURS = 'en_cours', 'En cours'
        TERMINE = 'termine', 'Terminé'

    id = models.AutoField(primary_key=True)
    boutique = models.ForeignKey('boutiques.Boutique', on_delete=models.PROTECT, related_name='inventory_counts')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.EN_COURS)
    notes = models.TextField(blank=True)
    created_at = models.DateField(auto_now_add=True)
    # Qui a lancé ce comptage — SET_NULL (ÉCART VOLONTAIRE par rapport au CASCADE de SoftCosy) :
    # supprimer un compte ne doit pas supprimer l'historique des inventaires, comme partout
    # ailleurs dans ce schéma (cohérence délibérée).
    user = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, related_name='inventory_counts', null=True, blank=True)
    # Champs de synthèse ci-dessous — noms EXACTS repris de SoftCosy (en français dans son code),
    # recalculés et sauvegardés sur l'en-tête à chaque écriture des lignes (voir l'étape API).
    total_variantes = models.IntegerField(default=0)
    quantite_comptee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Écart total = quantité comptée - quantité attendue (voir InventoryLine.discrepancy pour le détail).
    ecart = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    objects = BoutiqueScopedQuerySet.as_manager()

    class Meta:
        db_table = 'inventorycount'
        verbose_name = 'Inventaire'
        verbose_name_plural = 'Inventaires'
        ordering = ['-created_at']

    def __str__(self):
        return f'Inventaire #{self.id} ({self.get_status_display()})'


# Une ligne d'inventaire — le comptage d'UNE variante précise dans une session d'inventaire.
class InventoryLine(models.Model):
    id = models.AutoField(primary_key=True)
    # Session d'inventaire parente — CASCADE : une ligne n'a pas de sens sans sa session.
    inventory_count = models.ForeignKey(InventoryCount, on_delete=models.CASCADE, related_name='lines')
    # Produit compté — PROTECT : on garde l'historique même si le produit est retiré du catalogue.
    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT, related_name='inventory_lines')
    # Variante précise comptée — optionnelle.
    variant = models.ForeignKey('catalog.Variant', on_delete=models.SET_NULL, related_name='inventory_lines', null=True, blank=True)
    # Stock système au moment du LANCEMENT du comptage — figé (ne bouge pas si des ventes
    # arrivent pendant que le comptage est en cours, pour que l'écart affiché reste fiable).
    expected_qty = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Vide = pas encore compté physiquement.
    counted_qty = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Écart = counted_qty - expected_qty — ÉCART VOLONTAIRE par rapport à SoftCosy : ici un vrai
    # Decimal calculable, pas une chaîne de texte ("+3"/"OK") illisible pour un calcul agrégé.
    discrepancy = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Mis à jour automatiquement à chaque sauvegarde.
    created_or_updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inventoryline'
        verbose_name = "Ligne d'inventaire"
        verbose_name_plural = "Lignes d'inventaire"
        ordering = ['id']
        # Une même variante ne peut apparaître qu'une seule fois dans le même comptage.
        constraints = [
            models.UniqueConstraint(fields=['inventory_count', 'variant'], name='unique_variant_per_inventory_count'),
        ]

    def __str__(self):
        return f'{self.product} — attendu {self.expected_qty}'
