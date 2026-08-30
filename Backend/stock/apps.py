# AppConfig : classe de configuration standard d'une app Django.
from django.apps import AppConfig


# Configuration de l'app stock.
class StockConfig(AppConfig):
    name = 'stock'

    # Appelé au démarrage — importe signals.py pour que les décorateurs @receiver s'enregistrent
    # (sans cet import, le fichier ne serait jamais exécuté et les signaux resteraient inactifs).
    def ready(self):
        import stock.signals  # noqa: F401 (import fait exprès pour son effet de bord)
