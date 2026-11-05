# Filth Manor (shelves): working notes

A static site at https://filthyl.github.io/shelves/ (repo FilthyL/shelves). A pixel-art house on a night street; clicking it dissolves the front into a cutaway of six rooms. Five rooms are shelves of physical copies (films, records, books, anime, manga) drawn at real size with real covers; the sixth, the Trick Room in the basement, holds playable toys: a butterfly knife (31 tricks), a karambit (16) and a deck of cards (19). The README has a "Stack, and why" section the owner asked for; keep it current when the stack changes.

## How the owner wants things

- **Pixel art, ENDESGA 32 only.** Every colour in the house, rooms, UI and generated covers comes from that palette (`E` in `assets/js/pixel.js`, tokens in `assets/css/shelves.css`). Don't invent colours.
- **Quiet chrome (heydamir/unslop guidance, CC BY 4.0, credited in README).** Sentence case, no uppercase tracked labels, one accent per screen, no glows, colored or offset shadows, no looping effects in the interface (the street scene may animate), spacing on a 4px grid, one easing curve `cubic-bezier(0.22, 1, 0.36, 1)`. Type: Pixelify Sans for the interface, Jersey 10 for large headlines only. Archivo, Bodoni Moda and IBM Plex Mono are only for printed matter on the objects.
- **Real published covers, never stored in the repo.** `data/covers.json` holds links (plus spine palettes); images load from their sources. `assets/covers/` is gitignored. Do not commit image files.
- **Commit and push after every significant step.** Deploying = fast-forward push to `main`. Force-push and branch deletion are blocked by the safety classifier; don't try. Work on `claude/shelves-clean` and fast-forward `main` to it (`git push origin HEAD:main` after checking `git merge-base --is-ancestor origin/main HEAD`). The old branch `claude/dreamy-volta-tpztzp` still holds ~22 MB of old image history; the owner may delete it.
- **Letterboxd is dropped.** The 50 films imported from it stay on the Screening Room shelf as normal entries; there is no sync any more.
- **Make it work, quickly.** The owner dislikes long waits on cover fetching; the deploy never waits on covers.
- The owner said "we will work on the displays later" (how items look on shelves / covers).

## Layout of the code

