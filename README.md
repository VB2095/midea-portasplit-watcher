# 🌡️ Midea PortaSplit Watcher

Surveille la disponibilité du climatiseur **Midea PortaSplit** (vendu sous marque
**Optimea** chez Leroy Merlin) chez les principales enseignes françaises.

> Produit : split mobile réversible 3500 W / 12000 BTU — réf. Midea `MMCS-12HRN8-QRD0`,
> GTIN `8431312260509`, prix public ~999 €.

## 🚨 Radar de réassort (alerting) — l'essentiel

Boucle de surveillance des sources fiables (Castorama 93 mag. + Boulanger national
+ Optimea officiel) qui **t'alerte instantanément** dès qu'une offre devient
achetable, où qu'elle tombe en France. Aucune ré-alerte tant qu'elle persiste.

```bash
npm install
cp .env.example .env          # configure tes canaux d'alerte (NTFY_TOPIC recommandé)
npm run monitor -- --test-alert   # vérifie que les alertes arrivent (push + macOS)
npm run monitor                   # lance le radar (boucle ~4 min + jitter)
```

Canaux d'alerte (cf. [.env.example](.env.example)) : **ntfy.sh** (push téléphone,
zéro compte), **notif macOS**, **Telegram**, **webhook**. La console affiche
toujours. `--once` = un seul cycle (pour un cron).

**Le garder allumé jusqu'à lundi** (sinon le Mac s'endort) :
```bash
caffeinate -is npm run monitor          # empêche la veille tant que ça tourne
```
Pour un fonctionnement hands-off (auto-restart, survit au reboot), voir
« Planification » plus bas (launchd/cron appelant `npm run monitor -- --once`).

## Démarrage rapide (vérif ponctuelle)

```bash
npm run check          # enseignes en HTTP (rapide, sans navigateur)
npm run check:all      # + enseignes nécessitant un navigateur (Playwright)
```

Pour le tier navigateur :

```bash
npx playwright install chromium
npm run check:all
```

### Options

```bash
npm run check -- --only=boulanger,castorama   # cibler des enseignes
npm run check -- --browser                    # inclure le tier navigateur
npm run check -- --json                       # sortie JSON (pour intégration)
npm run check -- --watch --interval=15        # boucle locale toutes les 15 min
```

## Couverture des enseignes

Établie par reconnaissance le **2026-06-28**. Deux tiers selon la protection anti-bot :

### ✅ Tier HTTP — fiable, sans navigateur (vérifié en live)

| Enseigne   | Méthode                         | Note                                              |
| ---------- | ------------------------------- | ------------------------------------------------- |
| Boulanger  | JSON-LD + attribut DOM          | Akamai mais passe en GET ; stock réel confirmé    |
| Castorama  | **BFF `fulfilment-options`**    | Stock RÉEL (livraison + magasin), voir ci-dessous |

C'est le socle robuste, déployable tel quel (ex. Vercel Cron).

> ⚠️ **Piège important** : le `availability: "InStock"` du **JSON-LD** signifie
> seulement que le produit est *référencé*, pas qu'il est en stock. Se fier au
> JSON-LD seul donne des **faux positifs**. Le watcher exige donc une confirmation
> du stock réel pour tout statut "achetable".

### Stock réel Castorama (groupe Kingfisher)

La vraie dispo (livraison domicile + stock par magasin) vient d'un BFF **sans
authentification** :

```
GET https://www.castorama.fr/casto-browse-mfe/api/fulfilment-options
    ?compositeOfferId=<EAN>&storeId=<id>&postalCode=<cp>
→ homeDelivery / clickAndCollectStorePick / inStore : { availability, quantity }
```

Le `storeId` se récupère via l'API magasins Kingfisher (`?nearLatLong=LAT,LONG`).
Un seul appel depuis le centre de la France ramène **les 93 magasins** du pays.

L'adapter du watcher (check rapide) interroge la livraison sur ton code postal +
ton magasin le plus proche. Pour un **balayage EXHAUSTIF de toute la France**
(les 93 magasins, en parallèle, triés par distance de chez toi) :

```bash
npm run casto:stock                 # sweep national depuis le CP par défaut (35170)
npm run casto:stock -- --cp=75001   # recentrer le tri sur un autre CP
npm run casto:stock -- --all        # afficher les 93 magasins, pas que les hits
npm run casto:stock -- --json       # sortie JSON
```

