# DialAccel

*[English version](README.md)*

Défilement accéléré pour la **Logitech MX Creative Console**, sous Windows.

Tu tournes une molette, le plugin envoie des flèches haut/bas. Plus tu tournes
vite, plus il en envoie — une coupe par cran quand tu vas doucement, une rafale
quand tu balayes. Conçu pour faire défiler les coupes dans une visionneuse DICOM
comme OHIF, mais ça marche avec tout ce qui se pilote aux flèches.

Équivalent Logitech du plugin Stream Deck
[yokoinc/elgato-dial-scroll](https://github.com/yokoinc/elgato-dial-scroll).

---

## Pourquoi

Lire un scanner, c'est parcourir des centaines de coupes, puis revenir sur trois
d'entre elles pour les comparer. Ces deux gestes n'ont pas les mêmes exigences :
traverser la série demande de la vitesse, comparer demande d'atteindre la coupe
voulue et pas sa voisine. À la molette de souris, dans OHIF, un cran vaut une
coupe : la précision est parfaite, et traverser une série de 400 coupes devient un
exercice d'endurance.

Options+ sait assigner une touche à une molette, mais rien de plus : un cran, une
frappe. Le curseur « Vitesse de la molette » multiplie tout uniformément, donc
gagner en vitesse de balayage coûte exactement autant en précision.

D'où ce plugin. Il fait trois choses que le réglage d'Options+ ne sait pas faire :

- **Une courbe au lieu d'un facteur.** Un geste lent reste au coup par coup, un
  geste rapide accélère en logarithme — jamais en exponentielle, qui s'emballe.
- **Un profil par contrôle.** La petite molette garde la précision, coupe par
  coupe, et accélère seulement si on la lance. Le grand cadran sert au
  déplacement rapide. Deux outils distincts, sur le même appareil.
- **Un défilement lissé.** Les coupes sont réparties dans le temps au lieu de
  partir en rafale, ce qui donne un glissé continu plutôt qu'une suite de sauts.

Tous les réglages livrés viennent de relevés faits sur l'appareil, pas d'une
intuition : le plugin sait journaliser chaque événement reçu et chaque coupe
envoyée, et ces relevés se rejouent hors du plugin pour mesurer l'effet d'un
changement avant de le déployer.

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

### 2. Recharger le plugin

Le Plugin Service ne relit jamais un plugin à chaud. Le rechargement officiel
passe par un lien `loupedeck://`, traité par l'outil du service :

```
& "C:\Program Files\Logi\LogiPluginService\LogiPluginServiceTool.exe" "loupedeck://plugin/DialAccel/reload"
```

C'est réussi quand le journal écrit `Starting remote plugin: DialAccel`. Rien à
quitter, ni Options+ ni la console.

Après **ajout ou renommage d'une action**, il faut en plus monter le numéro de
version dans `LoupedeckPackage.yaml` : sans cela Options+ garde en mémoire son
ancienne liste d'actions et la nouvelle n'apparaît nulle part.

### 3. Assigner les actions dans Options+

Ouvre l'écran de personnalisation du périphérique. Deux actions apparaissent sous
**Actions Dial Accel** :

| Action | À assigner à | Ce qu'elle fait |
|---|---|---|
| **Défilement OHIF — petite molette** | la roulette, en haut à droite | La précision : une coupe par cran, qui accélère si tu la lances. |
| **Défilement OHIF — grand cadran** | le cadran central | Le déplacement : traverser la série. |

Deux choses qui font perdre du temps ici :

- **Assigne-les dans le bon profil.** Les onglets en haut de l'écran sont des
  profils par application, et la console suit l'application au premier plan. Une
  action assignée dans le profil par défaut ne s'exécutera pas dans ton
  navigateur. Choisis l'onglet de l'application que tu utilises vraiment.
- **Le gros cadran central impose une incrustation à l'écran** quoi que tu poses
  dessus. La roulette, non. Si cette incrustation te gêne, assigne les deux
  actions à la roulette dans deux profils différents plutôt qu'au cadran.

---

## Réglage

Tout est en haut de [`src/scroll-model.ts`](src/scroll-model.ts), dans `Profiles`.
Chaque contrôle a le sien, parce qu'ils n'ont ni la même échelle ni le même usage.
Mesuré sur l'appareil, curseur « Vitesse de la molette » d'Options+ à 50 % : la
petite molette envoie un `tick` de 2 à 7, le grand cadran de 7 à 80.

### Grand cadran — profil `dial`

Il accélère déjà de lui-même, ses `tick` grossissant avec la vitesse. Notre courbe
ne fait qu'ajouter une pointe, d'où un `gain` volontairement faible :

| gain | 1 à 8 crans donnent | ressenti |
|------|---------------------|----------|
| 0    | 1, 2, 3, 4, 5, 6, 7, 8 | on s'en remet à l'appareil |
| 0.3  | 1, 2, 3, 4, 5, 6, 8, 9 | le réglage livré |
| 0.6  | 1, 2, 3, 4, 5, 7, 9, 11 | vif |
| 0.9  | 1, 2, 3, 4, 5, 7, 10, 12 | nerveux |

`lowSpeedBoost` relève le bas de la courbe sans toucher au haut. Tourner le cadran
lentement n'envoie pas des `tick` plus petits — ils restent à 7 — mais des
événements plus espacés, jusqu'à 190 ms : un geste lent tombait à 22 coupes par
seconde quand un geste rapide en donne 260. À 0.8, avec `lowSpeedRef: 150`, les
gestes lents gagnent 60 à 75 %, les gestes rapides moins de 10 %.

### Petite molette — profil `roller`

Ses `tick` restent petits même en roulant vite : sa vitesse se lit dans la cadence
des événements, pas dans leur taille. Son accélération suit donc la vitesse de
rotation mesurée, en coupes par seconde, et non la taille du `tick` :

| vitesse | multiplicateur |
|---|---|
| jusqu'à 30 coupes/s | 1 — un cran, une coupe |
| 60 coupes/s | 1.7 |
| 100 coupes/s | 2.2 |

Un cran isolé n'est jamais accéléré : après une pause, la vitesse mesurée repart
de zéro.

### Communs

| réglage | rôle |
|---|---|
| `ticksPerSlice` | valeur de `tick` qui vaut une coupe. 2 = la petite molette avance d'une coupe par cran. |
| `rateSmoothing` | inertie du débit, entre 0 et 1. 1 = le débit saute à chaque événement ; 0.35 = montée en pente douce. |
| `debugLog` | journalise chaque événement reçu et chaque coupe envoyée. |

Le SDK Logi 0.1.1 n'expose aucun panneau de configuration : changer ces chiffres
impose de reconstruire (voir plus bas).

### Régler sur des mesures plutôt qu'au ressenti

`debugLog: true`, puis reconstruire, recharger, et se servir des molettes une
trentaine de secondes. Le journal contient alors le `tick` de chaque événement,
la vitesse mesurée et les coupes envoyées. **Copie-le aussitôt** : il est vidé à
chaque redémarrage du service.

Ce relevé se rejoue ensuite hors du plugin, directement à travers les sources,
sans toucher à la console :

```
node --experimental-strip-types mon-banc-d-essai.mts releve.log
```

`src/scroll-model.ts` ne dépend ni du SDK ni de Windows, précisément pour ça. On
peut ainsi mesurer, avant de déployer, ce qu'un réglage change sur un geste réel :
coupes par seconde, coupes maximum sur une image, régularité du défilement.

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
| **Rien du tout** quand tu tournes la molette | Soit l'action est assignée dans un profil qui n'est pas l'actif (voir l'étape 3), soit le plugin est sourd — voir juste en dessous. |

