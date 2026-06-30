# Installation — Plugin + Profil Stream Deck

Deux livrables, dans `streamdeck-unreal/dist/` (régénérables, voir plus bas) :

| Fichier | Quoi |
|---|---|
| `dev.mip.unreal.streamDeckPlugin` | le **plugin** (action *Trigger UE Event*, avec `ws` embarqué) |
| `UnrealBridge.streamDeckProfile` | un **profil** de 5 boutons pré-configurés (Stream Deck **MK.2**) |

> ⚠️ **Ordre important** : installer le **plugin d'abord**, le **profil ensuite**.
> Le profil référence l'action `dev.mip.unreal.trigger` : si le plugin n'est pas installé,
> les boutons resteront vides.

## 1. Installer le plugin

Double-cliquer `dev.mip.unreal.streamDeckPlugin` → l'app Stream Deck propose l'installation.
L'action **Trigger UE Event** apparaît alors dans la catégorie *Unreal Bridge*.

*(Alternative dev : symlink du dossier `.sdPlugin` — voir HANDOFF.md §4.)*

## 2. Installer le profil

Double-cliquer `UnrealBridge.streamDeckProfile` → l'app importe le profil **Unreal Bridge**.
Il le sélectionne (sinon, choisis-le dans le sélecteur de profils de l'app).

Les 5 boutons (rangée du haut) sont mappés sur la démo `StreamDeckDemoActor`, déjà configurés
(host `127.0.0.1`, port `5051`) et différenciés par leur **titre** :

| Touche | Titre | Action | Payload | Effet UE |
|---|---|---|---|---|
| 1 | Red | `Color` | `{"r":1,"g":0,"b":0}` | cube rouge |
| 2 | Blue | `Color` | `{"r":0,"g":0.4,"b":1}` | cube bleu |
| 3 | Scale x2 | `Scale` | `{"value":2.0}` | échelle ×2 |
| 4 | Spin | `Spin` | *(vide)* | toggle rotation |
| 5 | Reset | `Reset` | *(vide)* | reset |

> **Images** : les 5 touches affichent l'icône par défaut du plugin (la « TV verte »), pas les
> `bt_01..05`. Le format d'export 7.5 dont je dispose ne contenait pas d'image personnalisée, donc
> je ne connais pas encore son encodage. Pour des icônes distinctes : pose-les à la main après
> import (10 s/touche), ou exporte-moi un profil où tu as mis **une** image custom sur une touche
> et je l'intègre au générateur.

## 3. Côté Unreal

Installer le plugin UE et brancher l'event — voir [HANDOFF.md](HANDOFF.md) et
[examples/StreamDeckDemo](examples/StreamDeckDemo/README.md). Lancer le jeu (PIE ou build),
puis appuyer sur les boutons.

---

## Régénérer les paquets

```bash
cd streamdeck-unreal
./tools/build.sh        # construit le .streamDeckPlugin + le .streamDeckProfile
```

Le modèle d'appareil et les métadonnées 7.5 (`DeviceModel`, `DeviceUUID`, `AppVersion`…) sont en
constantes en tête de `tools/make_profile.js` (objet `ENV`) — à adapter pour un autre poste/modèle.

---

## À savoir sur le format de profil

Le format `.streamDeckProfile` **n'est pas documenté officiellement** par Elgato. Ce générateur
calque le format **Stream Deck 7.5** relevé sur un vrai export de l'appareil (`package.json`
`FormatVersion:1` + `RequiredPlugins`, bundle `Version:"3.0"` avec page `Default`, schéma d'action
`ActionID`/`Plugin`/`LinkedTitle`/`Resources`). Le `Device.UUID` et les métadonnées OS/app sont
ceux de la machine de test (modifiables dans `tools/make_profile.js`).

Si tu changes de version majeure du logiciel Stream Deck, le format peut bouger : ré-exporte un
profil de référence et redonne-le moi pour recaler le générateur.

**Fallback toujours fiable** : installe seulement le **plugin**, glisse l'action *Trigger UE Event*
sur 5 touches et configure-les via le Property Inspector (valeurs dans le tableau ci-dessus).

Le **plugin** (`.streamDeckPlugin`), lui, suit le format officiel documenté — pas de fragilité.
