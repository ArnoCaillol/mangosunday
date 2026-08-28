# ═══════════════════════════════════════════════════════════════
#  Serveur statique local — outil de developpement, NON publie.
#
#  Pourquoi il existe : l'hydratation lit content/*.json avec fetch(),
#  que les navigateurs bloquent sur file://. Ouvrir index.html
#  directement affiche donc la page en etat statique, sans dates ni
#  liens. Ce script sert public/ en HTTP pour retrouver le
#  comportement reel.
#
#  Node n'etant pas installe sur ce poste, on s'appuie sur
#  HttpListener, inclus dans .NET.
#
#  Usage :  powershell -ExecutionPolicy Bypass -File tools\serve.ps1
#           puis http://localhost:8080
# ═══════════════════════════════════════════════════════════════

param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'

$racine = Join-Path (Split-Path -Parent $PSScriptRoot) 'public'
if (-not (Test-Path $racine)) {
    Write-Error "Dossier introuvable : $racine"
    exit 1
}
$racine = (Resolve-Path $racine).Path

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.avif' = 'image/avif'
    '.woff2'= 'font/woff2'
    '.ico'  = 'image/x-icon'
    '.txt'  = 'text/plain; charset=utf-8'
    '.xml'  = 'application/xml; charset=utf-8'
    '.yml'  = 'text/yaml; charset=utf-8'
}

$ecouteur = New-Object System.Net.HttpListener
$ecouteur.Prefixes.Add("http://localhost:$Port/")

try {
    $ecouteur.Start()
} catch {
    Write-Error "Impossible d'ouvrir le port $Port. Essayer : -Port 8081"
    exit 1
}

Write-Host ""
Write-Host "  Mango Sunday - serveur local" -ForegroundColor Yellow
Write-Host "  Racine : $racine"
Write-Host "  URL    : http://localhost:$Port/" -ForegroundColor Green
Write-Host "  Ctrl+C pour arreter."
Write-Host ""

try {
    while ($ecouteur.IsListening) {
        $ctx = $ecouteur.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $chemin = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
        if ($chemin.EndsWith('/')) { $chemin += 'index.html' }

        $fichier = Join-Path $racine ($chemin.TrimStart('/') -replace '/', '\')

        # Barriere de traversee : on ne sert rien hors de public/.
        $complet = [System.IO.Path]::GetFullPath($fichier)
        if (-not $complet.StartsWith($racine, [StringComparison]::OrdinalIgnoreCase)) {
            $res.StatusCode = 403
            $res.Close()
            continue
        }

        if (Test-Path $complet -PathType Leaf) {
            $octets = [System.IO.File]::ReadAllBytes($complet)
            $ext = [System.IO.Path]::GetExtension($complet).ToLower()
            $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
            $res.StatusCode = 200
            # Pas de cache en developpement : on veut voir ses modifications.
            $res.Headers.Add('Cache-Control', 'no-store')
            $res.ContentLength64 = $octets.Length
            $res.OutputStream.Write($octets, 0, $octets.Length)
            Write-Host ("  200  " + $chemin) -ForegroundColor DarkGray
        } else {
            $res.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - $chemin")
            $res.ContentType = 'text/plain; charset=utf-8'
            $res.ContentLength64 = $msg.Length
            $res.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host ("  404  " + $chemin) -ForegroundColor DarkRed
        }
        $res.Close()
    }
} finally {
    $ecouteur.Stop()
    $ecouteur.Close()
    Write-Host "`n  Serveur arrete." -ForegroundColor Yellow
}
