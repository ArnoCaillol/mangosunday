/* ═══════════════════════════════════════════════════════════════
   Vignette de la video live — execute UNIQUEMENT en CI.

   POURQUOI ELLE EXISTE. Le site ne declenche AUCUNE requete tierce
   avant un clic, et c'est la seule raison pour laquelle il n'a pas de
   bandeau cookies. Afficher la vignette depuis i.ytimg.com couterait
   exactement cette propriete : l'IP du visiteur partirait chez Google
   a chaque chargement de page. On la telecharge donc ICI, une fois,
   cote serveur, et on la sert depuis notre propre origine.

   POURQUOI LE NOM PORTE L'IDENTIFIANT. _headers met /assets/img/* en
   cache sept jours. Ecraser un nom fixe servirait la vignette de
   l'ancienne video pendant une semaine aux visiteurs deja venus. Un
   identifiant different donne un fichier different, donc une URL
   different : le cache ne peut pas se tromper.

   Idempotent : si la vignette de la video courante est deja la, on ne
   telecharge rien. C'est ce qui, avec le garde-fou sur l'auteur du
   commit, empeche la boucle de declenchements.
   ═══════════════════════════════════════════════════════════════ */

import { readdir, readFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const SITE    = "public/content/site.json";
const DOSSIER = "public/assets/img/video";
const LARGEUR = 1280;

/* YouTube sert parfois une image grise 120x90 au lieu de repondre 404.
   En dessous de cette largeur, on considere la variante absente. */
const LARGEUR_MINIMALE = 640;
const VARIANTES = ["maxresdefault", "sddefault", "hqdefault"];

/* ── COPIE DE public/js/facades.js ─────────────────────────────
   idYoutube() y est la reference. Elle n'est pas importee ici : sans
   package.json le depot n'a pas de champ « type », donc Node lit un
   .js comme du CommonJS et l'import d'un module ES echouerait.

   TOUTE EVOLUTION DE idYoutube() DOIT ETRE REPERCUTEE ICI. Si les deux
   divergent, la CI ecrit un fichier sous un nom que le navigateur ne
   cherchera pas : la vignette n'apparait jamais et rien ne le signale,
   la facade abstraite reprenant simplement sa place. ── */
function urlSure(valeur){
  if(typeof valeur !== "string" || valeur.trim() === "") return null;
  let u;
  try{ u = new URL(valeur.trim()); }
  catch{ return null; }
  return (u.protocol === "https:" || u.protocol === "http:") ? u : null;
}

function idYoutube(valeur){
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

/** Descend la meilleure variante disponible, de la plus grande a la
 *  plus petite. Renvoie null si aucune n'est exploitable. */
async function telecharger(id){
  for(const variante of VARIANTES){
    const url = `https://i.ytimg.com/vi/${id}/${variante}.jpg`;
    let reponse;
    try{
      reponse = await fetch(url);
    }catch(err){
      console.error(`injoignable  ${variante} : ${err.message}`);
      continue;
    }
    if(!reponse.ok){
      console.log(`absente      ${variante} (HTTP ${reponse.status})`);
      continue;
    }
    const octets = Buffer.from(await reponse.arrayBuffer());
    const meta = await sharp(octets).metadata();
    if((meta.width || 0) < LARGEUR_MINIMALE){
      console.log(`trop petite  ${variante} (${meta.width}px)`);
      continue;
    }
    console.log(`recuperee    ${variante} (${meta.width}x${meta.height})`);
    return octets;
  }
  return null;
}

/** Retire les vignettes des videos precedentes. */
async function nettoyer(fichiers, idCourant){
  const garder = idCourant ? `vignette-${idCourant}.` : null;
  for(const f of fichiers){
    if(!f.startsWith("vignette-")) continue;
    if(garder && f.startsWith(garder)) continue;
    await unlink(join(DOSSIER, f));
    console.log(`retiree      ${f}`);
  }
}

async function principal(){
  let site;
  try{
    site = JSON.parse(await readFile(SITE, "utf8"));
  }catch(err){
    console.error(`${SITE} illisible : ${err.message}`);
    return;
  }

  const id = idYoutube(site?.video?.id_youtube);
  await mkdir(DOSSIER, { recursive: true });
  const presents = await readdir(DOSSIER);

  if(!id){
    await nettoyer(presents, null);
    console.log("Aucune video renseignee : la facade abstraite reprend sa place.");
    return;
  }

  const base   = `vignette-${id}`;
  const chemin = join(DOSSIER, `${base}.jpg`);

  // La source et ses derives sont traites separement : un .jpg depose
  // a la main sans ses derives doit pouvoir etre complete, sans quoi
  // le navigateur demanderait indefiniment un .avif et un .webp qui
  // n'arriveraient jamais.
  if(presents.includes(`${base}.jpg`)){
    console.log(`source deja presente : ${base}.jpg`);
  }else{
    const octets = await telecharger(id);
    if(!octets){
      // Surtout ne rien supprimer : mieux vaut garder la vignette
      // precedente que retomber sur la facade abstraite par accident.
      console.error(`Aucune vignette exploitable pour ${id}, on garde l'existant.`);
      return;
    }
    // Memes reglages que la compression de la galerie, pour que les
    // deux pipelines produisent des images comparables.
    await sharp(octets)
      .rotate()
      .resize({ width: LARGEUR, withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toFile(chemin);
    console.log(`ecrite       ${chemin}`);
  }

  for(const [ext, options] of [
    [".avif", { quality: 55, effort: 4 }],
    [".webp", { quality: 78 }]
  ]){
    if(presents.includes(base + ext)) continue;
    const derive = join(DOSSIER, base + ext);
    await (ext === ".avif"
      ? sharp(chemin).avif(options)
      : sharp(chemin).webp(options)).toFile(derive);
    console.log(`generee      ${derive}`);
  }

  await nettoyer(await readdir(DOSSIER), id);
}

await principal();
