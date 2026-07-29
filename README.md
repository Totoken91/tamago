# 💚 TamaLove

Un petit **Tamagotchi web en Three.js**. Sa particularité : la créature ne mange
pas de nourriture classique — **elle se nourrit de l'amour qu'on lui porte**.
Une seule jauge, l'**Amour**, qui s'estompe si on l'ignore et remonte quand on
prend soin d'elle.

![aperçu](assets/room.png)

## ▶️ Lancer le jeu

Le jeu utilise des modules ES et charge des textures : il faut un petit serveur
local (ouvrir `index.html` en `file://` ne marchera pas à cause du CORS).

```bash
# au choix — depuis le dossier du projet :
npm start                 # → http://localhost:5173  (python3 -m http.server)
# ou
python3 -m http.server 5173
# ou
npx serve -l 5173 .
```

Puis ouvre **http://localhost:5173** dans un navigateur récent.

## 🎮 Comment jouer

| Action | Comment | Effet |
|---|---|---|
| **Caresser** | Clique / glisse sur la créature | Petit gain + rebond (squash) |
| **Câlin** 🤗 | Bouton (cooldown) | Gros gain d'amour |
| **Complimenter** 💬 | Bouton | Gain moyen + mot doux flottant |
| **Jouer** 🎈 | Bouton | La créature suit ton curseur quelques secondes |

La jauge d'**Amour** décroît lentement. Selon son niveau, la créature change
d'humeur (rayonnante → contente → mélancolique → en manque d'affection), ce qui
se voit sur sa teinte, son animation, ses particules et son petit texte d'humeur.
Il n'y a **pas de game over** : même triste, on peut toujours la consoler.

Ton nom de créature et son niveau d'amour sont **sauvegardés** (localStorage).
Au retour, le temps écoulé est pris en compte — *« il t'attendait »* — sans
jamais la laisser complètement vide.

## 🗂️ Structure

```
index.html            page + interface (HUD, styles, écran de chargement)
src/
  main.js             scène Three.js, post-process, boucle, interactions, UI
  creature.js         créature (shader d'humeur, idle, squash & stretch, jeu)
  hearts.js           particules de cœurs (textures générées au runtime)
  floatingText.js     mots doux flottants
  storage.js          persistance localStorage + temps écoulé
  config.js           toutes les constantes de gameplay & direction artistique
assets/
  creature.png        sprite du personnage (PNG transparent)
  room.png            décor de fond (la chambre)
tools/                (dev) génération des assets à partir de SVG
```

## 🖼️ Remplacer les images

Le jeu charge simplement `assets/creature.png` (perso, PNG **transparent**) et
`assets/room.png` (fond). Pour utiliser tes propres images, **remplace ces deux
fichiers** en gardant les mêmes noms — aucun code à modifier. Le perso est rendu
sur un plane avec `LinearFilter` (rendu net, non pixel-art) ; le fond est cadré
en *cover* automatiquement et s'adapte à la fenêtre.

Les assets fournis ont été générés à partir de SVG (`tools/svg/`). Pour les
régénérer : `npm run assets` (nécessite Playwright / Chromium).

## 🛠️ Technique

- **Three.js** (r160, via import map CDN), un seul projet web lançable localement.
- Boucle `requestAnimationFrame` avec **delta time** → animations & jauge
  indépendantes du framerate.
- Post-process léger : **bloom subtil** (plus marqué sur les états heureux) +
  **vignette** chaleureuse.
- **Parallaxe** entre le fond et le perso au mouvement de la souris.
- **Responsive** : cadrage et échelle recalculés au redimensionnement.
- Chargement des textures géré par un `LoadingManager` avec écran de chargement.
