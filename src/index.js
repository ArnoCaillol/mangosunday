/* ═══════════════════════════════════════════════════════════════
   Point d'entree du deploiement Mango Sunday

   Le site est servi par Static Assets ; ce script ne recoit que les
   chemins qui ne correspondent a aucun fichier de public/. Il n'y
   traite que le relais OAuth GitHub du CMS, et repasse tout le reste
   aux assets pour que le comportement du site reste inchange.

   Role du relais : le secret client OAuth ne peut pas vivre dans le
   navigateur. Ce script fait le seul aller-retour qui l'exige, puis
   renvoie le jeton a la fenetre d'administration.

   Variables a definir en « Secret » dans le tableau de bord :
     GITHUB_CLIENT_ID
     GITHUB_CLIENT_SECRET

   Deux secrets, et c'est tout. ORIGINE_ADMIN n'est plus necessaire :
   le relais partageant l'origine de l'administration, la cible du
   postMessage est location.origin, connue du navigateur lui-meme.
   La variable peut etre supprimee du tableau de bord.
   ═══════════════════════════════════════════════════════════════ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/auth":     return demarrer(env);
      case "/callback": return terminer(request, url, env);
      // Tout le reste appartient au site : on repasse la main aux
      // assets, _headers et _redirects compris.
      default:          return env.ASSETS.fetch(request);
    }
  }
};

/* ── 1. Depart : redirection vers la page d'autorisation GitHub ──
   L'etat aleatoire est depose en cookie et reverifie au retour :
   c'est la protection contre la falsification de requete. */
function demarrer(env) {
  const etat = crypto.randomUUID();
  const dest = new URL("https://github.com/login/oauth/authorize");
  dest.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  // Portee minimale. Le depot etant PUBLIC, public_repo suffit : la
  // portee « repo » aurait donne un acces en ecriture a TOUS les
  // depots prives de chaque personne qui se connecte, ce qui est hors
  // de proportion pour changer une date de concert.
  // read:user et non user : le CMS affiche un nom et un avatar, il n'a
  // aucun besoin de MODIFIER le profil GitHub.
  dest.searchParams.set("scope", "public_repo,read:user");
  dest.searchParams.set("state", etat);

  return new Response(null, {
    status: 302,
    headers: {
      Location: dest.toString(),
      "Set-Cookie": `etat=${etat}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
    }
  });
}

/* ── 2. Retour : echange du code contre un jeton ── */
async function terminer(request, url, env) {
  const code = url.searchParams.get("code");
  const recu = url.searchParams.get("state");
  const attendu = (request.headers.get("Cookie") || "")
    .split(";").map(c => c.trim())
    .find(c => c.startsWith("etat="))?.slice(5);

  if (!code) return new Response("Code manquant", { status: 400 });
  if (!recu || recu !== attendu) return new Response("État invalide", { status: 400 });

  let data;
  try {
    const r = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "mangosunday-oauth"
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code
      })
    });
    data = await r.json();
  } catch {
    data = { error_description: "GitHub injoignable" };
  }

  const resultat = data.access_token
    ? { token: data.access_token, provider: "github" }
    : { error: data.error_description || "Échec de l'authentification" };

  return pageRetour(resultat);
}

/* ── 3. Page de retour ─────────────────────────────────────────
   Elle contient un script EN LIGNE : c'est lui qui transmet le jeton
   a la fenetre du CMS. Le relais partageant maintenant l'origine du
   site, il tomberait sous le « script-src 'self' » de public/_headers,
   qui interdit precisement les scripts en ligne — la fenetre de
   connexion resterait ouverte indefiniment, SANS message d'erreur.

   D'ou la CSP portee par la reponse elle-meme, avec un nonce genere
   par requete. Le relais ne depend ainsi d'aucune hypothese sur ce
   que _headers applique ou non aux reponses dynamiques.

   Cible du postMessage : location.origin, et NON une variable de
   configuration. Le relais partageant desormais l'origine de
   l'administration, la bonne valeur est connue du navigateur lui-meme.
   C'est ce qui supprime definitivement la classe de panne la plus
   penible du montage : une origine mal saisie faisait jeter le message
   par le navigateur, sans erreur, et la fenetre tournait sans fin.
   ORIGINE_ADMIN n'est donc plus utilisee.

   En cas d'echec, la fenetre ne se ferme PAS : elle affiche la raison.
   Se fermer en silence laissait le CMS conclure a une interruption
   ("Authentication aborted") sans jamais dire pourquoi. */
function pageRetour(resultat) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const etat = resultat.token ? "success" : "error";
  const echec = resultat.error
    ? String(resultat.error).replace(/[<>&]/g, "")
    : "";

  const page = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Connexion</title></head>
<body style="font:16px/1.5 system-ui,sans-serif;padding:2rem;max-width:34rem">
<p id="m">Connexion en cours, cette fenêtre va se fermer.</p>
<script nonce="${nonce}">
(function () {
  var msg = ${JSON.stringify(JSON.stringify(resultat))};
  var ok = ${etat === "success"};
  var m = document.getElementById('m');

  // Sans opener, le jeton n'a personne a qui etre transmis. Cela
  // arrive si la page qui a ouvert cette popup porte un
  // Cross-Origin-Opener-Policy: same-origin — il coupe le lien des
  // que la popup navigue vers une autre origine, ici GitHub.
  // On le DIT, au lieu de se fermer en silence : une fermeture muette
  // laisse le CMS conclure a une interruption sans jamais en donner
  // la raison.
  if (!window.opener) {
    m.textContent = "La fenêtre qui a lancé la connexion n'est plus " +
      "accessible (window.opener absent). Cause probable : un en-tête " +
      "Cross-Origin-Opener-Policy sur la page d'administration. " +
      "Le jeton a bien été obtenu mais ne peut pas être transmis.";
    return;
  }

  function envoyer() {
    window.opener.postMessage(
      'authorization:github:${etat}:' + msg, window.location.origin);
  }
  window.addEventListener('message', envoyer, false);
  envoyer();

  if (ok) {
    // Sveltia ferme la popup lui-meme des qu'il a traite le message.
    // Ce delai n'est qu'un filet de securite s'il ne le fait pas.
    setTimeout(function () { window.close(); }, 5000);
  } else {
    m.textContent = "Échec de l'authentification : " +
      ${JSON.stringify(echec)} + " — vous pouvez fermer cette fenêtre.";
  }
})();
<\/script>
</body></html>`;

  return new Response(page, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      // L'etat a servi : on le retire.
      "Set-Cookie": "etat=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
    }
  });
}
