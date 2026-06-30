# Mock UE — moniteur des instructions Stream Deck

Un faux Unreal Engine pour **vérifier que les appuis du Stream Deck arrivent bien**, sans lancer UE.
Il ouvre le **même serveur TCP que le subsystem UE** (port 5051, JSON ligne-à-ligne) : le vrai plugin
Stream Deck s'y connecte sans rien changer.

## Lancer

```bash
node streamdeck-unreal/tools/mock-ue/server.js
# puis ouvrir http://localhost:8787
```

Variables d'env : `TCP_PORT` (défaut 5051), `HTTP_PORT` (défaut 8787).

> Si UE tourne déjà, le port 5051 est pris → lance le mock sur un autre port
> (`TCP_PORT=5052 node …`) et règle le même port dans le Property Inspector du bouton.

## Ce que montre la page

- **Statut TCP** : connecté / déconnecté + adresse du client (le plugin).
- **Journal live** des instructions reçues : heure, `action` (badge), `payload` (une ligne brute
  non-JSON s'affiche en badge orange — comme côté UE qui la traite alors comme nom d'action).
- **Statistiques** : compteur par action.
- **Renvoyer un feedback → bouton** : saisis `action` + `state`, le serveur écrit
  `{"action","state"}` sur la connexion — exactement comme `SendState()` côté UE — et le titre
  du bouton Stream Deck se met à jour. Permet de tester l'aller-retour complet.

## Endpoints (pour scripter)

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/` | l'interface web |
| GET | `/events` | flux SSE (statut + commandes en direct) |
| GET | `/commands` | historique + statut en JSON (pratique pour les tests) |
| POST | `/feedback` | `{"action","state"}` → renvoyé au Stream Deck connecté |

## Test sans Stream Deck

```bash
printf '{"action":"Spin","payload":""}\n' | nc 127.0.0.1 5051   # apparaît dans la page
curl -s localhost:8787/commands | python3 -m json.tool          # historique
```

Zéro dépendance (modules Node natifs `net` / `http` + SSE).
