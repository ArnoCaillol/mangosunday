# Mango Sunday — site officiel

Site vitrine monopage. HTML, CSS et JavaScript écrits à la main, **sans framework,
sans bundler et sans étape de compilation**. Ce qui est dans `public/` est exactement
ce qui est servi.

---

## Pour le groupe — modifier le site

Tout se passe sur **https://mangosunday.com/admin/**, depuis un ordinateur ou un
téléphone. Connexion avec votre compte GitHub.

Six choses sont modifiables, et rien d'autre :

| Ce que vous modifiez | Où ça apparaît |
|---|---|
| Bandeau « à la une » | Tout en haut, sous le nom du groupe |
| Morceau mis en avant | Le gros bouton d'écoute |
| Liens des plateformes | Section « Écouter ailleurs » et bas de page |
| Vidéo live | La section sur fond noir |
| Bio courte | Section « Le groupe » |
| Dates et galerie photo | Leurs sections respectives |

**Vos modifications sont en ligne en une minute environ.** Si rien ne change,
attendre deux minutes et recharger la page.

### Trois choses à savoir

1. **Inutile de supprimer une date passée.** Elle disparaît toute seule du site le
   lendemain. À partir de deux dates à venir, la section remonte automatiquement en
   haut de la page.
2. **Laisser un champ vide fait disparaître le bloc correspondant**, proprement. Un
   site sans galerie vaut mieux qu'une galerie vide.
3. **Redimensionner les photos avant de les envoyer.** Une photo prise au téléphone
   pèse 3 à 5 Mo et ralentit le site pour tout le monde. La limite est fixée à 1,5 Mo.

### Ce que vous ne pouvez pas casser

La mise en page, les couleurs, les mentions légales et le référencement ne sont pas
modifiables depuis l'administration. C'est voulu.

---

## Pour le développeur

### Aperçu local

`fetch()` est bloqué sur `file://` : ouvrir `index.html` directement affiche la page
en état statique, sans dates ni liens. Il faut un serveur.

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Puis <http://localhost:8080>. Node n'étant pas requis, le serveur s'appuie sur
`HttpListener`, inclus dans .NET.

### Architecture

- **Le texte à valeur SEO est écrit en dur** dans `index.html` : titre, méta-description,
  Open Graph, `h1`, baseline et **bio longue**. Il est servi dès la première requête.
- **Seuls les blocs volatils sont hydratés** côté client depuis `public/content/*.json`
  par `js/content.js`, qui injecte aussi le balisage `MusicEvent`.
- **Aucune requête vers un tiers avant un clic.** Les lecteurs Spotify et YouTube sont
  remplacés par des vignettes en CSS ; l'iframe n'est injectée qu'au clic. C'est ce qui
  permet au site de n'avoir aucun bandeau cookies. La CSP dans `public/_headers` rend
  la règle structurelle.
- **Polices auto-hébergées.** Aucun appel à un CDN de polices : un appel dynamique
  transmettrait l'IP du visiteur à un tiers.

### Règles de couleur, non négociables

Elles viennent de contrastes calculés, pas d'un goût :

1. Sur fond clair, le texte est **encre** `#1E1A16`. Jamais mangue ni orange : l'ocre
   sur crème ne donne que 2,1:1.
2. Sur fond nuit, la **mangue devient typographique** — 7,2:1. C'est la seule
   asymétrie de la palette, et la seule raison d'être de la bande sombre.
3. **La bordure encre de 3 px du bouton n'est pas décorative.** Un bouton mangue sur
   fond sable ne contraste qu'à 1,65:1 avec son entourage : la bordure est ce qui
   satisfait le critère WCAG 1.4.11. La retirer casse la conformité.

### Structure

```
public/          racine publiée par Cloudflare Pages
  content/       les 3 JSON écrits par le CMS
  admin/         Sveltia CMS — config.yml EST le périmètre d'édition
  assets/fonts/  4 fontes woff2, sous-ensemble latin
  _headers       CSP, HSTS, cache, noindex de /admin
workers/oauth/   relais OAuth, à coller dans le tableau de bord Cloudflare
.github/         compression des images de galerie
tools/serve.ps1  serveur local, non publié
```

### Remplacer le logo

Écraser `public/assets/img/logo.webp`. Aucune modification de code. Conserver un
format carré. Le fichier actuel est le logo définitif du groupe, à fond beige opaque :
il se pose sur le crème de la page en tuile arrondie, comme une vignette imprimée.