| Path | What it does |
| --- | --- |
| `index.html` | Loads fonts, `assets/css/shelves.css` (chrome) and `objects.css` (physical objects), an import map for `three` (GLTFLoader imports it bare), and `assets/js/app.js` as a module |
| `assets/js/model.js` | Formats in millimetres (`FORMATS`), room kinds (`KINDS`), palettes, loading `data/`, building rooms and shelf objects, `putEntry()` to add an entry and rebuild a room |
| `assets/js/art.js` | Generated covers, spines, case frames, back covers, discs (CSS only, used when no real cover) |
| `assets/js/pixel.js` | Canvas pixel renderer: street, house exterior and cutaway (attic + floors + basement), dither dissolve, decor sprites, wallpaper tiles |
| `assets/js/app.js` | Routing, street scene, room shelves (packing, face-out promotion), inspector (3D object in hand), search, Trick Room, play table, logging glue |
| `assets/js/log.js` | Logging new entries from the site: suggestions (AniList, Open Library, MusicBrainz, IMDb) and a commit through GitHub's contents API with a fine-grained token kept in localStorage |
| `assets/js/tricks.js` | Trick data (`BALISONG_TRICKS` 31, `KARAMBIT_TRICKS` 16, `CARD_MOVES` 19), `COMBOS` (suggested, per toy), `knifeRoutine`/`deckRoutine`: a combo as one track (auto open/close between tricks, `from` = current pose, `loop`), smooth curves with snap-and-bounce stops, the derived knife hand, `CARD_HANDS` per move |
| `assets/js/toys.js` | The `performer` (run/swap/hold a routine, speed, loop), sounds derived from the routine, flat CSS fallback rigs, the `TOYS` registry |
| `assets/js/toys3d.js` | The real 3D toys: Three.js 0.160.0 imported from jsDelivr on demand, extruded knife (rainbow anodised titanium handles: an ENDESGA gradient texture plus iridescence; gold pins), box cards with canvas faces, sculpted hands (`sculptedHand`: WebXR generic-hand GLBs from jsDelivr, posed with our own forward kinematics; `capsuleHand` is the fallback; `POSES`/`CONTACT` for the knife, `CARD_POSES`/`CARD_CONTACT` for the deck), sleeves from a fixed elbow, drag-to-orbit camera, PMREM studio reflections, shadows |
| `assets/js/sound.js` | All sound, synthesized with Web Audio (no files): one-shots via `play(name)`, continuous noise `bed()`s; wakes on first gesture; toggle `M`, stored in localStorage `fm-sound` |
| `data/house.json` | House name, number, repo/branch for logging, rooms (id, name, kind, file) in house order: attic first, then floors two at a time, a leftover room goes in the basement |
| `data/rooms/*.json` | `{ "items": [...] }`, one entry per line; order = shelf order |
| `data/covers.json` | Written by `tools/covers.py`: `room/id` → `{ src, from, match, pal, vols? }` or `{ miss: true }` |
| `tools/covers.py` | Finds cover links, all shelves in parallel: anime AniList; manga MangaDex per volume (AniList for a missing series); music MusicBrainz + Cover Art Archive (Deezer backup); books Open Library (ISBN pins an edition); films IMDb suggestion feed |
| `tools/validate.py`, `tools/shelflib.py`, `tools/test_tools.py` | Data checks, shared id rules (mirror `slug()` in model.js), offline tests with fixture responses |
| `.github/workflows/deploy.yml` | On push to main: build + deploy first, then a covers job (10 min cap, continue-on-error) that commits new links and redeploys |

## Conventions and facts worth keeping

- Hash routes: `#` street, `#house` front open, `#<room>`, `#<room>--<item>` (inspector), manga `#manga--<series>--<vol>`, toys `#tricks--<toy>--<trick>+<trick>…` (the combo). Item ids are slugs of the title, deduped with `-<year>`.
- Shelfmarks are `<house initials>-<kind code>-<nnn>`, e.g. `FM-MUS-001`, derived from the house name.
- Room kinds: movies, music, books, anime, manga, toys. Adding a kind touches `KINDS` (model.js), `THEMES`/`interiorPixel`/`PROPS`/`wallTile` (pixel.js), `.theme-<kind>` (shelves.css), `KINDS`/`FORMATS` (shelflib.py), and a source in covers.py if it has covers.
- Butterfly knife kinematics: the safe handle is the root; blade angle `b` about pin 1 (0 folded, 180 out); bite handle angle `d` about pin 2 relative to the blade (0 along the blade, 180 folded back). Open = b 180, d 180. A trick is `bali(id, name, level, about, frames, pivot)` with frames `[dt, {X,Y,rz,ry,rx,b,d}, ease]`; it must end at its starting angles mod 360 (a quick node check verified all 24). Card moves are functions `f(t, i, n)` returning `{x,y,z,rz,ry,rx}` and must end with the deck square.
- Karambit: an original black-and-gold design (the owner asked for a "Valorant Champions type" one; don't copy Riot's skin or use their names). Its tricks use `kara()` on `KBASE`; the ring is the pivot and rz spins it round the index finger. `follow: 1` on a key makes the hand turn with the knife (wrist rolls, slashes); set it back to 0. `karambitRoutine` is `knifeRoutine` with the karambit table (no auto open/close). In 3D the hand reaches out towards the camera, index finger first, palm down (`hBase`), so spins face you; `rig` tilts hand and knife together.
- Hands follow their target pose through `poseFollower`: two easing stages, and each finger trails the one before (index first). The owner said the hands were "not fluid"; keep motion eased, never snapped. Card hand positions ease in two stages too. Pixel ratio is capped at 1.5 for phones.
- The owner wanted hands, smoother and faster tricks, and combos instead of a media player (no prev/pause/next or progress bar; speeds stay). Knife tricks play at `TEMPO` 0.64 of their written time, cards at `CARD_TEMPO` 0.78.
- Knife hand: `handTrack` keeps the hand turned with the knife while they line up within 75°, otherwise it stays (spins, tosses); the rig blends grip/pinch/open from `pinch` and `air` in each sample. `LEAN` tilts the whole knife scene; `MIRROR` draws it mirrored so the left-handed rig shows as a right hand with the arm from the lower right. Card hands: left model on the screen-left, right model on the screen-right, each turned 90° about its fingers so the palm faces the deck's edge and the thumb lies on the front (seen as if they were your own hands); the owner disliked palms-to-camera and asked twice that directions be right.
- The hand GLBs: every bone hangs straight off the armature (WebXR drives joints one by one), so bending a knuckle must carry the joints after it: `run()` walks each chain. Their fingers rest slightly hyperextended, so don't infer the palm from finger curvature; the palm is (index to little) x (along the fingers) for the left model, the reverse for the right (checked against the thumb, which sits palm-side). The thumb bends in its own rest plane. Measure bone axes before parenting the model into the hand frame.
- Network from GitHub runners: MyAnimeList's Jikan API is unreachable (ENETUNREACH), Letterboxd pages return 403, iTunes film search returns nothing; AniList, MangaDex, MusicBrainz/CAA, Deezer, Open Library and IMDb work.

