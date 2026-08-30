# os : pour lire les variables d'environnement.
import os

# get_user_model : récupère le modèle User configuré (accounts.User), pas un import direct
# pour rester générique si AUTH_USER_MODEL changeait un jour.
from django.contrib.auth import get_user_model
# BaseCommand : classe de base pour créer une commande `manage.py <nom>`.
from django.core.management.base import BaseCommand


# Commande manuelle équivalente au bootstrap automatique de apps.py — utile pour forcer la
# création (ou vérifier) un compte super admin sans redémarrer le serveur.
class Command(BaseCommand):
    # Texte affiché par `manage.py help ensure_admin`.
    help = "Crée un super administrateur par défaut si aucun superuser n'existe."

    # Déclare les arguments optionnels de la commande en ligne de commande.
    def add_arguments(self, parser):
        parser.add_argument('--username', type=str, help='Identifiant du compte')
        parser.add_argument('--password', type=str, help='Mot de passe du compte')
        parser.add_argument('--full_name', type=str, default='Super Admin', help='Nom complet')

    # Point d'entrée exécuté quand on lance `manage.py ensure_admin`.
    def handle(self, *args, **options):
        User = get_user_model()

        # Priorité aux arguments passés en ligne de commande, sinon repli sur les variables d'environnement.
        username = options.get('username') or os.getenv('DEFAULT_ADMIN_USERNAME')
        password = options.get('password') or os.getenv('DEFAULT_ADMIN_PASSWORD')
        full_name = options.get('full_name') or os.getenv('DEFAULT_ADMIN_FULL_NAME', 'Super Admin')

        # Sans identifiant et mot de passe, impossible de créer le compte — message d'erreur clair.
        if not username or not password:
            self.stderr.write(self.style.ERROR(
                'Fournir --username et --password, ou définir DEFAULT_ADMIN_USERNAME et DEFAULT_ADMIN_PASSWORD.'
            ))
            return

        # Ne crée rien si un super admin existe déjà (évite les doublons).
        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write(self.style.WARNING('Un super administrateur existe déjà. Aucune action effectuée.'))
            return

        # Crée réellement le compte.
        User.objects.create_superuser(username=username, password=password, full_name=full_name)
        self.stdout.write(self.style.SUCCESS(f'Super administrateur créé avec succès : {username}'))
