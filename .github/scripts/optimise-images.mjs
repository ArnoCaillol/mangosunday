/* ═══════════════════════════════════════════════════════════════
   Compression des images de galerie — execute UNIQUEMENT en CI.

   Idempotent : relance sans effet si tout est deja optimise. C'est
   ce qui, avec le garde-fou sur l'auteur du commit, empeche la
   boucle de declenchements.

   Trois operations :
     1. redimensionnement a 1600 px de large au maximum, en place ;
     2. recompression du fichier d'origine ;
     3. generation des derives .avif et .webp a cote.

   Le nom de fichier ne change jamais : galerie.json reste valable
   et content.js construit les <source> a partir du nom de base.
   ═══════════════════════════════════════════════════════════════ */

import { readdir, stat, rename, unlink } from "node:fs/promises";
import { join, extname, basename, dirname } from "node:path";
import sharp from "sharp";

const DOSSIER   = "public/assets/img/galerie";
const LARGEUR   = 1600;
const SOURCES   = new Set([".jpg", ".jpeg", ".png"]);

/** Le derive est-il a refaire ? Absent, ou plus vieux que sa source. */
async function aRefaire(source, derive){
  try{
    const [s, d] = await Promise.all([stat(source), stat(derive)]);
    return d.mtimeMs < s.mtimeMs;
  }catch{
    return true;   // le derive n'existe pas
  }
}

async function traiter(chemin){
  const ext  = extname(chemin).toLowerCase();
  const base = join(dirname(chemin), basename(chemin, extname(chemin)));

  const meta = await sharp(chemin).metadata();
  const trop = (meta.width || 0) > LARGEUR;

  // ── 1 et 2 : redimensionnement + recompression en place ──
  // On ecrit dans un fichier temporaire : sharp ne peut pas lire et
  // ecrire le meme fichier dans la meme operation.
  if(trop || !meta.isProgressive){
    const tmp = chemin + ".tmp";
    let p = sharp(chemin).rotate();            // respecte l'orientation EXIF
    if(trop) p = p.resize({ width: LARGEUR, withoutEnlargement: true });
    p = ext === ".png"
      ? p.png({ compressionLevel: 9, palette: true })
      : p.jpeg({ quality: 82, progressive: true, mozjpeg: true });
    await p.toFile(tmp);
    await unlink(chemin);
    await rename(tmp, chemin);
    console.log(`recompressé  ${chemin}${trop ? ` (${meta.width} → ${LARGEUR} px)` : ""}`);
  }

  // ── 3 : derives modernes ──
  for(const [ext2, options] of [
    [".avif", { quality: 55, effort: 4 }],
    [".webp", { quality: 78 }]
  ]){
    const derive = base + ext2;
    if(!(await aRefaire(chemin, derive))) continue;
    const img = sharp(chemin).resize({ width: LARGEUR, withoutEnlargement: true });
    await (ext2 === ".avif" ? img.avif(options) : img.webp(options)).toFile(derive);
    console.log(`généré       ${derive}`);
  }
}

async function principal(){
  let fichiers;
  try{
    fichiers = await readdir(DOSSIER);
  }catch{
    console.log(`Aucun dossier ${DOSSIER}, rien à faire.`);
    return;
  }

  const cibles = fichiers.filter(f => SOURCES.has(extname(f).toLowerCase()));
  if(cibles.length === 0){
    console.log("Aucune image source à traiter.");
    return;
  }

  for(const f of cibles){
    try{
      await traiter(join(DOSSIER, f));
    }catch(err){
      // Une image illisible ne doit pas faire echouer tout le lot.
      console.error(`ignorée      ${f} : ${err.message}`);
    }
  }
}

await principal();
