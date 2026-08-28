/* ═══════════════════════════════════════════════════════════════
   content.js — hydratation cote client (chemin 1)

   Le texte a valeur SEO est ECRIT EN DUR dans index.html : titre,
   meta-description, Open Graph, h1, baseline, bio longue. Ce module
   ne remplit que les blocs volatils, ceux que le groupe edite :
   bandeau, liens d'ecoute, video, bio courte, galerie, dates.

   Regle de securite : le contenu vient d'un fichier edite a la main.
   On n'utilise JAMAIS innerHTML, uniquement textContent et des
   noeuds construits, et toute URL passe par urlSure().
   ═══════════════════════════════════════════════════════════════ */

import { monterFacadeAudio, monterFacadeVideo, urlSure, idYoutube, etiquette } from "./facades.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/** Un placeholder est une valeur vide ou une etiquette entre crochets. */
const estPlaceholder = (v) =>
  typeof v !== "string" || v.trim() === "" || /^\[.*\]$/.test(v.trim());

/** Remplace le contenu d'un element seulement si la valeur est reelle.
 *  Sinon on laisse le placeholder visible : c'est le garde-fou du brief. */
function poserTexte(el, valeur){
  if(!el || estPlaceholder(valeur)) return false;
  el.textContent = valeur.trim();
  el.classList.remove("ph");
  return true;
}

async function lireJSON(chemin){
  const r = await fetch(chemin, {cache:"no-cache"});
  if(!r.ok) throw new Error(`${chemin} : HTTP ${r.status}`);
  return r.json();
}

/* ── ① Bandeau « a la une » ───────────────────────────────────
   Masque par defaut et sans espace reserve : le budget du premier
   ecran est calcule dans les deux etats. */
function monterBandeau(bandeau){
  const el = $("[data-bandeau]");
  if(!el || !bandeau || bandeau.actif !== true) return;
  if(estPlaceholder(bandeau.texte)) return;

  $("[data-bandeau-texte]").textContent = bandeau.texte.trim();
  const u = urlSure(bandeau.lien);
  if(u){
    el.href = u.href;
    if(u.origin !== location.origin){ el.target = "_blank"; el.rel = "noopener noreferrer"; }
  }else{
    // Sans lien valide, le bandeau reste une annonce, pas un lien mort.
    const p = document.createElement("p");
    p.className = el.className;
    p.append(...el.childNodes);
    el.replaceWith(p);
    p.hidden = false;
    return;
  }
  el.hidden = false;
}

/* ── ② Liens d'ecoute et reseaux ─────────────────────────────── */
function lienPlateforme(cle, url){
  const u = urlSure(url);
  if(!u) return null;
  const li = document.createElement("li");
  const a  = document.createElement("a");
  a.href = u.href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = etiquette(cle);
  a.setAttribute("aria-label", `${etiquette(cle)} — ouvre un nouvel onglet`);
  li.append(a);
  return li;
}

function monterPlateformes(liens){
  const ul  = $("[data-plateformes]");
  const sec = $("[data-bloc-plateformes]");
  if(!ul || !liens) return;
  const items = Object.entries(liens)
    .map(([cle, url]) => lienPlateforme(cle, url))
    .filter(Boolean);
  if(items.length === 0) return;   // le bloc reste masque
  ul.replaceChildren(...items);
  sec.hidden = false;
}

function monterReseaux(liens){
  const ul = $("[data-reseaux]");
  if(!ul || !liens) return;
  const items = Object.entries(liens)
    .map(([cle, url]) => lienPlateforme(cle, url))
    .filter(Boolean);
  ul.replaceChildren(...items);
}

/* ── ③ Dates ──────────────────────────────────────────────────
   Les dates passees sont filtrees A L'AFFICHAGE : personne n'a a
   nettoyer la liste apres un concert, premiere cause d'abandon
   d'un agenda de groupe. */
const MOIS = ["janv.","févr.","mars","avr.","mai","juin",
              "juil.","août","sept.","oct.","nov.","déc."];

function analyserDate(d){
  if(typeof d?.date !== "string") return null;
  const m = d.date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  const heure = typeof d.heure === "string" && /^\d{2}:\d{2}$/.test(d.heure.trim())
    ? d.heure.trim() : null;
  const [hh, mm] = heure ? heure.split(":").map(Number) : [23, 59];
  const quand = new Date(+m[1], +m[2] - 1, +m[3], hh, mm);
  if(Number.isNaN(quand.getTime())) return null;
  return {...d, quand, jour:+m[3], mois:+m[2] - 1, iso:d.date.trim(), heure};
}

