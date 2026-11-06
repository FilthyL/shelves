# shelves

**Filth Manor** is a manor you can walk into: a stone house with two wings, a columned portico and a copper cupola, behind iron railings on a night street. Click it and the front comes away to show seven rooms around a grand entrance hall. Each room is a wall of shelving that holds a different part of the collection, drawn as physical copies at true size: vinyl, CDs and cassettes in the Listening Room, Blu-rays, DVDs and VHS in the Screening Room, books in the Library, anime box sets in the Anime Den, manga volumes in the Manga Loft up in the attic, and PlayStation and Xbox games in the Games Room. Take anything off a shelf to turn it over, flip it to read the back and see its card.

The basement is the Trick Room, where real 3D hands play with a butterfly knife, a karambit and a deck of cards.

The manor, street and room decor are pixel art drawn on a canvas. The copies keep their real proportions and use their real published covers.

## Stack, and why

The site is a folder of static files: no framework, no bundler, no server and no database. Each piece of the stack was picked to keep it that way.

| Part | What it uses | Why |
| --- | --- | --- |
| Pages and code | Plain HTML, CSS and JavaScript ES modules | The site has a handful of views and no shared app state, so a framework would add more than it saves. With no build step, the files in the repo are exactly what the browser runs: you can read, edit and debug any of it directly, and nothing has to be upgraded to keep it working. |
| Hosting and deploys | GitHub Pages, with a GitHub Actions workflow | Free, and it lives next to the code. A push to `main` deploys in about a minute. Cover fetching runs after the deploy, so a slow cover site never holds the site back. |
| Data | JSON files in `data/` | Every shelf is a file you can read, diff and edit by hand. The in-site logger commits to the same files through GitHub's API, so there is no database to run or back up. |
| The manor and street | A small canvas pixel renderer (`pixel.js`) | Pixel art needs exact control of every pixel: a fixed palette (ENDESGA 32), dithering and integer scaling. A few hundred lines of raster code do that more simply than a game engine would. |
| Shelves and the inspector | CSS layout and CSS 3D transforms | Cases, spines and books are boxes. CSS draws them with sharp text and real cover images, turns them in 3D without WebGL, and copes with any screen size. |
| The Trick Room | [Three.js](https://threejs.org) (WebGL), loaded from jsDelivr only when you go down there | Lighting, metal reflections, shadows and rigged hands need a real 3D engine. Loading it on demand keeps the rest of the site small, and if it can't load, flat CSS versions of the toys stand in. |
| Hands | The generic hand models from [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles) (MIT), from jsDelivr | Realistic rigged hands without sculpting our own or storing models in the repo. The fingers are posed by the site's own code. |
| Tricks and combos | Keyframes joined into one smooth track, with physics where it matters (`tricks.js`) | A combo plays as one continuous motion, so tricks flow into each other. Tosses fly under real gravity with a steady spin, spins in the fingers start with a flick and lose speed to friction, and parts that slam into a stop bounce and kick the wrist. The hand's grip is worked out from the same track rather than animated by hand. |
| Sound | The Web Audio API | Every sound is made on the fly from noise and short tones, worked out from each trick's motion. There are no audio files to store or download. |
| Covers and suggestions | AniList, MusicBrainz with the Cover Art Archive, Deezer, Open Library, IMDb's suggestion feed and Wikipedia | All free, with no API keys. The repo keeps only links (`data/covers.json`), and images load from their sources, so the repo stays small. |
| Accounts, diary and lists (the club) | [Supabase](https://supabase.com) (Postgres with sign-in and row-level security), loaded from jsDelivr only when the club is on; a same-interface local version for trying it | A static site has no server, and people logging things, following each other and writing reviews needs one. Supabase's free tier gives real accounts and a database, and its row-level security means the public key in `data/club.json` can only do what the policies in `supabase/schema.sql` allow. The club is off until that file names a project, so the site is unchanged until you choose to turn it on. |
| Cover loading | The [wsrv.nl](https://wsrv.nl) image CDN in front of Open Library and the Cover Art Archive (`img.js`), with a warm-up script (`tools/warm.mjs`) | Those two answer through redirects and a zip extraction at archive.org, 1 to 3 seconds for every image every time. The CDN serves each cover resized to the size shown, as WebP, cached for a year, in about 40 ms. The deploy asks it for every cover once, so a visitor never meets a cold cache; a volume you rest the pointer on, and the ones next to the open one, are fetched ahead; and if the CDN is ever down the browser falls back to the source link. |
| Tools | Python 3 standard library (`tools/`), with Pillow optional for spine colours | Runs on any machine and on GitHub's runners with nothing to install. Tests use saved responses, so they run offline. |
| Type | Google Fonts | Pixelify Sans and Jersey 10 for the interface, Archivo, Bodoni Moda and IBM Plex Mono for printing on the objects. |

The code is laid out like this:

```
index.html            the page: fonts, styles, an import map for three, app.js
assets/css/           shelves.css (the interface), objects.css (the physical objects)
assets/js/app.js      routing, the street, rooms, inspector, search, Trick Room, play table
assets/js/model.js    formats in millimetres, room kinds, loading data/
assets/js/pixel.js    the pixel renderer: street, house, cutaway, decor
assets/js/art.js      generated covers, spines and discs for items without a real cover
assets/js/log.js      logging new entries from the site
assets/js/club/       the club: accounts, diary, watchlist, follows, lists (club-ui.js, club-pages.js, club-kit.js, two backends)
assets/js/tricks.js   the tricks, suggested combos, and how a combo becomes one track
assets/js/toys.js     the performer, toy sounds, flat stand-ins, the list of toys
assets/js/toys3d.js   the 3D toys and hands (Three.js)
assets/js/sound.js    all sound, made with Web Audio
data/                 house.json, rooms/*.json, covers.json
tools/                covers.py, validate.py and their tests
supabase/schema.sql   the club's tables, policies and sign-up trigger, to run once in Supabase
```

## Add to the collection

Everything lives in `data/`. The house and its rooms are in `data/house.json`, and each room's items are in `data/rooms/<room>.json`. The order of the items is the order on the shelf.

```json
{ "title": "Kid A", "creator": "Radiohead", "year": 2000, "format": "vinyl",
  "rating": 10, "note": "What I think of it", "tags": ["art rock"], "featured": true }
```

| Field | Meaning |
| --- | --- |
| `title` | Required. Everything else is optional |
| `creator` | Artist, director, author, studio or mangaka, depending on the room |
| `year`, `rating` | Whole year; rating from 0 to 10 |
| `format` | The physical copy, from the table below. Each room has a default |
| `note` | Your take, shown on the card and the back cover |
| `featured` | Shown face-out on the shelf |
| `status` | For example `reading` or `watching`. A book being read gets a ribbon bookmark |
| `original` | Original-language title, like `千と千尋の神隠し` |
| `runtime`, `episodes`, `pages`, `label`, `country`, `publisher` | Shown on the card when present. `pages` also sets a book's thickness |
| `tracks` | A list of track names, printed on the back of a record |
| `owned`, `total` | Manga only. `owned` is `"1-14"`, `12` or `[1, 2, 5]`. Each owned volume gets its own spine |
| `facts` | Any extra rows for the card, like `{ "Director": "Satoshi Kon" }` |
| `isbn` | Books only. Fetches the cover of that exact edition |
| `cover` | A cover URL or path to use instead of the fetched one, or `false` to keep the generated art |
| `edition`, `vol_covers` | Manga only. Covers come from the Japanese edition by default, since the shelves list Japanese publishers; `"edition": "en"` prefers the English ones. `"vol_covers": { "15": "https://…" }` pins one volume's cover when the lookup picks a wrong one |
| `colors` | `[ground, ink, accent]` for the generated art and spine |
| `id` | Only needed when a title has no Latin letters or two items share a title |

| Format | Object |
| --- | --- |
| `vinyl`, `cd`, `cassette` | 12" sleeve, jewel case, Norelco cassette case |
| `dvd`, `bluray`, `4k`, `vhs` | Keepcases and a VHS sleeve |
| `boxset` | Blu-ray box set with an obi strip |
| `hardcover`, `paperback` | Books, sized from `pages` |
| `tankobon`, `kanzenban`, `deluxe` | Manga volumes, perfect editions and large-format hardcovers |
| `ps5`, `ps4`, `ps3`, `xbox-series`, `xbox-one`, `xbox-360` | Game cases in each platform's shell colour, with its top band |

Check your edits before pushing:

```bash
python3 tools/validate.py
```

## Covers

`tools/covers.py` finds each item's published cover and records its link in `data/covers.json`, along with spine colours taken from it. The images are never stored in the repo; the site loads each one from where it is published. Every source is free and needs no key, and all shelves are looked up at the same time:

| Shelf | Source |
| --- | --- |
| Anime | AniList |
| Manga | Open Library's editions, a cover for every owned volume (the cover Open Library holds, else an image keyed by the edition's ISBN); AniList's series cover for any volume without one. MangaDex is not used: it sends image requests to a bot challenge, so browsers cannot load its covers |
| Music | MusicBrainz and the Cover Art Archive; Deezer for a record it lacks |
| Books | Open Library, by `isbn` when the item has one |
| Films | IMDb |
| Games | Wikipedia (the box art in each game's article) |

On every push to `main` the workflow deploys the site straight away, then looks up any covers that are missing, commits the updated list and deploys again. Adding an item to the JSON is enough. To run it yourself:

```bash
pip install pillow
```

```bash
python3 tools/covers.py --dry-run
```

```bash
python3 tools/covers.py
```

If it picks the wrong edition, set `"cover"` on the item to the image you want. Items it couldn't match keep their generated cover. Run with `--retry-misses` to try them again, or `--refresh` to fetch everything again.

## The Trick Room

The basement holds toys you can play with instead of shelves: a butterfly knife (31 tricks), a karambit (16) and a deck of cards (19). Each toy is a real 3D model (drawn with [Three.js](https://threejs.org), loaded from jsDelivr only when you go down there) moved by a timeline, so nothing is a video. If Three.js can't load, the toys fall back to a flat CSS version of the same tricks.

- **Butterfly knife** (a rainbow titanium trainer): 31 tricks, from the basic opening and closing through fans, the Y2K and Zen rollovers, Chaplin, helix, aerials, the ladder, the tornado, the matrix and the sunrise. The blade and bite handle swing on their own pins, so the knife opens and closes the way the real linkage does.
- **Karambit** (an original black-and-gold design with a gold finger ring): 16 tricks spun round the index finger through the ring: index and reverse spins, the stall, the inspect, toss and catch, grip switches, the figure eight, the ring flip and a hook-and-pull slash.
- **Deck of cards**: 19 cardistry moves, including the thumb fan, Charlier, swivel, revolution and Sybil cuts, the spring, waterfall, ribbon spread with turnover, riffle shuffle and bridge, faro and overhand shuffles, two-hand spread, pressure fan, top card turnover, pinwheel, scissor cut, boomerang throw and anaconda dribble.

Real hands do the tricks: sculpted, rigged hand models with a bone in every joint. A right hand flips the knife and spins the karambit, and two hands work the deck, each holding it from the side with the thumb on the front. The knife has solid chamfered handles, screw-head pivots and a thick ground blade; the cards have real thickness, rounded corners and a coated finish. You watch in first person, as if they were your own hands: your arms come up from below and you look down at the knife or the deck in front of you. The karambit is held up to show it, ring at the top and blade curving out below, the way you'd hold one for a photo. Drag the play table to look around. The knife hand works itself out from each trick: it grips the safe handle and turns with the knife, loosens to let the knife spin in its fingers, and opens flat under a toss.

Pick a toy to open the play table, then **build a combo**: pick one of the suggested combos, or tap tricks on the card to add them in order, and press **Run the combo** (or Enter). The hand runs the whole sequence in one flow. Where a trick needs the knife open or closed and it isn't, the hand opens or closes it on the way. Speeds are 0.5×, 1× and 2×, **Repeat** keeps going, and Backspace takes the last trick out. A trick you add while the hand is resting plays right away, and one you add during a run joins the end of it. The combo is in the link, so it can be shared: `#tricks--butterfly-knife--basic-opening+chaplin+basic-closing`.

Tricks and suggested combos live in `assets/js/tricks.js`, the performer, sound and flat fallback in `assets/js/toys.js`, and the 3D models and hands in `assets/js/toys3d.js`. Toys are listed in `data/rooms/tricks.json`.

## Sound

The house makes small sounds: the front door, a case or a book coming off the shelf and going back, and in the Trick Room the knife's clacks and pin rattle, the air off a fan, cards tapping, snapping and sliding over each other. None of it is a recording. `assets/js/sound.js` shapes noise and short tones with Web Audio as things happen, and each trick works out its own sounds from its motion, so no audio files are stored or downloaded. Sound starts after your first click or key press (browsers require that). The speaker button or **M** turns it off, and the site remembers the choice.

## Log from the site

On the published site, press **L** (or **+ Log** once connected, or the link at the foot of any room). Pick a shelf and start typing a title. Suggestions come from AniList, Open Library, MusicBrainz or IMDb, and picking one fills in the creator, year and cover. Add your rating, take and tags, then **Log it**. The page commits the entry into that shelf's JSON, which redeploys the site within a minute; until then it already shows on your device.

Logging needs a GitHub token, pasted once and kept only in that browser:

1. Open [a new fine-grained token](https://github.com/settings/personal-access-tokens/new).
2. Under Repository access, choose **Only select repositories** and pick this repo.
3. Under Permissions, set **Contents** to **Read and write**, then generate it.

## The club: accounts, a diary and lists

Anyone can make an account with a username and password, log what they have read, watched, heard or played (half-star rating, a review, a date, liked or not), keep a watchlist, follow other members and see what they log, and make lists with likes and comments. It also lets people log things that are not on these shelves, found through the same title search the owner's logger uses. Every item you open in the house shows what members have said about it.

It is off until a server is set up, so nothing changes on the site before then. To turn it on:

1. Make a free project at [supabase.com](https://supabase.com).
2. In the project, open SQL Editor, paste all of `supabase/schema.sql` and run it. It creates the tables and the security policies.
3. Open Authentication, then Providers, then Email, and turn **Confirm email** off. Members sign in with a username, so each one is stored under a made-up address (`<username>@members.filthmanor.example`, changeable as `emailDomain`) that never receives mail. The cost is that there is no password reset by email.
4. Open Project Settings, then API, and copy the project URL and the `anon` public key into `data/club.json`:

   ```json
   { "supabase": { "url": "https://xxxx.supabase.co", "anonKey": "eyJ…", "emailDomain": "members.filthmanor.example" } }
   ```

   The anon key is meant to be public. It can only do what the policies allow: read logs, lists and profiles, and change or delete only your own rows. Never put the `service_role` key anywhere in this repo.
5. Push. The account button appears next to Search, and the site is a club.

To try it without a server, open the site with `?club=local` (and `?club=off` to stop). Accounts then live in that one browser only, which is how the tests run.

Logs, ratings, reviews and lists are public to anyone who visits; a private list is visible only to its owner. Supabase keeps passwords hashed and is the only place they are stored.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. The page reads its data with `fetch`, so it has to be served rather than opened from disk.

```bash
python3 -m unittest discover -s tools
```

## Deploy

`.github/workflows/deploy.yml` deploys the site to GitHub Pages from `main`, then fills in covers and deploys again if any were added.

1. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`, or run **Actions → Deploy site and find covers → Run workflow**.

## Credits

- Colours: [ENDESGA 32](https://lospec.com/palette-list/endesga-32) by Endesga. Every colour in the house, the rooms and the interface comes from it.
- Type: Jersey 10, Pixelify Sans, Archivo, Bodoni Moda and IBM Plex Mono from Google Fonts.
- 3D: [Three.js](https://threejs.org) (MIT), loaded from jsDelivr.
- Hands: the generic hand models from [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles) (MIT, Amazon), loaded from jsDelivr. Nothing 3D is stored in this repo.
- The interface was cleaned up with the [unslop](https://github.com/heydamir/unslop) guidance by Damir Sokolovsky (CC BY 4.0).
- Cover art belongs to its publishers and is shown to identify each item in a personal collection.
