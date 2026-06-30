# Stream Deck ↔ Unreal Engine — POC

Bridge runtime entre un **Elgato Stream Deck** et **Unreal Engine** (éditeur PIE *et* build packagé).
Inspiré de l'asset Unity *Stream Deck Integration* (F10), mais côté UE.

```
[Stream Deck device]
      │ USB
[App Stream Deck Elgato]
      │ WebSocket JSON (imposé par Elgato)
[Plugin Stream Deck]  (Node/ws)        ← streamdeck-plugin/
      │ TCP, 1 ligne JSON par appui : {"action":"Fire","payload":{...}}\n
[Subsystem C++ UE]  (TCP server)       ← unreal-plugin/
      │ delegate Blueprint OnStreamDeckCommand(Action, Payload)
[Ton gameplay]
```

## Pourquoi ce design (et pas le Remote Control API)

Le **Remote Control API** d'Unreal (HTTP 30010 / WebSocket) est parfait pour piloter l'**éditeur**
(virtual production, lumières, caméras). Mais pour des **events de gameplay dans un build packagé**,
on veut un canal léger qui fire un delegate Blueprint. D'où ce petit serveur TCP custom.

---

## 1. Côté Unreal — `unreal-plugin/StreamDeckBridge`

### Installation
1. Copier le dossier `StreamDeckBridge/` dans `TonProjet/Plugins/`.
2. Régénérer les fichiers de projet, recompiler (le plugin a besoin d'un projet C++).
3. Activer **Stream Deck Bridge** dans *Edit → Plugins* si besoin (activé par défaut).

Le serveur TCP démarre tout seul (port **5051**) via un `UGameInstanceSubsystem` dès le lancement du jeu.

### Utilisation en Blueprint
- Récupérer le subsystem : *Get Game Instance Subsystem → Stream Deck Bridge Subsystem*.
- Lier l'event **On Stream Deck Command (Action, Payload)** et router selon `Action` :

```
Event OnStreamDeckCommand (Action, Payload)
   └─ Switch on String (Action)
        ├─ "Fire"       → SpawnProjectile
        ├─ "Pause"      → Set Game Paused
        └─ "SpawnEnemy" → parse Payload (JSON) → Spawn
```

### Feedback bouton (optionnel)
`SendState(Action, State)` renvoie l'état vers le Stream Deck (ex. mettre à jour le titre du bouton).

### API exposée
| Membre | Type | Rôle |
|---|---|---|
| `OnStreamDeckCommand(Action, Payload)` | delegate BlueprintAssignable | reçu à chaque appui (game thread) |
| `StartServer(Port=5051)` / `StopServer()` | BlueprintCallable | (re)démarrer le serveur |
| `IsClientConnected()` | BlueprintPure | un Stream Deck est-il connecté ? |
| `SendState(Action, State)` | BlueprintCallable | feedback vers le bouton |

---

## 2. Côté Stream Deck — `streamdeck-plugin/dev.mip.unreal.sdPlugin`

### Installation (dev)
```bash
cd streamdeck-plugin/dev.mip.unreal.sdPlugin
npm install            # installe ws
```
Puis lier le dossier `.sdPlugin` dans le répertoire plugins de Stream Deck :
- **macOS** : `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
- **Windows** : `%APPDATA%\Elgato\StreamDeck\Plugins\`

```bash
# macOS
ln -s "$PWD" ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/dev.mip.unreal.sdPlugin
```
Redémarrer l'app Stream Deck. L'action **Trigger UE Event** apparaît dans la catégorie *Unreal Bridge*.

### Configuration d'un bouton (Property Inspector)
| Champ | Défaut | Description |
|---|---|---|
| UE Host | `127.0.0.1` | IP de la machine Unreal |
| UE Port | `5051` | port du subsystem |
| Action | `Fire` | nom logique routé côté UE |
| Payload | *(vide)* | JSON (`{"power":10}`) ou texte simple |
| Title | *(vide)* | libellé du bouton |

À l'appui : OK ✓ si UE a reçu, ⚠️ alerte si la connexion échoue.

> ⚠️ Manquent les PNG d'icônes (`imgs/`). Ajouter `plugin.png`, `action.png`, `key.png`,
> `category.png` (+ variantes `@2x`) avant packaging/distribution.

---

## 3. Tests rapides sans matériel

Tester le côté UE sans Stream Deck (netcat → subsystem) :
```bash
printf '{"action":"Fire","payload":{"power":10}}\n' | nc 127.0.0.1 5051
```
Le parseur accepte aussi une ligne brute (`Fire\n`) comme nom d'action, pratique pour debug.

---

## Roadmap
- [ ] Icônes PNG + packaging `.streamDeckPlugin`.
- [ ] Reconnexion TCP persistante + multi-client (au lieu d'une connexion par appui).
- [ ] Dials (Stream Deck +) → valeurs analogiques (intensité, vitesse…).
- [ ] Plugin Stream Deck en TypeScript via `@elgato/streamdeck` + CLI.
- [ ] Auth/token sur le port TCP si exposé hors localhost.
