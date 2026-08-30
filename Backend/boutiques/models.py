# models : briques de base pour définir des modèles Django.
from django.db import models


# Une boutique de la plateforme — peut être une épicerie, une boutique de mode, etc.
# C'est la racine du cloisonnement multi-tenant : presque tous les autres modèles ont un FK vers elle.
class Boutique(models.Model):
    # Clé primaire entière auto-incrémentée.
    id = models.AutoField(primary_key=True)
    # Le compte Propriétaire qui possède cette boutique — PROTECT : on ne peut pas supprimer un
    # Owner tant qu'il a encore des boutiques (éviterait des boutiques orphelines).
    owner = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='boutiques')
    # Nom commercial affiché partout dans l'interface.
    name = models.CharField(max_length=150)
    # Quartier/adresse — texte libre, fonctionne pour n'importe quelle ville.
    neighborhood = models.CharField(max_length=150, blank=True)
    # Couleur principale du thème visuel de cette boutique (code hexadécimal, ex: "#1F6E5C").
    theme_primary_color = models.CharField(max_length=7, default='#0f172a')
    # Couleur d'accent du thème visuel.
    theme_accent_color = models.CharField(max_length=7, default='#f59e0b')
    # Type d'activité — texte libre ("épicerie", "mode", "sport"...), purement informatif pour
    # l'instant (visibilité côté Super Admin), sans effet sur les fonctionnalités disponibles.
    business_type = models.CharField(max_length=100, blank=True)
    # Liste JSON des fonctionnalités auxquelles cette boutique a souscrit — voir schema.md pour
    # le catalogue complet des clés possibles (dashboard, products, cashier...).
    enabled_features = models.JSONField(default=list, blank=True)
    # Abonnement actif ou non — UNIQUEMENT modifiable par un SUPERADMIN (voir
    # BoutiqueWriteSerializer.validate) : une boutique désactivée devient inaccessible à son
    # propriétaire/ses employés (toutes les pages se ferment, comme si enabled_features était
    # vide), mais SES DONNÉES SONT CONSERVÉES — c'est l'alternative volontaire à la suppression,
    # qui reste interdite par l'API (voir BoutiqueViewSet, jamais de DELETE) pour éviter de
    # perdre par erreur l'historique d'une boutique cliente.
    is_active = models.BooleanField(default=True)
    # Date de création — utile pour trier/afficher l'ancienneté d'une boutique.
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Boutique'
        verbose_name_plural = 'Boutiques'
        # Les plus récentes en premier par défaut.
        ordering = ['-created_at']

    def __str__(self):
        return self.name


# Réglages propres à une boutique — reprend les champs de SystemSettings (SoftCosy), mais par
# boutique plutôt qu'en ligne unique globale (incompatible avec plusieurs boutiques indépendantes).
class BoutiqueSettings(models.Model):
    id = models.AutoField(primary_key=True)
    # Relation un-à-un : chaque boutique a EXACTEMENT une ligne de réglages.
    boutique = models.OneToOneField(Boutique, on_delete=models.CASCADE, related_name='settings')
    # Seuil en-dessous duquel une variante est signalée en stock faible.
    low_stock_threshold = models.IntegerField(default=10)
    # Seuil en-dessous duquel l'alerte devient critique (plus grave que "faible").
    critical_stock_threshold = models.IntegerField(default=5)
    # Active/désactive les notifications de stock faible.
    notify_low_stock = models.BooleanField(default=True)
    # Active/désactive les notifications de mise à jour système.
    notify_system_updates = models.BooleanField(default=True)
    # Active/désactive l'envoi d'un rapport hebdomadaire.
    notify_weekly_report = models.BooleanField(default=True)

    class Meta:
        # Nom de table explicite (pas de préfixe d'app) — le modèle a été renommé depuis
        # "SystemSettings" (SoftCosy) mais le principe (une ligne de réglages) reste identique.
        db_table = 'boutiquesettings'
        verbose_name = 'Réglages boutique'
        verbose_name_plural = 'Réglages boutique'

    def __str__(self):
        return f'Réglages — {self.boutique.name}'
