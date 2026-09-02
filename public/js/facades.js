/* ═══════════════════════════════════════════════════════════════
   facades.js — clic-pour-charger

   Aucune requete vers un tiers avant un clic explicite de
   l'utilisateur. La vignette est construite en CSS ; l'iframe n'est
   injectee qu'au clic, ce clic valant consentement pour cette lecture.
   C'est ce qui permet au site de n'avoir aucun bandeau cookies.
   ═══════════════════════════════════════════════════════════════ */

/** Ne laisse passer que http(s) : le contenu vient d'un fichier edite
 *  a la main, donc on ne fait pas confiance au schema de l'URL. */
export function urlSure(valeur){
  if(typeof valeur !== "string" || valeur.trim() === "") return null;
  let u;
  try{ u = new URL(valeur.trim()); }
  catch{ return null; }
  return (u.protocol === "https:" || u.protocol === "http:") ? u : null;
}

/** Traduit une URL Spotify publique en URL d'integration.
 *  https://open.spotify.com/track/ID  →  /embed/track/ID
 *  Renvoie null si ce n'est pas une URL Spotify integrable. */
function integrationSpotify(u){
  if(u.hostname !== "open.spotify.com") return null;
  const m = u.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist|episode)\/([A-Za-z0-9]+)/);
  if(!m) return null;
  return `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0`;
}

