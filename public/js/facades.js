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

/* ── Façade vidéo ─────────────────────────────────────────────
   youtube-nocookie et non youtube : meme apres le clic, le domaine
   sans cookie reduit le pistage. Le clic vaut consentement, ce n'est
   pas une raison d'en abuser. */
export function monterFacadeVideo({conteneur, bouton, id, titre, vide}){
  if(!id){ bouton.disabled = true; return; }

  if(vide) vide.hidden = true;
  bouton.disabled = false;
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
    instagram:"Instagram", deezer:"Deezer", apple:"Apple Music"
  })[cle] || cle;
}