### Le plugin démarre, se connecte, et ne reçoit rien

Symptôme déroutant : le journal affiche `[…] demarrage du plugin`,
`user32 charge via koffi` et `Init connection confirmed by server`, tout a l'air
parfait, et pourtant aucun événement n'arrive quand tu tournes la molette.

C'est ce qui se passe quand on relance le plugin **en tuant son process
`node.exe`**. Le service en relance bien un, qui se connecte, mais le service
continue d'envoyer les événements à l'ancienne connexion. Le signe qui ne trompe
pas : la ligne `Starting remote plugin: DialAccel`, écrite par le service
lui-même, est absente du redémarrage.

Le remède est le rechargement de l'étape 2. Ne tue jamais le process du plugin.

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

Pas besoin d'installer Node : le Plugin Service embarque le sien, avec npm, dans
`%LOCALAPPDATA%\Logi\LogiPluginService\PluginHosts\node22\node`.

`npm run link` existe aussi, mais ne fait qu'un lien symbolique de `dist/` vers
le dossier des plugins. Pratique en développement, à proscrire en vrai usage :
supprimer le dossier source casserait le plugin.

Reconstruire pendant que le plugin tourne fonctionne — `clean` épargne
volontairement `dist/node_modules`, parce que le plugin garde le binaire natif de
koffi ouvert et que le supprimer ferait échouer chaque build.

---

## Comment ça marche

La console n'envoie pas un cran à la fois. Son micrologiciel les regroupe déjà
selon la vitesse de rotation, et chaque contrôle a sa propre échelle : la petite
molette envoie un `tick` de 2 à 7, le grand cadran de 7 à 80. Une valeur fixe par
profil, `ticksPerSlice`, convertit ce `tick` en coupes — et non un calibrage sur le
plus petit `tick` reçu, qui confondait les deux contrôles et faisait sauter la
sensibilité en pleine session.

Le plugin ajoute ensuite son accélération, selon le profil : sur la taille du
`tick` au-delà d'un seuil pour le cadran,

```
coupes = crans × (1 + gain × ln(1 + (crans − seuil) / knee))
```

et sur la vitesse de rotation mesurée pour la petite molette. Sous le seuil, le
multiplicateur vaut exactement 1 : un cran, une coupe, toujours. Au-delà, la
montée est logarithmique et non exponentielle. Un troisième terme, `lowSpeedBoost`,
fait l'inverse d'une accélération : il relève les gestes lents et s'efface dès que
le geste devient rapide.

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

Le plugin ne sait pas non plus quel contrôle a envoyé un événement : c'est
l'assignation de deux actions distinctes dans Options+ qui tient lieu de
distinction entre la petite molette et le grand cadran.
