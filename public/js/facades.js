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

export function etiquette(cle){
  return ({
    spotify:"Spotify", bandcamp:"Bandcamp", youtube:"YouTube",
    instagram:"Instagram", deezer:"Deezer", apple:"Apple Music",
    // Reseaux par membre. Sans ces deux cles, le libelle retomberait
    // sur la cle brute en minuscules : piege deja documente.
    tiktok:"TikTok", site:"Site"
  })[cle] || cle;
}
