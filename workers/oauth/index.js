/* ═══════════════════════════════════════════════════════════════
   Relais OAuth GitHub pour Sveltia / Decap CMS
   Worker Cloudflare — a deployer par COLLAGE dans le tableau de bord
   (wrangler n'est pas utilisable ici : Node.js n'est pas installe).

   Role : le secret client OAuth ne peut pas vivre dans le navigateur.
   Ce Worker fait le seul aller-retour qui exige le secret, puis
   renvoie le jeton a la fenetre d'administration.

   Variables d'environnement a definir dans le tableau de bord,
   en « Secret » et non en texte clair :
     GITHUB_CLIENT_ID
     GITHUB_CLIENT_SECRET
     ORIGINE_ADMIN    origine EXACTE qui sert /admin/ — cible du postMessage.
                      Tant que le site vit sur Pages : https://<projet>.pages.dev
                      Apres branchement du domaine   : https://mangosunday.com
                      Une origine qui ne correspond pas au caractere pres fait
                      jeter le message par le navigateur, SANS erreur : la
                      fenetre de connexion tourne indefiniment.
   ═══════════════════════════════════════════════════════════════ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Depart : redirection vers la page d'autorisation GitHub.
    if (url.pathname === "/auth") {
      const etat = crypto.randomUUID();
      const dest = new URL("https://github.com/login/oauth/authorize");
      dest.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      dest.searchParams.set("scope", "repo,user");
      dest.searchParams.set("state", etat);
      return new Response(null, {
        status: 302,
        headers: {
          Location: dest.toString(),
          "Set-Cookie": `etat=${etat}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
        }
      });
    }

    // 2. Retour : echange du code contre un jeton, puis remise au CMS.
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const recu = url.searchParams.get("state");
      const attendu = (request.headers.get("Cookie") || "")
        .split(";").map(c => c.trim())
        .find(c => c.startsWith("etat="))?.slice(5);

      if (!code) return new Response("Code manquant", { status: 400 });
      if (!recu || recu !== attendu) return new Response("État invalide", { status: 400 });

      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code
        })
      });
      const data = await r.json();

      const resultat = data.access_token
        ? { token: data.access_token, provider: "github" }
        : { error: data.error_description || "Échec de l'authentification" };

      // Le CMS ecoute un message postMessage sur son origine.
      const page = `<!DOCTYPE html><meta charset="utf-8"><title>Connexion</title>
<script>
(function () {
  var msg = ${JSON.stringify(resultat)};
  var cible = ${JSON.stringify(env.ORIGINE_ADMIN)};
  function envoyer() {
    window.opener && window.opener.postMessage(
      'authorization:github:' + (msg.token ? 'success' : 'error') + ':' + JSON.stringify(msg),
      cible
    );
  }
  window.addEventListener('message', envoyer, false);
  envoyer();
  setTimeout(function(){ window.close(); }, 1200);
})();
<\/script>
<p>Connexion en cours, cette fenêtre va se fermer.</p>`;

      return new Response(page, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": "etat=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
        }
      });
    }

    return new Response("Relais OAuth Mango Sunday", { status: 200 });
  }
};
