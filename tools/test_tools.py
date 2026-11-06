"""Offline tests for the data helpers and cover matching. Run: python3 -m unittest discover -s tools"""
import json
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import covers  # noqa: E402
from shelflib import load_house, parse_owned, slug  # noqa: E402


class Helpers(unittest.TestCase):
    def test_slug_matches_site(self):
        self.assertEqual(slug('Gödel, Escher, Bach'), 'godel-escher-bach')
        self.assertEqual(slug('Steins;Gate'), 'steins-gate')
        self.assertEqual(slug('2001: A Space Odyssey'), '2001-a-space-odyssey')

    def test_parse_owned(self):
        self.assertEqual(parse_owned('1-3, 7'), [1, 2, 3, 7])
        self.assertEqual(parse_owned(4), [1, 2, 3, 4])
        self.assertEqual(parse_owned(None, 3), [1, 2, 3])
        self.assertEqual(parse_owned([3, 1, 3]), [1, 3])

    def test_house_loads_with_unique_ids(self):
        _, rooms = load_house()
        self.assertGreaterEqual(len(rooms), 5)
        for room, items in rooms:
            ids = [it['_id'] for it in items]
            self.assertEqual(len(ids), len(set(ids)), room['id'])


class Network(unittest.TestCase):
    def test_unreachable_host_is_not_retried(self):
        covers._dead.add('example.invalid')
        with self.assertRaises(covers.Unreachable):
            covers.http('https://example.invalid/x')


