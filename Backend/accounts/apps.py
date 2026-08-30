# AppConfig : classe de configuration standard d'une app Django.
from django.apps import AppConfig


# Configuration de l'app accounts.
class AccountsConfig(AppConfig):
    # Nom Python du module de l'app (doit correspondre au dossier).
    name = 'accounts'

    # Appelé automatiquement par Django au démarrage, une fois l'app chargée.
    def ready(self):
        # Import différé : OperationalError/ProgrammingError ne sont utiles que si la base existe déjà.
        from django.db import OperationalError, ProgrammingError
        try:
            # Tente de créer le super admin de secours (voir la fonction plus bas).
            _ensure_default_admin()
        except (OperationalError, ProgrammingError):
            # La base n'est pas encore prête (ex: tout premier `migrate`) — on ignore silencieusement.
            pass


# Crée automatiquement un compte Super Admin au démarrage si aucun n'existe déjà et que les
# variables d'environnement nécessaires sont fournies — évite d'être bloqué sans aucun accès
# après un premier déploiement (ex: sur Render, où lancer une commande interactive est pénible).
def _ensure_default_admin():
    # Import différé (évite un import circulaire au chargement du module apps.py).
    import os
    from django.contrib.auth import get_user_model

    # Lit les identifiants du compte de secours depuis l'environnement.
    username = os.getenv('DEFAULT_ADMIN_USERNAME')
    password = os.getenv('DEFAULT_ADMIN_PASSWORD')
    full_name = os.getenv('DEFAULT_ADMIN_FULL_NAME', 'Super Admin')

    # Si les variables ne sont pas définies, on ne fait rien (comportement normal en dev sans .env complet).
    if not username or not password:
        return

    User = get_user_model()
    # Ne crée le compte que s'il n'existe déjà AUCUN superuser (ne recrée pas à chaque redémarrage).
    if not User.objects.filter(is_superuser=True).exists():
        User.objects.create_superuser(username=username, password=password, full_name=full_name)
        print(f'[Plateforme] Compte super admin créé automatiquement : {username}')
