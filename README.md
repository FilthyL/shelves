# shelves

**Filth Manor** is a house you can walk into. Click it and the front comes away to show five rooms. Each room is a wall of shelving that holds a different part of the collection, drawn as physical copies at true size: vinyl, CDs and cassettes in the Listening Room, Blu-rays, DVDs and VHS in the Screening Room, books in the Library, anime box sets in the Anime Den and manga volumes in the Manga Loft. Take anything off a shelf to turn it over, flip it to read the back and see its card.

The house, street and room decor are pixel art drawn on a canvas. The copies keep their real proportions and use their real published covers.

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
| `colors` | `[ground, ink, accent]` for the generated art and spine |
| `id` | Only needed when a title has no Latin letters or two items share a title |

| Format | Object |
| --- | --- |
| `vinyl`, `cd`, `cassette` | 12" sleeve, jewel case, Norelco cassette case |
| `dvd`, `bluray`, `4k`, `vhs` | Keepcases and a VHS sleeve |
| `boxset` | Blu-ray box set with an obi strip |
| `hardcover`, `paperback` | Books, sized from `pages` |
| `tankobon`, `kanzenban`, `deluxe` | Manga volumes, perfect editions and large-format hardcovers |

Check your edits before pushing:

```bash
python3 tools/validate.py
```

## Covers

`tools/covers.py` finds each item's published cover and records its link in `data/covers.json`, along with spine colours taken from it. The images are never stored in the repo; the site loads each one from where it is published. Every source is free and needs no key, and all shelves are looked up at the same time:

| Shelf | Source |
| --- | --- |
| Anime | AniList |
| Manga | MangaDex, a cover for every owned volume; AniList for a series MangaDex lacks |
| Music | MusicBrainz and the Cover Art Archive; Deezer for a record it lacks |
| Books | Open Library, by `isbn` when the item has one |
| Films | IMDb |

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

The basement holds toys you can play with instead of shelves. Each toy is a 3D rig moved by a timeline, so nothing is a video:

- **Butterfly knife** (a trainer): 24 tricks, from the basic opening and closing through fans, the Y2K and Zen rollovers, Chaplin, helix, aerials, the ladder and the tornado. The blade and bite handle swing on their own pins, so the knife opens and closes the way the real linkage does.
- **Deck of cards**: 13 cardistry moves, including the thumb fan, Charlier, swivel, revolution and Sybil cuts, the spring, waterfall, ribbon spread with turnover, riffle shuffle and bridge, pinwheel, scissor cut, boomerang throw and anaconda dribble.

Pick a toy to open the play table. Arrow keys change the trick, space pauses, and every trick has its own link, like `#tricks--butterfly-knife--y2k-rollover`. Tricks live in `assets/js/toys.js`; toys are listed in `data/rooms/tricks.json`.

## Log from the site

On the published site, press **L** (or **+ Log** once connected, or the link at the foot of any room). Pick a shelf and start typing a title. Suggestions come from AniList, Open Library, MusicBrainz or IMDb, and picking one fills in the creator, year and cover. Add your rating, take and tags, then **Log it**. The page commits the entry into that shelf's JSON, which redeploys the site within a minute; until then it already shows on your device.

Logging needs a GitHub token, pasted once and kept only in that browser:

1. Open [a new fine-grained token](https://github.com/settings/personal-access-tokens/new).
2. Under Repository access, choose **Only select repositories** and pick this repo.
3. Under Permissions, set **Contents** to **Read and write**, then generate it.

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
- The interface was cleaned up with the [unslop](https://github.com/heydamir/unslop) guidance by Damir Sokolovsky (CC BY 4.0).
- Cover art belongs to its publishers and is shown to identify each item in a personal collection.
