# PageNumberPagination : pagination standard de DRF, par numéro de page.
from rest_framework.pagination import PageNumberPagination


# Pagination utilisée par défaut sur toute l'API (voir settings.py).
class FlexiblePagination(PageNumberPagination):
    # Nombre d'éléments par page si le client ne précise rien.
    page_size = 20
    # Nom du paramètre d'URL qui permet au client de changer la taille de page (?page_size=50).
    page_size_query_param = 'page_size'
    # Taille de page maximale autorisée, même si le client en demande plus.
    max_page_size = 100