function ligneDate(d){
  const li = document.createElement("li");
  li.className = "date";

  const jour = document.createElement("span");
  jour.className = "jour";
  const b = document.createElement("b");
  b.textContent = String(d.jour).padStart(2, "0");
  const mo = document.createElement("span");
  mo.textContent = MOIS[d.mois];
  jour.append(b, mo);

  const infos = document.createElement("span");
  const salle = document.createElement("span");
  salle.className = "salle";
  salle.textContent = estPlaceholder(d.salle) ? "Salle à confirmer" : d.salle.trim();
  const lieu = document.createElement("span");
  lieu.className = "lieu";
  const bouts = [];
  if(!estPlaceholder(d.ville)) bouts.push(d.ville.trim());
  if(d.heure) bouts.push(d.heure.replace(":", "h"));
  lieu.textContent = bouts.join(" — ");
  infos.append(salle, lieu);

  li.append(jour, infos);

  if(d.complet === true){
    const c = document.createElement("span");
    c.className = "complet";
    c.textContent = "Complet";
    li.append(c);
  }else{
    const u = urlSure(d.url_billets);
    if(u){
      const a = document.createElement("a");
      a.className = "billets";
      a.href = u.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Billets";
      a.setAttribute("aria-label",
        `Billets pour le ${d.jour} ${MOIS[d.mois]} — ouvre un nouvel onglet`);
      li.append(a);
    }
  }
  return li;
}

function monterDates(brut){
  const ol   = $("[data-dates]");
  const vide = $("[data-dates-vide]");
  if(!ol) return [];

  const maintenant = new Date();
  const aVenir = (Array.isArray(brut) ? brut : [])
    .map(analyserDate)
    .filter(d => d && d.quand >= maintenant)
    .sort((a, b) => a.quand - b.quand);

  if(aVenir.length === 0) return [];   // l'etat vide reste affiche

  ol.replaceChildren(...aVenir.map(ligneDate));
  ol.hidden = false;
  if(vide) vide.hidden = true;

  /* Regle validee a l'etape 2 : des deux dates a venir, la section
     remonte au-dessus de « Le groupe ». Une tournee est une preuve
     de scene ; une section vide n'en est pas une. */
  if(aVenir.length >= 2){
    const section = $("#dates");
    const groupe  = $("#groupe");
    if(section && groupe) groupe.parentNode.insertBefore(section, groupe);
  }
  return aVenir;
}

/* ── ④ Galerie ────────────────────────────────────────────────
   <picture> avec les derives AVIF/WebP produits par la CI. Si la CI
   n'a pas encore tourne, les <source> echouent et le <img> d'origine
   prend le relais : degradation propre, jamais d'image manquante. */
function monterGalerie(items){
  const ul  = $("[data-galerie]");
  const env = $("[data-bloc-galerie]");
  if(!ul || !Array.isArray(items) || items.length === 0) return;

  const noeuds = items.slice(0, 8).map((it, i) => {
    if(typeof it?.fichier !== "string" || it.fichier.trim() === "") return null;
    const chemin = it.fichier.trim();
    if(!chemin.startsWith("/assets/img/") && !chemin.startsWith("assets/img/")) return null;
    const abs  = chemin.startsWith("/") ? chemin : "/" + chemin;
    const base = abs.replace(/\.[a-zA-Z0-9]+$/, "");

    const li  = document.createElement("li");
    const fig = document.createElement("figure");
    fig.style.margin = "0";
    const pic = document.createElement("picture");

    for(const [type, ext] of [["image/avif",".avif"], ["image/webp",".webp"]]){
      const s = document.createElement("source");
      s.type = type;
      s.srcset = base + ext;
      pic.append(s);
    }
    const img = document.createElement("img");
    img.src = abs;
    img.alt = estPlaceholder(it.alt) ? `Mango Sunday en concert, photo ${i + 1}` : it.alt.trim();
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 600;
    img.height = 400;
    pic.append(img);
    fig.append(pic);

    if(!estPlaceholder(it.credit)){
      const c = document.createElement("figcaption");
      c.textContent = `Photo : ${it.credit.trim()}`;
      fig.append(c);
    }
    li.append(fig);
    return li;
  }).filter(Boolean);

  if(noeuds.length === 0) return;
  ul.replaceChildren(...noeuds);
  env.hidden = false;
}

