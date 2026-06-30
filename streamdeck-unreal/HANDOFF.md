# Stream Deck ↔ Unreal Engine — Dossier de remise (POC)

> **But du POC** : appuyer sur un bouton Elgato Stream Deck → déclencher un event de gameplay
> dans Unreal Engine (éditeur PIE **et** build packagé), avec retour d'état sur le bouton.
>
> **Temps estimé pour un dev UE** : ~30–45 min (dont la compilation du plugin).

---

## 0. TL;DR (le strict minimum)

```
[Bouton Stream Deck] → App Elgato → Plugin Node (TCP) → Subsystem C++ UE → event Blueprint → ton gameplay
```

1. Copier le plugin UE dans `TonProjet/Plugins/StreamDeckBridge/`, recompiler.
2. Installer le plugin Stream Deck (Node + symlink dans le dossier Elgato).
3. Lier l'event Blueprint `OnStreamDeckCommand(Action, Payload)` à ta logique.
4. Tester sans matériel : `printf '{"action":"Fire","payload":""}\n' | nc 127.0.0.1 5051`.

---

## 1. Pré-requis

| Outil | Version | Pour |
|---|---|---|
| Unreal Engine | 5.2+ (testé visé 5.3/5.4) | plugin C++ |
| Projet UE **C++** | — | un projet Blueprint-only ne compile pas de plugin C++ ; convertis-le (ajoute une classe C++ vide) |
| Visual Studio / Rider (Win) ou Xcode (mac) | — | compilation |
| Node.js | 18+ (l'app Stream Deck embarque son runtime) | plugin Stream Deck |
| App Stream Deck Elgato | 6.5+ | héberge le plugin |
| Matériel Stream Deck | optionnel | le POC se teste sans, via `nc`/`netcat` |

---

## 2. Arborescence livrée

```
streamdeck-unreal/
├── HANDOFF.md                ← CE FICHIER (commence ici)
├── PROTOCOL.md               ← spec du protocole réseau (le contrat entre les 2 côtés)
├── README.md                 ← vue d'ensemble & archi
│
├── unreal-plugin/
│   └── StreamDeckBridge/      ← À COPIER dans TonProjet/Plugins/
│       ├── StreamDeckBridge.uplugin
│       └── Source/StreamDeckBridge/
│           ├── StreamDeckBridge.Build.cs
│           ├── Public/  StreamDeckBridgeModule.h, StreamDeckBridgeSubsystem.h
│           └── Private/ StreamDeckBridgeModule.cpp, StreamDeckBridgeSubsystem.cpp
│
├── streamdeck-plugin/
│   └── dev.mip.unreal.sdPlugin/   ← À LIER dans le dossier Plugins d'Elgato
│       ├── manifest.json
│       ├── package.json           (dépendance: ws)
│       ├── bin/plugin.js          (logique du plugin)
│       ├── ui/inspector.html      (Property Inspector : host/port/action/payload)
│       └── imgs/                  ⚠️ icônes PNG à fournir avant distribution
│
└── examples/StreamDeckDemo/   ← Démo prête à l'emploi (cube color/scale/spin/reset)
    ├── StreamDeckDemoActor.h / .cpp
    └── README.md              (recette C++ ET recette 100 % Blueprint)
```

---

## 3. Côté Unreal — installation (≈ 15 min)

1. **Copier** le dossier `unreal-plugin/StreamDeckBridge/` dans `TonProjet/Plugins/StreamDeckBridge/`.
2. Clic droit sur le `.uproject` → **Generate Visual Studio project files** (ou régénère via l'éditeur).
3. **Compiler** le projet depuis l'IDE (ou *Build* dans l'éditeur).
4. Au lancement, le serveur TCP démarre seul sur le **port 5051** (via un `UGameInstanceSubsystem`,
   donc actif en PIE et en build packagé).

### Brancher ta logique (Blueprint)
- `Get Game Instance` → `Get Subsystem` → **Stream Deck Bridge Subsystem**.
- **Bind Event to On Stream Deck Command** → *Custom Event* `(Action: String, Payload: String)`.
- **Switch on String (Action)** → route vers ton gameplay.
- Optionnel : **Send State (Action, State)** pour mettre à jour le titre du bouton.

### Brancher ta logique (C++)
Voir `examples/StreamDeckDemo/StreamDeckDemoActor.cpp` : `AddDynamic` au `BeginPlay`,
`RemoveDynamic` à l'`EndPlay`. (Pour compiler la démo : ajoute `"StreamDeckBridge"` aux
`PublicDependencyModuleNames` de TON module de jeu.)

### API du subsystem
| Membre | Type | Rôle |
|---|---|---|
| `OnStreamDeckCommand(Action, Payload)` | delegate BlueprintAssignable | reçu à chaque appui (game thread) |
| `StartServer(Port=5051)` / `StopServer()` | BlueprintCallable | (re)démarrer le serveur |
| `IsClientConnected()` | BlueprintPure | un client est-il connecté ? |
| `SetButtonTitle(Action, Title)` | BlueprintCallable | **callback** : titre des touches liées à `Action` |
| `SetButtonImage(Action, ImageName)` | BlueprintCallable | **callback** : image (`"bt_03"` embarquée ou data URI) |
| `SetButtonState(Action, StateIndex)` | BlueprintCallable | **callback** : état (actions multi-états) |
| `SendState(Action, State)` | BlueprintCallable | alias historique de `SetButtonTitle` |

