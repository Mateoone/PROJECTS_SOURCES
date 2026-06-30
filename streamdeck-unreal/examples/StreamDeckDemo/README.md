# Demo : Actor piloté au Stream Deck

Un cube qu'on **colore / scale / fait tourner / reset** depuis 4 boutons Stream Deck,
avec retour d'état affiché sur le titre du bouton.

## Installation (variante C++)

1. Copier `StreamDeckDemoActor.h` + `.cpp` dans le `Source/<TonModule>/` de **ton projet**.
2. Dans `Source/<TonModule>/<TonModule>.Build.cs`, ajouter la dépendance au plugin :
   ```csharp
   PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "StreamDeckBridge" });
   ```
3. Recompiler, puis glisser un **StreamDeckDemoActor** dans le niveau. Lancer en *Play*.

Le cube utilise `/Engine/BasicShapes/Cube`. Le paramètre couleur du material dynamique
s'appelle `Color` dans le code — adapte-le au nom réel du paramètre de ton material
(ex. `BaseColor`) si la couleur ne change pas.

## Boutons à configurer (Property Inspector du plugin Stream Deck)

| Action | Payload | Effet |
|---|---|---|
| `Color` | `{"r":1,"g":0,"b":0}` | cube rouge (RGB 0–1) |
| `Color` | `{"r":0,"g":0.4,"b":1}` | cube bleu |
| `Scale` | `{"value":2.0}` | échelle ×2 |
| `Spin`  | *(vide)* | toggle rotation |
| `Reset` | *(vide)* | remet couleur/échelle/rotation par défaut |

Host `127.0.0.1`, Port `5051`. Après l'appui, le titre du bouton affiche l'état renvoyé
par UE (`spinning`, `x2.00`, `rgb 1.0/0.0/0.0`, `reset`…).

## Équivalent 100 % Blueprint (sans C++)

Si tu préfères ne pas toucher au C++ pour la logique de jeu :

1. **Event BeginPlay** d'un Actor BP →
   `Get Game Instance` → `Get Subsystem (StreamDeckBridgeSubsystem)` → stocker dans une variable.
2. Depuis ce subsystem, **Bind Event to On Stream Deck Command** → créer un *Custom Event*
   `OnSDCommand (Action: String, Payload: String)`.
3. Dans `OnSDCommand` : **Switch on String** sur `Action` :
   ```
   Switch on String (Action)
     ├─ "Spin"  → Toggle bool bSpinning
     ├─ "Scale" → (parser Payload) Set Actor Scale 3D
     ├─ "Color" → (parser Payload) Set Vector Param sur un Dynamic Material Instance
     └─ "Reset" → valeurs par défaut
   ```
4. Parsing JSON du `Payload` : nœuds de la lib **JsonBlueprintUtilities**
   (`From String` → `Get Float Field`), ou passer des payloads texte simples et utiliser
   `Parse Into Array` pour rester en pur BP.
5. Retour bouton : appeler **Send State (Action, State)** sur le subsystem.

> Le delegate `OnStreamDeckCommand` est `BlueprintAssignable`, et `StartServer` / `StopServer` /
> `IsClientConnected` / `SendState` sont `BlueprintCallable` — toute la démo est faisable en BP.

## Test sans Stream Deck

```bash
printf '{"action":"Spin","payload":""}\n'                 | nc 127.0.0.1 5051
printf '{"action":"Color","payload":{"r":1,"g":0,"b":0}}\n' | nc 127.0.0.1 5051
```
