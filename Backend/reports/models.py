# models : importé pour respecter la convention Django, mais cette app n'a volontairement AUCUN
# modèle — elle ne fait qu'agréger des données qui vivent déjà dans les autres apps (ventes,
# stock, achats...), voir l'étape API (endpoints du tableau de bord, pas encore construits).
from django.db import models