> **Callback UE → bouton** : ces fonctions ciblent **toutes les touches configurées sur `Action`**.
> Ex. quand un module est sélectionné dans la sim : `SetButtonImage("emplacementA", "bt_03")` +
> `SetButtonTitle("emplacementA", "SÉLECTIONNÉ")`. Détails du format : **PROTOCOL.md**.

---

## 4. Côté Stream Deck — installation (≈ 10 min)

```bash
cd streamdeck-plugin/dev.mip.unreal.sdPlugin
npm install          # installe 'ws'
```

Lier le dossier `.sdPlugin` dans le répertoire plugins d'Elgato, puis redémarrer l'app :

```bash
# macOS
ln -s "$PWD" "$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/dev.mip.unreal.sdPlugin"
# Windows (PowerShell, admin)
# New-Item -ItemType Junction -Path "$env:APPDATA\Elgato\StreamDeck\Plugins\dev.mip.unreal.sdPlugin" -Target "<chemin>\dev.mip.unreal.sdPlugin"
```

Dans Stream Deck, glisser l'action **Trigger UE Event** (catégorie *Unreal Bridge*) sur un bouton,
puis configurer dans le Property Inspector :

| Champ | Défaut | Description |
|---|---|---|
| UE Host | `127.0.0.1` | IP de la machine Unreal |
| UE Port | `5051` | port du subsystem |
| Action | `Fire` | nom logique routé côté UE |
| Payload | *(vide)* | JSON (`{"power":10}`) ou texte simple |
| Title | *(vide)* | libellé du bouton |

Appui → ✓ si UE a reçu, ⚠️ si la connexion échoue.

> ⚠️ **Avant toute distribution** : ajouter les PNG dans `imgs/` (`plugin.png`, `action.png`,
> `key.png`, `category.png` + variantes `@2x`) et packager en `.streamDeckPlugin`.

---

## 5. Tester sans matériel Stream Deck / sans UE

**a) Piloter UE sans Stream Deck** — le côté UE est un simple serveur TCP, pilotable avec `netcat` :
```bash
printf '{"action":"Fire","payload":{"power":10}}\n' | nc 127.0.0.1 5051
printf 'Fire\n' | nc 127.0.0.1 5051          # ligne brute = nom d'action (debug)
```
Regarde l'`Output Log` d'Unreal : catégorie `LogStreamDeckBridge` (et `LogTemp` pour la démo).

**b) Vérifier le Stream Deck sans UE** — un faux UE qui affiche les instructions reçues en live :
```bash
node tools/mock-ue/server.js        # puis ouvrir http://localhost:8787
```
Il ouvre le même serveur TCP (5051) ; le plugin Stream Deck s'y connecte sans modif. Voir
[tools/mock-ue/README.md](tools/mock-ue/README.md).

---

## 6. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le bouton met ⚠️ | UE pas lancé / mauvais host:port / firewall | vérifier *Play* lancé, port 5051, `nc` en local OK |
| Plugin UE invisible | projet Blueprint-only | convertir en projet C++ (ajouter une classe C++) |
| Erreur de link Sockets/Json | deps manquantes | déjà dans `Build.cs` du plugin ; vérifier que ton module ajoute `StreamDeckBridge` si tu utilises la démo |
| Couleur du cube ne change pas (démo) | nom du param material | remplacer `"Color"` par le vrai nom (`BaseColor`…) dans `StreamDeckDemoActor.cpp` |
| Action depuis une autre machine | bind sur `0.0.0.0` OK, mais firewall | ouvrir le port 5051 ; pas d'auth → réseau de confiance uniquement |
| `npm install` échoue | Node absent en CLI | l'app Elgato a son runtime ; pour dev local installer Node 18+ |

---

## 7. « Definition of done » du POC

- [ ] Plugin UE compilé, serveur log « listening on 0.0.0.0:5051 ».
- [ ] `nc` déclenche bien l'event `OnStreamDeckCommand` (visible dans l'Output Log).
- [ ] Un bouton Stream Deck déclenche une action de gameplay visible.
- [ ] Le titre du bouton se met à jour via `SendState` (démo `Spin` → `spinning`).
- [ ] Validé en **build packagé** (pas seulement PIE).

---

## 8. Limites connues / suites possibles

- Connexion TCP **persistante** côté plugin (mutualisée par `host:port`, reconnexion auto avec
  backoff). Côté UE le serveur n'accepte **qu'un client à la fois** → suffisant pour un Stream Deck,
  à étendre si plusieurs surfaces doivent se connecter en parallèle.
- **Pas d'authentification** sur le port TCP → localhost/LAN de confiance uniquement.
- Pas de **dials** (Stream Deck +) pour les valeurs analogiques.
- Plugin Stream Deck en JS « brut » → migration possible vers `@elgato/streamdeck` (TypeScript) + CLI.
- Icônes PNG et packaging `.streamDeckPlugin` à faire.

> Détails du format réseau : voir **PROTOCOL.md**.