Le sweep gère la concurrence (8 en parallèle), les retries, et écrit le détail
complet dans `.casto-stock.json` (base pour l'historique / l'alerting). Il liste
tout magasin avec stock > 0 (le « coup à faire »), où qu'il soit en France.

Module réutilisable : [src/casto/api.ts](src/casto/api.ts) (client API partagé
par le watcher et le sweep), CLI : [src/casto/sweep.ts](src/casto/sweep.ts).

### Stock réel Boulanger (GraphQL `lastStock`)

Même principe, en HTTP pur : l'API GraphQL `lastStock` (clé publique front)
renvoie les magasins-avec-stock les plus proches. Sweep national (maillage de
villes, union dédupliquée par magasin) :

```bash
npm run boulanger:stock
```

Détails dans [docs/api-notes.md](docs/api-notes.md). Toutes les recettes d'API
craquées par enseigne (cracked / bloqué / déréférencé) y sont consignées.

### 🌐 Tier navigateur — Playwright requis, *best-effort*

| Enseigne     | Anti-bot              | Statut réel                            |
| ------------ | --------------------- | -------------------------------------- |
| ManoMano     | Cloudflare Turnstile  | Souvent franchi en headless            |
| Auchan       | aucun (stock en JS)   | Lecture JS, parfois illisible          |
| Leroy Merlin | DataDome              | ⚠️ challenge non franchi en headless nu |
| Optimea      | Cloudflare            | ⚠️ idem                                 |
| Mr.Bricolage | Cloudflare            | ⚠️ idem                                 |
| Bricoman     | DataDome              | ⚠️ idem                                 |
| Fnac         | Akamai/DataDome       | ⚠️ idem (souvent en rupture)           |
| Darty        | Akamai + Queue-it     | ⚠️ idem                                 |

**Limite assumée** : les sites en DataDome/Cloudflare strict renvoient un challenge
même à un Chromium headless. Pour les rendre fiables il faut un navigateur *furtif*
(`playwright-extra` + plugin stealth) et/ou un **proxy résidentiel français**.
Voir [Pistes d'amélioration](#pistes-damélioration).

## Architecture

```
src/
  config.ts            # identité produit (GTIN, réf, ASIN)
  types.ts             # types partagés (Availability, CheckResult, Retailer)
  check.ts             # runner parallèle + tri
  cli.ts               # entrée CLI + affichage
  lib/
    http.ts            # fetch headers navigateur + détection anti-bot
    jsonld.ts          # extraction JSON-LD + lecture offers.availability
    availability.ts    # normalisation schema.org + heuristique texte
    browser.ts         # Playwright (optionnel, import dynamique)
    state.ts           # persistance .state.json + détection des transitions
    format.ts          # rendu tableau couleur
  casto/
    api.ts             # client API Kingfisher/Castorama (stores + stock réel)
    sweep.ts           # sweep EXHAUSTIF national (npm run casto:stock)
  retailers/
    factory.ts         # fabriques httpJsonLd() / browserRetailer()
    castorama.ts       # adapter watcher (stock réel via casto/api)
    index.ts           # registre des enseignes
scripts/
  capture.mjs          # capture réseau Playwright (re-découvrir les endpoints)
```

**Principe** : chaque enseigne est un *adapter* qui renvoie un `CheckResult`
normalisé. Ajouter une enseigne = une entrée dans `retailers/index.ts`.

## État & alerting (fondations posées)

Chaque run écrit `.state.json` (dernier statut par enseigne) et détecte les
**transitions vers "achetable"** (rupture → en stock). C'est la brique de base
de l'alerting (Phase 2).

## Pistes d'amélioration

- **Phase 2 — Alerting** : Telegram / email / ntfy sur transition en stock.
- **Déploiement** : Vercel Cron (tier HTTP) toutes les 10-15 min.
- **Anti-bot** : `playwright-extra` + stealth + proxy résidentiel FR pour
  Leroy Merlin / Cdiscount / Darty ; ou Amazon PA-API (ASIN `B0CY2YW8BT`).
- **Robustesse** : alerte si une enseigne passe `unknown` plusieurs runs
  d'affilée (structure de page changée).

## Éthique & bonnes pratiques

- Fréquence raisonnable (≥ 10-15 min), jamais de martèlement.
- robots.txt respecté pour les chemins ciblés (fiches produit autorisées).
- Usage personnel (suivi d'un achat), pas de revente ni de charge sur les sites.