class Matching(unittest.TestCase):
    def test_volume_numbers_from_edition_titles(self):
        from covers import volume_of
        self.assertEqual(volume_of("Naoki Urasawa's Monster, Vol. 3"), 3)
        self.assertEqual(volume_of('Blame!, Volume 10'), 10)
        self.assertEqual(volume_of('Monster: The Perfect Edition #7'), 7)
        self.assertEqual(volume_of('Vagabond 12'), 12)
        self.assertEqual(volume_of('ドロヘドロ (1)'), 1)
        self.assertEqual(volume_of('バガボンド(12)'), 12)
        self.assertEqual(volume_of('鋼の錬金術師 10 (ガンガンコミックス)'), 10)
        self.assertEqual(volume_of('ONE PIECE　巻十'), None)
        self.assertEqual(volume_of('ワンピース 第３巻'), 3)
        self.assertEqual(volume_of('Monster 5 [Omnibus]'), 5)
        self.assertIsNone(volume_of('Monster'))

    def test_similarity_ignores_editions_and_articles(self):
        self.assertEqual(covers.sim('Kid A (Remastered)', 'Kid A'), 1.0)
        self.assertGreater(covers.sim('The Dark Side of the Moon', 'Dark Side Of The Moon - 50th Anniversary'), 0.85)
        self.assertLess(covers.sim('Kid A', 'Amnesiac'), 0.5)




    def test_imdb_pick_prefers_the_film_from_that_year(self):
        it = {'title': 'Blade Runner', 'year': 1982}
        res = [
            {'l': 'Blade Runner 2049', 'y': 2017, 'q': 'feature', 'i': {'imageUrl': 'https://m/2049._V1_.jpg'}},
            {'l': 'Blade Runner', 'y': 1982, 'q': 'feature', 'i': {'imageUrl': 'https://m/1982._V1_.jpg'}},
            {'l': 'Blade Runner: Black Lotus', 'y': 2021, 'q': 'TV series', 'qid': 'tvSeries', 'i': {'imageUrl': 'https://m/bl._V1_.jpg'}},
        ]
        self.assertEqual(covers.choose_imdb(it, res)['url'], 'https://m/1982._V1_SX800.jpg')

    def test_variant_releases_are_penalised(self):
        self.assertGreater(covers.variant_penalty('Currents', 'Currents B-Sides & Remixes - EP'), 0)
        self.assertGreater(covers.variant_penalty('The Stranger', 'The Stranger (Coles Notes)'), 0)
        self.assertEqual(covers.variant_penalty('Live Through This', 'Live Through This'), 0)

    def test_musicbrainz_prefers_the_studio_album(self):
        it = {'title': 'Unknown Pleasures', 'creator': 'Joy Division', 'year': 1979}
        res = [
            {'id': 'live', 'title': 'Unknown Pleasures', 'primary-type': 'Album', 'secondary-types': ['Live'],
             'first-release-date': '2007', 'artist-credit': [{'name': 'Joy Division'}]},
            {'id': 'lp', 'title': 'Unknown Pleasures', 'primary-type': 'Album', 'first-release-date': '1979-06-15',
             'artist-credit': [{'name': 'Joy Division'}]},
            {'id': 'single', 'title': 'Unknown Pleasures', 'primary-type': 'Single', 'first-release-date': '1979',
             'artist-credit': [{'name': 'Joy Division'}]},
        ]
        self.assertEqual(covers.choose_musicbrainz(it, res)['url'], 'https://coverartarchive.org/release-group/lp/front-500')

    def test_musicbrainz_keeps_soundtracks(self):
        it = {'title': 'Roja', 'creator': 'A. R. Rahman', 'year': 1992}
        res = [{'id': 'ost', 'title': 'Roja', 'primary-type': 'Album', 'secondary-types': ['Soundtrack'],
                'first-release-date': '1992', 'artist-credit': [{'name': 'A.R. Rahman'}]}]
        self.assertEqual(covers.choose_musicbrainz(it, res)['url'], 'https://coverartarchive.org/release-group/ost/front-500')

    def test_anilist_matches_on_native_title(self):
        it = {'title': 'Spirited Away', 'original': '千と千尋の神隠し', 'creator': 'Studio Ghibli', 'year': 2001}
        res = [
            {'title': {'english': 'Spirited Away', 'romaji': 'Sen to Chihiro no Kamikakushi', 'native': '千と千尋の神隠し'},
             'startDate': {'year': 2001}, 'coverImage': {'extraLarge': 'https://img/sa.jpg'}, 'studios': {'nodes': [{'name': 'Studio Ghibli'}]}},
            {'title': {'english': 'Howl’s Moving Castle', 'romaji': 'Hauru no Ugoku Shiro', 'native': 'ハウルの動く城'},
             'startDate': {'year': 2004}, 'coverImage': {'extraLarge': 'https://img/howl.jpg'}, 'studios': {'nodes': [{'name': 'Studio Ghibli'}]}},
        ]
        self.assertEqual(covers.choose_anilist(it, res)['url'], 'https://img/sa.jpg')




    def test_isbn10_from_isbn13_and_back(self):
        self.assertEqual(covers.isbn10('9781506711980'), '1506711987')
        self.assertEqual(covers.isbn10('1506711987'), '1506711987')
        self.assertIsNone(covers.isbn10('9791370136383'))

    def test_japanese_isbns_become_cover_links_and_foreign_ones_do_not(self):
        self.assertEqual(covers.isbn13('4063360134'), '9784063360134')
        self.assertEqual(covers.jp_links(['4063360134', '9781506711980', '9784063360134']),
                         ['https://cover.openbd.jp/9784063360134.jpg', 'https://covers.openlibrary.org/b/isbn/9784063360134-L.jpg?default=false'])

    def test_volume_lookup_tries_each_candidate_link_and_falls_back_to_the_series_cover(self):
        good = b'x' * 3000
        calls = []

        def fake_check(url, log):
            calls.append(url)
            if 'dead' in url:
                raise ValueError('not an image')
            return good

        hit = {'from': 'Open Library and AniList', 'match': 'Monster', 'vols': {'1': ['https://dead/1', 'https://ok/1'], '2': ['https://dead/2']}, 'url': 'https://ok/series'}
        orig_check, orig_palette = covers.check, covers.palette
        covers.check, covers.palette = fake_check, lambda image: None
        try:
            covers.SOURCES['manga'], saved = [lambda it, kind, log: hit], covers.SOURCES['manga']
            try:
                entry = covers.lookup('manga', {'title': 'Monster', '_vols': [1, 2]}, lambda m: None)
            finally:
                covers.SOURCES['manga'] = saved
        finally:
            covers.check, covers.palette = orig_check, orig_palette
        self.assertEqual(entry['vols'], {'1': {'src': 'https://ok/1'}})
        self.assertEqual(entry['src'], 'https://ok/series')


    def test_open_library_volumes_accept_japanese_authors_and_skip_other_printings(self):
        docs = [
            {'title': 'ONE PIECE 1', 'author_name': ['尾田栄一郎'], 'cover_i': 11, 'isbn': ['9781569319017']},
            {'title': 'ONE PIECE 2', 'author_name': ['尾田栄一郎'], 'isbn': ['1569319030']},
            {'title': 'One Piece 3-In-1 Edition 12-book Manga Set 21-32', 'author_name': ['尾田栄一郎'], 'cover_i': 12},
            {'title': 'ONE PIECE 3', 'author_name': ['Somebody Else'], 'cover_i': 13},
            {'title': 'One Piece Deluxe Volume 4', 'author_name': ['尾田栄一郎'], 'cover_i': 14},
            {'title': 'Maximum One Piece 5', 'author_name': ['尾田栄一郎'], 'cover_i': 15},
            {'title': 'ONE PIECE 5‐6', 'author_name': ['尾田栄一郎 (Eiichiro Oda)'], 'cover_i': 16},
            {'title': 'One Piece VIZBIG Edition, Vol. 5', 'author_name': ['尾田栄一郎 (Eiichiro Oda)'], 'cover_i': 17},
            {'title': 'One Piece 6', 'author_name': ['尾田栄一郎 (Eiichiro Oda)'], 'cover_i': 18},
        ]
        orig = covers.get_json
        covers.get_json = lambda url, **kw: {'docs': docs}
        try:
            got = covers.openlibrary_volumes({'title': 'One Piece', 'creator': 'Eiichiro Oda', 'format': 'tankobon'}, [1, 2, 3, 4, 5, 6], lambda m: None)
        finally:
            covers.get_json = orig
        self.assertEqual(sorted(got), ['1', '2', '6'])  # the Japanese-and-Latin author name matches; a range, VIZBIG, deluxe, maximum and mismatched authors don't
        self.assertEqual(got['1'][0], 'https://covers.openlibrary.org/b/id/11-L.jpg?default=false')
        self.assertIn('https://dw9to29mmj727.cloudfront.net/products/1569319014.jpg', got['1'])
        self.assertTrue(got['2'][0].startswith('https://covers.openlibrary.org/b/isbn/1569319030'))


