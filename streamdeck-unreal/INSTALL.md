# Installation — Plugin + Profil Stream Deck

Deux livrables, dans `streamdeck-unreal/dist/` (régénérables, voir plus bas) :

| Fichier | Quoi |
|---|---|
| `dev.mip.unreal.streamDeckPlugin` | le **plugin** (action *Trigger UE Event*, avec `ws` embarqué) |
| `UnrealBridge.streamDeckProfile` | un **profil** de 5 boutons pré-configurés, **images embarquées** (Stream Deck **XL** par défaut) |

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
(host `127.0.0.1`, port `5051`), avec **image `bt_0X` embarquée** et titre :

| Touche | Image | Titre | Action | Payload | Effet UE |
|---|---|---|---|---|---|
| 1 | bt_01 | Red | `Color` | `{"r":1,"g":0,"b":0}` | cube rouge |
| 2 | bt_02 | Blue | `Color` | `{"r":0,"g":0.4,"b":1}` | cube bleu |
| 3 | bt_03 | Scale x2 | `Scale` | `{"value":2.0}` | échelle ×2 |
| 4 | bt_04 | Spin | `Spin` | *(vide)* | toggle rotation |
| 5 | bt_05 | Reset | `Reset` | *(vide)* | reset |

> Profil généré pour **Stream Deck XL** (`20GAT9902`) par défaut. Pour MK.2 :
> `./tools/build.sh mk2` (voir plus bas).

## 3. Côté Unreal

Installer le plugin UE et brancher l'event — voir [HANDOFF.md](HANDOFF.md) et
[examples/StreamDeckDemo](examples/StreamDeckDemo/README.md). Lancer le jeu (PIE ou build),
puis appuyer sur les boutons.

---

## Régénérer les paquets

```bash
cd streamdeck-unreal
./tools/build.sh           # plugin + profil XL (défaut)
./tools/build.sh mk2       # profil Stream Deck MK.2 (5x3) à la place
```

Modèles connus dans `tools/make_profile.js` (objet `DEVICES`) : `xl` = `20GAT9902`,
`mk2` = `20GBA9901`. Le `Device.UUID` et les métadonnées OS/app (objet `ENV`) sont ceux des
machines de test — à adapter pour un autre poste/modèle.

---

## À savoir sur le format de profil

Le format `.streamDeckProfile` **n'est pas documenté officiellement** par Elgato. Ce générateur
calque le format **Stream Deck 7.5** relevé sur de vrais exports de l'appareil (`package.json`
`FormatVersion:1` + `RequiredPlugins`, bundle `Version:"3.0"` avec page `Default`, schéma d'action
`ActionID`/`Plugin`/`LinkedTitle`/`Resources`, images dans `Images/` référencées par
`States[].Image`). Le `Device.UUID` et les métadonnées OS/app sont ceux des machines de test.

Si tu changes de version majeure du logiciel Stream Deck, le format peut bouger : ré-exporte un
profil de référence et redonne-le moi pour recaler le générateur.

**Fallback toujours fiable** : installe seulement le **plugin**, glisse l'action *Trigger UE Event*
sur 5 touches et configure-les via le Property Inspector (valeurs dans le tableau ci-dessus).

Le **plugin** (`.streamDeckPlugin`), lui, suit le format officiel documenté — pas de fragilité.