/* ── ⑤ Donnees structurees ────────────────────────────────────
   Le bloc MusicGroup est deja dans le HTML servi et valide seul.
   On l'enrichit de sameAs, puis on ajoute un MusicEvent par date.
   Google execute le JavaScript et prend en charge le JSON-LD injecte. */
function enrichirJSONLD(liens, dates){
  const socle = $("#ld-groupe");
  if(!socle) return;

  let groupe;
  try{ groupe = JSON.parse(socle.textContent); }
  catch{ return; }

  const sameAs = Object.values(liens || {})
    .map(u => urlSure(u))
    .filter(Boolean)
    .map(u => u.href);
  if(sameAs.length){
    groupe.sameAs = sameAs;
    socle.textContent = JSON.stringify(groupe, null, 2);
  }

  if(!dates.length) return;

  const evenements = dates.map(d => {
    const e = {
      "@context":"https://schema.org",
      "@type":"MusicEvent",
      "name": `Mango Sunday — ${estPlaceholder(d.salle) ? (d.ville || "concert") : d.salle.trim()}`,
      "startDate": d.heure ? `${d.iso}T${d.heure}` : d.iso,
      "eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode",
      "eventStatus": d.complet === true
        ? "https://schema.org/EventScheduled"
        : "https://schema.org/EventScheduled",
      "performer": {"@id":"https://mangosunday.com/#groupe"},
      "organizer": {"@id":"https://mangosunday.com/#groupe"},
      "location": {
        "@type":"Place",
        "name": estPlaceholder(d.salle) ? "À confirmer" : d.salle.trim(),
        "address": {
          "@type":"PostalAddress",
          "addressLocality": estPlaceholder(d.ville) ? "" : d.ville.trim(),
          "addressCountry": typeof d.pays === "string" && d.pays.trim() ? d.pays.trim() : "FR"
        }
      }
    };
    const u = urlSure(d.url_billets);
    if(u){
      e.offers = {
        "@type":"Offer",
        "url": u.href,
        "availability": d.complet === true
          ? "https://schema.org/SoldOut"
          : "https://schema.org/InStock"
      };
    }
    return e;
  });

  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify(evenements, null, 2);
  document.head.append(s);
}

/* ── ⑥ Mouvement : le trace des bandes ────────────────────────
   Seul moment orchestre de la page, et il vient du motif du logo.
   data-anim n'est pose que si JS tourne : sans JS les bandes sont
   visibles d'emblee. */
function animerBandes(){
  const bandes = $$(".bandes");
  if(!bandes.length) return;
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if(!("IntersectionObserver" in window)) return;

  bandes.forEach(b => b.setAttribute("data-anim", ""));
  const obs = new IntersectionObserver((entrees) => {
    for(const e of entrees){
      if(e.isIntersecting){ e.target.classList.add("vu"); obs.unobserve(e.target); }
    }
  }, {rootMargin:"0px 0px -12% 0px"});
  bandes.forEach(b => obs.observe(b));
}

/* ── Amorçage ─────────────────────────────────────────────────
   Toute erreur laisse la page dans son etat statique : placeholders
   visibles et etats vides. Rien ne casse, rien ne disparait. */
async function demarrer(){
  animerBandes();

  let site = {}, dates = [], galerie = [];
  try{
    [site, dates, galerie] = await Promise.all([
      lireJSON("/content/site.json"),
      lireJSON("/content/dates.json").then(data => data.dates || []).catch(() => []),
      lireJSON("/content/galerie.json").catch(() => [])
    ]);
  }catch(err){
    console.warn("Contenu indisponible, la page reste en état statique.", err);
    return;
  }

  const ecoute = site.ecoute || {};
  const liens  = ecoute.liens || {};

  monterBandeau(site.bandeau);
  poserTexte($("[data-bio-courte] .ph") || $("[data-bio-courte]"), site.bio_courte);
  monterPlateformes(liens);
  monterReseaux(liens);
  monterGalerie(galerie);
  const aVenir = monterDates(dates);
  enrichirJSONLD(liens, aVenir);

  monterFacadeAudio({
    conteneur:  $("[data-lecteur-audio]"),
    bouton:     $("[data-facade-audio]"),
    url:        ecoute.url_phare,
    titre:      ecoute.titre_phare,
    plateforme: ecoute.plateforme || "spotify"
  });

  monterFacadeVideo({
    conteneur: $("[data-lecteur-video]"),
    bouton:    $("[data-facade-video]"),
    id:        idYoutube(site.video?.id_youtube),
    titre:     site.video?.titre,
    vide:      $("[data-video-vide]")
  });
}

demarrer();