class Warm(unittest.TestCase):
    """tools/warm.mjs asks the CDN for the same links the site builds (it loads assets/js/img.js itself)."""

    @unittest.skipUnless(shutil.which('node'), 'node is not installed')
    def test_links_are_the_sites_own_and_cover_every_slow_host_cover(self):
        out = subprocess.run(['node', str(ROOT / 'tools' / 'warm.mjs'), '--list'], capture_output=True, text=True, check=True).stdout.split()
        data = json.loads((ROOT / 'data' / 'covers.json').read_text(encoding='utf-8'))
        slow = set()
        for e in data.values():
            for s in [e.get('src'), *[(v.get('src') if isinstance(v, dict) else v) for v in (e.get('vols') or {}).values()]]:
                if s and re.match(r'https://(covers\.openlibrary\.org|coverartarchive\.org)/', s):
                    slow.add(s)
        self.assertEqual(len(out), 2 * len(slow))
        self.assertTrue(all(u.startswith('https://wsrv.nl/?url=https%3A%2F%2F') for u in out))
        self.assertFalse(any('default%3Dfalse' in u for u in out))
        self.assertEqual({re.search(r'&w=(\d+)&', u).group(1) for u in out}, {'200', '480'})


class Club(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'node is not installed')
    def test_local_backend_runs_the_whole_interface(self):
        r = subprocess.run(['node', str(ROOT / 'tools' / 'test_club.mjs')], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_every_table_has_row_level_security_and_a_read_policy(self):
        sql = (ROOT / 'supabase' / 'schema.sql').read_text(encoding='utf-8')
        tables = re.findall(r'create table public\.(\w+)', sql)
        self.assertGreaterEqual(len(tables), 8)
        for t in tables:
            self.assertIn(f'alter table public.{t} enable row level security', sql, t)
            self.assertRegex(sql, rf'create policy "[^"]+" on public\.{t} for select', t)

    def test_nothing_in_the_schema_lets_someone_write_as_another_member(self):
        sql = (ROOT / 'supabase' / 'schema.sql').read_text(encoding='utf-8')
        for m in re.finditer(r'create policy "[^"]+" on public\.(\w+) for (insert|update)([^;]*);', sql):
            table, _, rest = m.groups()
            if table in ('list_items',):
                self.assertIn('l.user_id = auth.uid()', rest, table)
            else:
                self.assertRegex(rest, r'(user_id|follower_id|id) = auth\.uid\(\)', table)

    def test_club_is_off_until_a_server_is_named(self):
        cfg = json.loads((ROOT / 'data' / 'club.json').read_text(encoding='utf-8'))
        self.assertEqual((cfg['supabase']['url'], cfg['supabase']['anonKey']), ('', ''))


if __name__ == '__main__':
    unittest.main()