Si un jour une version détourée à fond transparent est disponible, la déposer sous le
même nom donnera un rendu plus net sur le crème — sans changement de code non plus.

---

## Mise en service — ce qui reste à faire

Dans cet ordre.

1. **Acheter `mangosunday.com`** après avoir vérifié sa disponibilité, ainsi que celle
   du nom sur Spotify, Bandcamp et Instagram.
2. ~~**Créer le dépôt GitHub**~~ — fait : <https://github.com/ArnoCaillol/mangosunday>
3. **Cloudflare Pages** : connecter le dépôt.
   - Commande de build : **laisser vide**
   - Répertoire de sortie : **`public`** — si ce réglage reste à la racine,
     `_headers` et `_redirects` sont ignorés sans le moindre message d’erreur,
     et vous perdez la CSP, le HSTS et le `noindex` de `/admin/`.
   - Brancher le domaine, HTTPS automatique.
   - **En attendant le domaine**, le site tourne sur `*.pages.dev` et
     `_headers` porte un `X-Robots-Tag: noindex` global. **Retirer cette ligne**
     du bloc `/*` le jour du branchement, sinon le site reste invisible des
     moteurs de recherche.
4. **Application OAuth GitHub** (Settings → Developer settings → OAuth Apps) :
   - URL de rappel : `https://<worker>.workers.dev/callback`
5. **Déployer le Worker** : coller `workers/oauth/index.js` dans un nouveau Worker via
   le tableau de bord, puis définir en **Secret** `GITHUB_CLIENT_ID`,
   `GITHUB_CLIENT_SECRET` et `ORIGINE_ADMIN` (`https://mangosunday.com`).
   *wrangler n'est pas utilisable ici, Node n'étant pas installé sur le poste.*
6. **Renseigner `base_url`** dans `public/admin/config.yml` avec l’URL du Worker.
   `repo` est déjà renseigné. C’est la **dernière valeur `REMPLACER`** du projet, et
   le seul verrou restant avant que `/admin/` puisse s’authentifier.
7. **Cloudflare Email Routing** : `contact@mangosunday.com` vers une boîte existante.
   Gratuit. Attention : cela **reçoit** mais n'envoie pas — répondre depuis l'adresse
   du domaine demande une configuration séparée.
8. **Comptes GitHub des éditeurs**, avec accès en écriture au dépôt.

---

## Checklist de mise en ligne

Aucun placeholder ne doit survivre. Ils sont tous visibles à l'écran, entre crochets
et sur fond tireté.

- [ ] `[VILLE]` — baseline du premier écran, **et** `<title>` + méta-description
- [ ] `[BIO COURTE]` — via l'administration
- [ ] `[BIO LONGUE]` — dans `index.html`, section « Le groupe »
- [ ] `[PRÉNOM]` et `[instrument]` × 4 — dans `index.html`
- [ ] `[TITRE DU MORCEAU]` et son lien — via l'administration
- [ ] `[VIDÉO LIVE À VENIR]` — via l'administration
- [ ] Liens des plateformes et réseaux — via l'administration
- [x] `logo.webp` — logo définitif en place
- [x] `og.png` — régénéré avec le vrai logo
- [ ] Version détourée du logo (fond transparent) — souhaitable, pas bloquant
- [ ] Mentions légales : éditeur, statut, adresse, directeur de la publication
- [ ] Vérifier le JSON-LD avec l'outil de test des résultats enrichis de Google
- [ ] Contrôler l'aperçu de partage sur messagerie et réseaux

## Dette connue

- L'action de compression des images **introduit une étape de compilation**, ce que le
  cahier des charges excluait. Décision assumée pour absorber le risque des photos
  téléversées depuis un téléphone. Conséquence : une publication déclenche un second
  déploiement. **Non testée localement**, Node n'étant pas installé — à valider au
  premier téléversement réel.
- Les polices sont en sous-ensemble latin. Un sous-ensemble français les ramènerait de
  16 Ko à environ 10 Ko chacune.
- `og.png` pèse 358 Ko. Sans impact sur le premier rendu — seuls les robots d'aperçu
  la téléchargent — mais au-dessus du seuil au-delà duquel certaines messageries
  cessent de générer l'aperçu automatiquement. Un JPEG la ramènerait vers 80 Ko ;
  Chrome headless n'exporte qu'en PNG et aucun convertisseur n'est disponible ici.
- Le logo est à fond beige opaque, posé en tuile arrondie sur le crème. Une version
  détourée à fond transparent donnerait un rendu plus net.
