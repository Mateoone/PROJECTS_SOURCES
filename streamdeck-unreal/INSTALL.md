# Installation — Plugin + Profil Stream Deck

Deux livrables, dans `streamdeck-unreal/dist/` (régénérables, voir plus bas) :

| Fichier | Quoi |
|---|---|
| `dev.mip.unreal.streamDeckPlugin` | le **plugin** (action *Trigger UE Event*, avec `ws` embarqué) |
| `UnrealBridge.streamDeckProfile` | le **profil ALSTOM_MODULARITY_01** (19 touches, images embarquées, Stream Deck **XL**) |

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

Le profil **ALSTOM_MODULARITY_01** (Stream Deck **XL**, `20GAT9902`) reproduit fidèlement ton layout,
avec tes 19 images embarquées et `host 127.0.0.1 / port 5051` sur chaque touche :

| Zone | Touches | Action | Payload |
|---|---|---|---|
| Emplacements (colonne 0) | `EMPLACEMENTA…D` | `EMPLACEMENTA` … `EMPLACEMENTD` | `{"emplacement":A}` … `D` |
| Modules (colonnes 3-7) | 15 modules | `MODULE1` … `MODULE15` | `{"module":1}` … `{"module":15}` |

À l'appui, chaque touche envoie `{"action": <ACTION>, "payload": <payload>}` à UE — voir
[HANDOFF.md](HANDOFF.md) pour router ça côté gameplay.

> ✅ **Corrections appliquées** par rapport à l'export d'origine :
> - Payloads emplacement passés en JSON valide `{"emplacement":"A"}` (…`B/C/D`) → envoyés à UE
>   comme **objet** (`payload:{"emplacement":"A"}`), plus comme chaîne.
> - `MODULE10` : payload corrigé `{"module":10}` (était `1`).
> - Touche `5,2` : action renommée `MODULE13` (était `MODULE513`), image idem.

## 3. Côté Unreal

Installer le plugin UE et brancher l'event — voir [HANDOFF.md](HANDOFF.md) et
[examples/StreamDeckDemo](examples/StreamDeckDemo/README.md). Lancer le jeu (PIE ou build),
puis appuyer sur les boutons.

---

## Régénérer les paquets

```bash
cd streamdeck-unreal
./tools/build.sh           # plugin + profil ALSTOM (défaut)
./tools/build.sh demo      # profil démo 5 boutons (Color/Scale/Spin/Reset)
```

Les profils sont **pilotés par des layouts** dans `tools/profiles/<nom>/` :
- `layout.json` — `{ name, device:"xl"|"mk2", imageDir, keys:[{coord,action,payload,title,image,showTitle}] }`
- `images/` — les PNG référencés.

Pour modifier le profil ALSTOM : édite `tools/profiles/alstom/layout.json` (et les images) puis
`./tools/build.sh`. Modèles connus (`DEVICES` dans `make_profile.js`) : `xl` = `20GAT9902`,
`mk2` = `20GBA9901`. `Device.UUID` et métadonnées OS/app (`ENV`) = machines de test.

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