/** Extrait l'identifiant YouTube d'une URL ou l'accepte tel quel. */
export function idYoutube(valeur){
  if(typeof valeur !== "string") return null;
  const brut = valeur.trim();
  if(brut === "") return null;
  if(/^[A-Za-z0-9_-]{11}$/.test(brut)) return brut;
  const u = urlSure(brut);
  if(!u) return null;
  if(u.hostname === "youtu.be"){
    const id = u.pathname.slice(1);
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }
  if(/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)){
    const v = u.searchParams.get("v");
    if(v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const m = u.pathname.match(/^\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
    if(m) return m[1];
  }
  return null;
}

function iframe(src, titre, hauteur){
  const f = document.createElement("iframe");
  f.src = src;
  f.title = titre;
  f.loading = "lazy";
  f.allow = "autoplay; clipboard-write; encrypted-media; picture-in-picture";
  f.setAttribute("allowfullscreen", "");
  f.referrerPolicy = "strict-origin-when-cross-origin";
  if(hauteur) f.height = String(hauteur);
  return f;
}

/* ── Façade audio ─────────────────────────────────────────────
   Spotify est integrable : on remplace le bouton par le lecteur.
   Les autres plateformes ne le sont pas de facon fiable a partir
   d'une URL publique : le bouton devient alors un lien sortant,
   ce qui reste honnete et ne charge toujours aucun tiers d'avance. */
export function monterFacadeAudio({conteneur, bouton, url, titre, plateforme}){
  const u = urlSure(url);
  if(!u){ bouton.disabled = true; return; }

  const nom = titre && !titre.startsWith("[") ? titre : "le morceau";
  const src = plateforme === "spotify" ? integrationSpotify(u) : null;

  if(!src){
    // Lien sortant : on transforme le bouton en <a> equivalent.
    const a = document.createElement("a");
    a.className = bouton.className;
    a.href = u.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", `Écouter ${nom} sur ${etiquette(plateforme)} — ouvre un nouvel onglet`);
    const tri = document.createElement("span");
    tri.className = "tri";
    tri.setAttribute("aria-hidden", "true");
    const txt = document.createElement("span");
    txt.textContent = `Écouter ${nom}`;
    a.append(tri, txt);
    bouton.replaceWith(a);
    return;
  }

  bouton.disabled = false;
  bouton.setAttribute("aria-label",
    `Écouter ${nom} sur Spotify — charge le lecteur Spotify`);
  const libelle = bouton.querySelector("[data-titre-phare]");
  if(libelle){ libelle.textContent = nom; libelle.classList.remove("ph"); }

  bouton.addEventListener("click", () => {
    const f = iframe(src, `Lecteur Spotify — ${nom}`, 152);
    conteneur.replaceChildren(f);
    f.focus?.();
  }, {once:true});
}

/** <picture> avec derives modernes et repli sur le fichier d'origine.
 *
 *  PIEGE, verifie : un <source> retenu qui repond 404 ne retombe PAS
 *  sur l'<img>. La selection se fait sur le type MIME, pas sur
 *  l'existence du fichier, et l'echec est alors definitif — l'image
 *  s'affiche cassee. Or les derives .avif/.webp sont produits par la CI
 *  APRES le commit de l'editeur : sans la reprise ci-dessous, toute
 *  photo fraichement publiee reste cassee jusqu'au passage du robot,
 *  et une image que la CI ne traite pas le reste pour toujours.
 *
 *  On retire donc les <source> au premier echec et on retente le
 *  fichier d'origine, le seul dont l'existence soit garantie.
 *
 *  @param {string} chemin   chemin absolu du fichier d'origine
 *  @param {object} rappels  {surCharge, surPerte}
 *  @returns {{pic: HTMLPictureElement, img: HTMLImageElement}}
 */
export function pictureAvecDerives(chemin, {surCharge, surPerte} = {}){
  const base = chemin.replace(/\.[a-zA-Z0-9]+$/, "");
  const pic  = document.createElement("picture");

  for(const [type, ext] of [["image/avif",".avif"], ["image/webp",".webp"]]){
    if(chemin.endsWith(ext)) continue;   // le fichier EST deja ce format
    const s = document.createElement("source");
    s.type = type;
    s.srcset = base + ext;
    pic.append(s);
  }

  const img = document.createElement("img");
  if(surCharge) img.addEventListener("load", surCharge, {once:true});

  // PAS de {once:true} : l'ecouteur doit pouvoir se declencher deux
  // fois, une par etage de repli. Il s'arrete de lui-meme, faute de
  // sources a retirer au second passage.
  img.addEventListener("error", () => {
    const sources = pic.querySelectorAll("source");
    if(sources.length){
      sources.forEach(s => s.remove());
      img.src = chemin;
      return;
    }
    surPerte?.();
  });

  img.src = chemin;
  pic.append(img);
  return {pic, img};
}

/* ── Vignette auto-hebergee ───────────────────────────────────
   Le fichier est depose par .github/workflows/vignette-video.yml, qui
   le telecharge chez YouTube COTE SERVEUR. Le pointer directement sur
   i.ytimg.com transmettrait l'IP du visiteur a Google avant tout clic
   et couterait au site son absence de bandeau cookies.

   Le nom porte l'identifiant de la video : /assets/img/* est en cache
   sept jours, un nom fixe reecrit servirait l'ancienne image pendant
   une semaine. Le chemin est reconstruit ici et ecrit la-bas, sans
   manifeste de part et d'autre — meme convention que la galerie.

   Tant que la CI n'est pas passee, les trois fichiers sont absents :
   l'erreur de chargement retire l'element et le decor abstrait reste
   en place. C'est aussi ce qui se passe si la video n'a pas de
   vignette exploitable. */
function poserVignette(conteneur, id){
  const facade = conteneur?.querySelector(".facade");
  if(!facade) return;

  const {pic, img} = pictureAvecDerives(`/assets/img/video/vignette-${id}.jpg`, {
    surCharge: () => facade.classList.add("a-vignette"),
    surPerte:  () => pic.remove()      // rien a montrer : decor abstrait
  });
  img.className = "facade-vignette";
  img.alt = "";                        // decoratif : le bouton porte le libelle
  img.loading = "lazy";
  img.decoding = "async";
  img.width = 1280;
  img.height = 720;
  facade.prepend(pic);
}

/* ── Façade vidéo ─────────────────────────────────────────────
   youtube-nocookie et non youtube : meme apres le clic, le domaine
   sans cookie reduit le pistage. Le clic vaut consentement, ce n'est
   pas une raison d'en abuser. */
export function monterFacadeVideo({conteneur, bouton, id, titre, vide}){
  if(!id){ bouton.disabled = true; return; }

  if(vide) vide.hidden = true;
  bouton.disabled = false;
  poserVignette(conteneur, id);
  const nom = titre && !titre.startsWith("[") ? titre : "la vidéo live";
  bouton.setAttribute("aria-label",
    `Regarder ${nom} — charge le lecteur YouTube`);

  bouton.addEventListener("click", () => {
    const src = `https://www.youtube-nocookie.com/embed/${id}` +
                `?autoplay=1&rel=0&modestbranding=1`;
    const f = iframe(src, `Lecteur YouTube — ${nom}`);
    conteneur.replaceChildren(f);
    f.focus?.();
  }, {once:true});
}

/* ── Icones des plateformes ───────────────────────────────────
   Dessinees a la main, au trait, dans un viewBox 24x24. Aucune
   dependance : la CSP est « img-src 'self' data: » et le site ne
   declenche aucune requete tierce, donc ni CDN d'icones ni police
   d'icones ne sont possibles. Un sprite SVG externe ne conviendrait
   pas non plus : le contenu d'un <use> externe n'herite pas du
   currentColor du document.

   Le trait de 2px est celui des bordures du site : les icones parlent
   le meme langage que les boutons et les pastilles.

   Construites avec createElementNS et setAttribute — innerHTML n'est
   jamais utilise ici, meme pour du balisage que nous ecrivons.

   « plein » remplit la forme au lieu de la tracer. Les parametres
   visuels (epaisseur, jointures) vivent dans site.css. */
const SVG_NS = "http://www.w3.org/2000/svg";

const ICONES = {
  // Cercle et trois ondes.
  spotify: [
    ["circle", {cx:12, cy:12, r:9}],
    ["path", {d:"M6.4 8.7c4.2-1.4 8.8-.7 12.1 1.6"}],
    ["path", {d:"M7 12c3.4-1.1 7.2-.6 10.1 1.2"}],
    ["path", {d:"M7.8 15.2c2.6-.9 5.5-.6 7.8.8"}]
  ],
  // Le logo EST un parallelogramme.
  bandcamp: [
    ["path", {d:"M3.6 16.6 10.4 7.4H20.4l-6.8 9.2z", plein:true}]
  ],
  // Ecran arrondi et triangle de lecture.
  youtube: [
    ["rect", {x:2.5, y:5.5, width:19, height:13, rx:4}],
    ["path", {d:"M10.8 9.4 16 12l-5.2 2.6z", plein:true}]
  ],
  // Carre arrondi, objectif, temoin.
  instagram: [
    ["rect", {x:3.2, y:3.2, width:17.6, height:17.6, rx:5}],
    ["circle", {cx:12, cy:12, r:4}],
    ["circle", {cx:17, cy:7, r:1.15, plein:true}]
  ],
  // Egaliseur a cinq colonnes. APPROXIMATION assumee : la marque
  // Deezer est faite de barres, mais leur disposition exacte n'est
  // pas reproduite ici. L'icone se lit comme une plateforme musicale,
  // ce qui suffit a son role.
  deezer: [
    ["rect", {x:2.6, y:13.6, width:3.2, height:5.8, rx:1, plein:true}],
    ["rect", {x:7.0, y:9.4, width:3.2, height:10, rx:1, plein:true}],
    ["rect", {x:11.4, y:4.6, width:3.2, height:14.8, rx:1, plein:true}],
    ["rect", {x:15.8, y:11.2, width:3.2, height:8.2, rx:1, plein:true}],
    ["rect", {x:20.2, y:7.6, width:3.2, height:11.8, rx:1, plein:true}]
  ],
  // Badge d'application et note : le vocabulaire d'Apple Music.
  apple: [
    ["rect", {x:3.2, y:3.2, width:17.6, height:17.6, rx:5}],
    ["circle", {cx:10, cy:15.4, r:2.1, plein:true}],
    ["path", {d:"M12.1 15.4V9.2l4.4-1.3v2.3l-4.4 1.3"}]
  ],
  // Croche a hampe et drapeau, glyphe de TikTok.
  tiktok: [
    ["circle", {cx:10.2, cy:16.2, r:3.3}],
    ["path", {d:"M13.5 16.2V4.4c.6 2.4 2.4 3.9 4.8 4.1"}]
  ],
  // Globe generique pour « Site perso ».
  site: [
    ["circle", {cx:12, cy:12, r:9}],
    ["path", {d:"M3 12h18"}],
    ["path", {d:"M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z"}]
  ]
};

/** Renvoie l'icone d'une plateforme, ou null si elle n'en a pas.
 *  Le null est utile : l'appelant retombe alors sur le libelle en
 *  clair, ce qui evite qu'une plateforme ajoutee plus tard n'affiche
 *  un lien muet. */
export function iconePlateforme(cle){
  const formes = ICONES[cle];
  if(!formes) return null;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");   // le lien porte l'aria-label
  svg.setAttribute("focusable", "false");    // sinon tabulable sous IE/Edge

  for(const [balise, attrs] of formes){
    const forme = document.createElementNS(SVG_NS, balise);
    for(const [nom, valeur] of Object.entries(attrs)){
      if(nom === "plein") continue;
      forme.setAttribute(nom, String(valeur));
    }
    if(attrs.plein){
      forme.setAttribute("fill", "currentColor");
      forme.setAttribute("stroke", "none");
    }
    svg.append(forme);
  }
  return svg;
}

export function etiquette(cle){
  return ({
    spotify:"Spotify", bandcamp:"Bandcamp", youtube:"YouTube",
    instagram:"Instagram", deezer:"Deezer", apple:"Apple Music",
    // Reseaux par membre. Sans ces deux cles, le libelle retomberait
    // sur la cle brute en minuscules : piege deja documente.
    tiktok:"TikTok", site:"Site"
  })[cle] || cle;
}
