# DialAccel

*[English version](README.md)*

Défilement accéléré pour la **Logitech MX Creative Console**, sous Windows.

Tu tournes la molette, le plugin envoie des flèches haut/bas. Plus tu tournes
vite, plus la rafale est longue — une frappe par cran quand tu vas doucement,
une douzaine quand tu accélères. Conçu pour faire défiler les coupes dans une
visionneuse DICOM comme OHIF, mais ça marche avec tout ce qui se pilote aux
flèches.

Équivalent Logitech du plugin Stream Deck
[yokoinc/elgato-dial-scroll](https://github.com/yokoinc/elgato-dial-scroll).

---

## Installation

Trois étapes, et aucun outil de développement.

### 1. Déposer le plugin

Télécharge [`DialAccel.lplug4`](DialAccel.lplug4). C'est une simple archive zip :
extrais son **contenu** — pas le dossier — dans

```
%LOCALAPPDATA%\Logi\LogiPluginService\Plugins\DialAccel
```

Tu dois obtenir `index.mjs`, `metadata\`, `node_modules\` et les deux dossiers
d'icônes directement dans `DialAccel`.

### 2. Redémarrer le Plugin Service

Il ne relit jamais un plugin à chaud, cette étape est donc obligatoire :

```
Stop-Process -Name LogiPluginService,LogiPluginServiceExt -Force
Start-Process 'C:\Program Files\Logi\LogiPluginService\LogiPluginService.exe'
```

### 3. Assigner l'action dans Options+

Ouvre l'écran de personnalisation du périphérique. L'action apparaît sous
**Actions Dial Accel**, sous le nom **Défilement OHIF**.

Deux choses qui font perdre du temps ici :

- **Assigne-la dans le bon profil.** Les onglets en haut de l'écran sont des
  profils par application, et la console suit l'application au premier plan. Une
  action assignée dans le profil par défaut ne s'exécutera pas dans ton
  navigateur. Choisis l'onglet de l'application que tu utilises vraiment.
- **Préfère la roulette, en haut à droite.** Le gros cadran central impose une
  incrustation à l'écran quoi que tu poses dessus. La roulette, non.

Tourne la roulette et ça défile.

---

## Réglage

Tout est en haut de [`src/scroll-model.ts`](src/scroll-model.ts).

`gain` règle l'accélération que le plugin ajoute :

| gain | 1 à 8 crans donnent | ressenti |
|------|---------------------|----------|
| 0    | 1, 2, 3, 4, 5, 6, 7, 8 | on s'en remet à l'appareil |
| 0.3  | 1, 2, 3, 4, 5, 6, 8, 9 | le réglage livré |
| 0.6  | 1, 2, 3, 4, 5, 7, 9, 11 | vif |
| 0.9  | 1, 2, 3, 4, 5, 7, 10, 12 | nerveux |

Ces valeurs restent basses à dessein : le grand cadran accélère déjà tout seul,
ses `tick` passant de 7 à 80 selon la vitesse de rotation. Notre courbe se
superpose à la sienne, donc un gain qui paraît raisonnable sur le papier
s'emballe une fois sur l'appareil.

Deux autres réglages comptent pour la douceur :

| réglage | rôle |
|---|---|
| `ticksPerSlice` | valeur de `tick` qui vaut une coupe. 2 = la roulette avance d'une coupe par cran. |
| `rateSmoothing` | inertie du débit, entre 0 et 1. 1 = le débit saute à chaque événement ; 0.35 = montée en pente douce. |

Le SDK Logi 0.1.1 n'expose aucun panneau de configuration : changer ces chiffres
impose de reconstruire (voir plus bas). Pour disposer de plusieurs niveaux
directement dans Options+ sans reconstruire, il suffit de déclarer plusieurs
actions avec des gains différents.

`debugLog: true` journalise chaque événement reçu et chaque coupe envoyée : c'est
ce relevé, rejoué hors du plugin, qui sert à régler les valeurs ci-dessus.

---

## En cas de problème

Le journal du plugin est la seule source de vérité :

```
%LOCALAPPDATA%\Logi\LogiPluginService\Logs\plugin_logs\DialAccel.log
```

| Ce que dit le journal | Ce que ça veut dire |
|---|---|
| `Starting remote plugin` puis `Init connection confirmed` | Chargé et fonctionnel. |
| `Plugin runtime 'NodeJs22' not yet installed` | Dossier du moteur mal nommé — voir ci-dessous. |
| `Unknown plugin runtime type 'nodejs'` | Le manifeste dit `nodejs`. Il doit dire `nodejs22`. |
| **Rien du tout** quand tu tournes la molette | L'action est assignée dans un profil qui n'est pas l'actif. Voir l'étape 3. |

### `Plugin runtime 'NodeJs22' not yet installed`

Le Plugin Service décompresse son moteur d'exécution dans un dossier nommé
`node22`, puis le cherche sous `nodejs22`. Lui donner les deux noms règle le
problème, une fois pour toutes :

```
$h = "$env:LOCALAPPDATA\Logi\LogiPluginService\PluginHosts"
New-Item -ItemType Junction -Path "$h\nodejs22" -Target "$h\node22"
```

S'il répond que la cible n'existe pas, ouvre Logi Options+ et laisse-le démarrer
complètement — il télécharge le moteur tout seul — puis relance la commande.

### À propos des accents

Le journal ne gère que l'ASCII, les accents y ressortent donc en charabia. C'est
normal. Les libellés affichés dans Options+, eux, gardent leurs accents et
doivent les garder : la recherche d'actions y est sensible.

---

## Construire depuis les sources

```
npm install
npm run build:pack
```

Ça produit `dist/` et `DialAccel.lplug4`. L'installation suit les étapes 1 et 2
ci-dessus.

`npm run link` existe aussi, mais ne fait qu'un lien symbolique de `dist/` vers
le dossier des plugins. Pratique en développement, à proscrire en vrai usage :
supprimer le dossier source casserait le plugin.

Reconstruire pendant que le plugin tourne fonctionne — `clean` épargne
volontairement `dist/node_modules`, parce que le plugin garde le binaire natif de
koffi ouvert et que le supprimer ferait échouer chaque build.

---

## Comment ça marche

La console n'envoie pas un cran à la fois. Son micrologiciel les regroupe déjà
selon la vitesse de rotation : mesuré sur l'appareil, la roulette envoie un
`tick` de 2 à 7, et le grand cadran de 7 à 80. Une valeur fixe, `ticksPerSlice`,
convertit ce `tick` en coupes — et non plus un calibrage sur le plus petit `tick`
reçu, qui confondait les deux contrôles et changeait la sensibilité en pleine
rotation. Le plugin ajoute ensuite sa propre accélération, au-delà d'un seuil :

```
coupes = crans × (1 + gain × ln(1 + (crans − seuil) / knee))
```

En dessous du seuil le multiplicateur vaut exactement 1 : un cran, une coupe,
toujours. Au-delà, la montée est logarithmique et non exponentielle.

Les coupes ne partent pas toutes d'un bloc. Un événement arrive toutes les 32 ms
environ, parfois deux à 5 ms d'intervalle : envoyer les vingt coupes d'un seul
`SendInput` faisait une marche d'escalier, vingt coupes sur une image et rien sur
les deux suivantes. La première coupe part donc immédiatement, et les suivantes
sont réparties par une minuterie sur l'intervalle observé entre événements —
Windows arrondit `setTimeout` à 15.6 ms, soit une image à 60 Hz, la granularité
la plus fine qu'OHIF puisse afficher de toute façon. Le débit lui-même est lissé,
pour que la vitesse monte en pente douce plutôt qu'en marches.

Le reliquat fractionnaire est reporté d'un événement au suivant, puis abandonné à
la fin du geste ou sur un demi-tour : un cran isolé vaut toujours exactement une
coupe, et revenir en arrière arrête net le défilement en cours.

Les frappes partent par `SendInput` (Win32), appelé directement depuis Node via
[koffi](https://koffi.dev/) — aucun processus fils, aucun script.

---

## Limites

Le SDK Node de Logitech est en version 0.1.1, en bêta. Il n'offre ni panneau de
réglages, ni action sur la bande tactile, ni filtrage par application depuis le
plugin. Le gros cadran central affiche toujours son incrustation. Rien de tout
cela ne se contourne côté plugin.
