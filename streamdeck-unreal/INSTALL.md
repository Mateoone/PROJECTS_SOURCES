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

Les 5 boutons (rangée du haut) sont mappés sur la démo `StreamDeckDemoActor` :

| Touche | Image | Action | Payload | Effet UE |
|---|---|---|---|---|
| 1 | bt_01 | `Color` | `{"r":1,"g":0,"b":0}` | cube rouge |
| 2 | bt_02 | `Color` | `{"r":0,"g":0.4,"b":1}` | cube bleu |
| 3 | bt_03 | `Scale` | `{"value":2.0}` | échelle ×2 |
| 4 | bt_04 | `Spin` | *(vide)* | toggle rotation |
| 5 | bt_05 | `Reset` | *(vide)* | reset |

Host `127.0.0.1`, port `5051` sur chaque touche (modifiable dans le Property Inspector).

## 3. Côté Unreal

Installer le plugin UE et brancher l'event — voir [HANDOFF.md](HANDOFF.md) et
[examples/StreamDeckDemo](examples/StreamDeckDemo/README.md). Lancer le jeu (PIE ou build),
puis appuyer sur les boutons.

---

## Régénérer les paquets

```bash
cd streamdeck-unreal
./tools/build.sh                 # MK.2 par défaut (20GBA9901)
./tools/build.sh 20GAA9901       # Stream Deck 15 touches V1/V2
./tools/build.sh 20GAT9901       # Stream Deck XL
./tools/build.sh 20GAM9901       # Stream Deck Mini
./tools/build.sh 20GBD9901       # Stream Deck +
```

---

## ⚠️ À savoir sur le format de profil

Le format `.streamDeckProfile` **n'est pas documenté officiellement** par Elgato et varie selon
les versions du logiciel. Ce profil est généré selon le format **Stream Deck 6.x** (bundle `Pages`
+ `Profiles/<page>/`, `Version: "2.0"`, `Device.Model` = MK.2).

Si l'import échoue, cible le mauvais device, ou n'affiche pas les images :
1. Vérifie ton **modèle exact** (le profil est lié au modèle ; régénère avec le bon id ci-dessus).
2. **Fallback fiable** : installe seulement le **plugin**, puis glisse manuellement l'action
   *Trigger UE Event* sur 5 touches et configure-les via le Property Inspector (toujours fonctionnel).
   Le tableau ci-dessus donne les valeurs exactes.

Le **plugin** (`.streamDeckPlugin`), lui, suit le format officiel et documenté — pas de fragilité.
