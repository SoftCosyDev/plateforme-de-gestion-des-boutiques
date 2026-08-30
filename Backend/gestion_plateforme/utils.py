# JsonResponse : pour répondre en JSON plutôt qu'en HTML par défaut.
from django.http import JsonResponse


# Fonction appelée par django-axes quand un compte est verrouillé (trop d'échecs de connexion).
def axes_lockout_json(request, credentials):
    # Renvoie une réponse JSON explicite plutôt que la page HTML par défaut de django-axes.
    return JsonResponse({
        # Code machine, lu par le frontend pour afficher le bon message.
        "detail": "lockout",
        # Message humain, au cas où il serait affiché tel quel.
        "message": "Trop de tentatives échouées, veuillez attendre 5 min pour vous reconnecter."
    # 403 : accès refusé.
    }, status=403)
