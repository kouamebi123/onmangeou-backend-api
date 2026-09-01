# Mise à jour UX et médias

## SMS OTP

L'adaptateur Twilio est facultatif. Sans configuration, les SMS restent simulés.
Configurer côté serveur uniquement : SMS_PROVIDER=twilio, TWILIO_ACCOUNT_SID,
TWILIO_AUTH_TOKEN et SMS_SENDER_ID (expéditeur autorisé). Désactiver
OTP_DEV_ECHO_CODE pour tout envoi réel. Ne jamais exposer les secrets dans Expo.
Un accusé d'acceptation par le fournisseur ne prouve pas la livraison au téléphone.
Tester ensuite sur un numéro contrôlé et vérifier les journaux fournisseur.

Référence : https://www.twilio.com/docs/messaging/api/message-resource

## Paiements

Wave, Wero, Orange Money, MTN et Moov sont des options de simulation uniquement.
Aucun compte opérateur ni contrat d'encaissement n'est connecté. Leur présence
ne garantit pas leur disponibilité commerciale dans un pays donné.
Le webhook sandbox refuse les appels sans PAYMENTS_SANDBOX_SECRET explicite.
Ne pas utiliser la simulation comme preuve d'encaissement.

## Images

Voir assets/demo-media/README.md. L'import doit être exécuté explicitement
après déploiement. Le seed ne remplace plus les photos des fixtures existantes.

## Validation à terminer avant publication

- Commande créée puis ouverture immédiate de l'onglet Commandes.
- Retour au premier plan de l'application et évolution d'une commande.
- Connexion nouveau compte, saisie du nom, interruption puis reprise.
- Carte web : filtre Ouvert, déplacement, zoom, sélection puis changement de filtre.
- Carte native : test sur iOS et Android ; clé Google Maps Android restreinte à
  l'application et à sa signature via GOOGLE_MAPS_ANDROID_API_KEY au build.
- Import média : examiner le dry-run, appliquer, contrôler URL et persistance
  après redéploiement. Ne jamais lancer un reset de la base de production.
