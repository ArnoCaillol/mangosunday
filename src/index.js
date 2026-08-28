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
     ORIGINE_ADMIN    origine EXACTE qui sert /admin/ — cible du
                      postMessage. Le relais partageant desormais
                      l'origine du site, c'est simplement l'URL du
                      site : https://mangosunday.arnaud-caillol.workers.dev
                      puis https://mangosunday.com apres branchement.
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

  return pageRetour(resultat, env.ORIGINE_ADMIN);
}

/* ── 3. Page de retour ─────────────────────────────────────────
   Elle contient un script EN LIGNE : c'est lui qui transmet le jeton
   a la fenetre du CMS. Le relais partageant maintenant l'origine du
   site, il tomberait sous le « script-src 'self' » de public/_headers,
   qui interdit precisement les scripts en ligne — la fenetre de
   connexion resterait ouverte indefiniment, SANS message d'erreur.

   D'ou la CSP portee par la reponse elle-meme, avec un nonce genere
   par requete. Le relais ne depend ainsi d'aucune hypothese sur ce
   que _headers applique ou non aux reponses dynamiques. */
function pageRetour(resultat, origineAdmin) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const etat = resultat.token ? "success" : "error";

  const page = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Connexion</title></head>
<body style="font:16px system-ui;padding:2rem">
<p>Connexion en cours, cette fenêtre va se fermer.</p>
<script nonce="${nonce}">
(function () {
  var msg = ${JSON.stringify(JSON.stringify(resultat))};
  var cible = ${JSON.stringify(origineAdmin)};
  function envoyer() {
    if (window.opener) {
      window.opener.postMessage('authorization:github:${etat}:' + msg, cible);
    }
  }
  window.addEventListener('message', envoyer, false);
  envoyer();
  setTimeout(function () { window.close(); }, 1500);
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
