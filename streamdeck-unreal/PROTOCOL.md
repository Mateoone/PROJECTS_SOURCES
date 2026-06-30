# Protocole réseau — le contrat entre les deux côtés

C'est le seul point de couplage entre le plugin Stream Deck et Unreal. Tant qu'on le respecte,
chaque côté peut être réécrit indépendamment (autre langage, autre client, etc.).

## Transport

- **TCP**, par défaut `127.0.0.1:5051` (le serveur écoute sur `0.0.0.0`).
- Encodage **UTF-8**.
- **Une trame = une ligne** = un objet JSON terminé par `\n` (LF). `\r\n` toléré.
- Le serveur UE accepte **un client à la fois** ; le plugin Stream Deck ouvre une
  connexion courte par appui (puis la referme après ~250 ms / réception du feedback).

## Stream Deck → Unreal (commande)

```json
{"action":"<string>","payload":<string|object>}\n
```

| Champ | Type | Notes |
|---|---|---|
| `action` | string | nom logique routé côté UE (`Fire`, `Spin`, `SpawnEnemy`…) |
| `payload` | string **ou** objet JSON **ou** absent | données libres pour l'action |

Règles de `payload` (côté plugin, fonction `buildCommandLine`) :
- champ vide → `""`,
- texte qui parse en JSON valide → transmis comme **objet** imbriqué,
- sinon → transmis comme **string** JSON-échappée.

Côté UE (`HandleIncomingLine`) :
- `payload` objet → re-sérialisé en **string JSON** et passé tel quel dans `OnStreamDeckCommand`
  (à toi de le re-parser si besoin — voir la démo),
- `payload` string → passé tel quel,
- ligne **non-JSON** → toute la ligne est traitée comme `action` (pratique pour debug `nc`).

### Exemples valides
```json
{"action":"Fire","payload":""}
{"action":"SpawnEnemy","payload":{"type":"boss","power":10}}
{"action":"Say","payload":"Bonjour le monde"}
Fire            ← ligne brute = action "Fire" (debug uniquement)
```

## Unreal → Stream Deck (feedback, optionnel)

Émis par `SendState(Action, State)` côté UE :

```json
{"action":"<string>","state":"<string>"}\n
```

Le plugin Stream Deck lit cette ligne (fenêtre de lecture ouverte après l'envoi) et met à jour
le **titre du bouton** avec `state`. Si UE n'envoie rien, le bouton affiche simplement ✓ après
un envoi réussi.

## Threading (côté UE) — important

- La lecture socket se fait sur un **thread dédié** (`FRunnable`).
- Chaque ligne reçue est **marshalée sur le game thread** via `AsyncTask(ENamedThreads::GameThread, …)`
  avant le `Broadcast`. → Tu peux donc toucher aux Actors/UObjects en toute sécurité dans
  `OnStreamDeckCommand`, comme dans n'importe quel event Blueprint.
- `SendState` peut être appelé depuis le game thread ; l'écriture socket est protégée par un mutex.

## Ports & sécurité

- Port configurable côté UE via `StartServer(Port)` ; côté Stream Deck via le Property Inspector.
- **Aucune authentification** : à n'utiliser que sur `localhost` ou un LAN de confiance.
  Pour exposer hors machine, ajouter un token partagé dans le JSON et le vérifier côté UE.