## Gotchas hit before

- This sandbox blocks almost every outside host (cover CDNs, APIs, github.io); only GitHub (git + MCP) and Google Fonts work. Test API-dependent code in Playwright with `page.route()` fixtures; cover images failing to load locally is expected.
- The Bash safety check rejects some inline heredocs; write patch scripts to the scratchpad and run them.
- `.card` is the catalogue card in the inspector; playing cards use `.pcard`. Check class names don't collide.
- Container-query units on an element resolve against the nearest container ancestor, or the viewport if there is none (the back-cover padding bug). Use % for an element's own padding.
- `.scene-room` sets `image-rendering: pixelated` (inherited); real cover images reset it with `.art-img { image-rendering: auto }`.
- `PMREMGenerator.fromScene(scene, sigma, near, far)` defaults far to 100; a bigger studio scene is clipped and metal renders black. Pass the far plane.
- WebGL in headless Chromium here needs `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader`; route the jsDelivr Three.js URL to `scratchpad/three/package/build/three.module.min.js` (npm registry works, jsDelivr is blocked). SwiftShader is slow, so trick time lags real time in tests; wait on the `.play-now` text or pose exact moments with the harness below, not a fixed delay.
- To pose toys at exact moments, use `scratchpad/harness.js` style pages: route a fake `http://localhost:8765/__harness.html` in Playwright that imports `TOYS`, builds a rig and calls `rig.render(routine.sample(t))`. The page needs the `.toy-canvas` CSS, since the 3D canvas sizes itself from its own box.
- Sounds: never add audio files. New sounds are recipes in `SOUNDS` (sound.js); toy sounds come from `knifeEvents`/`moveEvents` in toys.js (worked out from the routine). Test by counting `AudioBufferSourceNode.prototype.start` calls in Playwright.
- Python output in CI needs flushing (`PYTHONUNBUFFERED=1`, `print(..., flush=True)`) or the log looks hung.
- `GITHUB_TOKEN` pushes don't trigger workflows; `gh workflow run` (workflow_dispatch) does.

## Testing

- `python3 -m http.server 8765` in the repo, then Playwright (preinstalled, `require('playwright')`) for screenshots and click-through flows.
- `python3 tools/validate.py` and `python3 -m unittest discover -s tools` before pushing; `node --check assets/js/*.js` for syntax.
