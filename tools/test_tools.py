"""Offline tests for the data helpers and cover matching. Run: python3 -m unittest discover -s tools"""
import sys
import unittest
from pathlib import Path

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


class Matching(unittest.TestCase):
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

    def test_myanimelist_matches_native_title_and_year(self):
        it = {'title': 'Ghost in the Shell', 'original': '攻殻機動隊', 'year': 1995}
        res = [
            {'title': 'Koukaku Kidoutai: Stand Alone Complex', 'title_english': 'Ghost in the Shell: Stand Alone Complex',
             'title_japanese': '攻殻機動隊 STAND ALONE COMPLEX', 'year': 2002, 'images': {'jpg': {'large_image_url': 'https://cdn/sac.jpg'}}},
            {'title': 'Koukaku Kidoutai', 'title_english': 'Ghost in the Shell', 'title_japanese': '攻殻機動隊',
             'aired': {'prop': {'from': {'year': 1995}}}, 'images': {'jpg': {'large_image_url': 'https://cdn/gits.jpg'}}},
        ]
        self.assertEqual(covers.choose_jikan(it, res)['url'], 'https://cdn/gits.jpg')



    def test_volume_covers_prefer_japanese_and_skip_unowned(self):
        cov = [
            {'attributes': {'volume': '1', 'locale': 'en', 'fileName': 'en1.jpg'}},
            {'attributes': {'volume': '1', 'locale': 'ja', 'fileName': 'ja1.jpg'}},
            {'attributes': {'volume': '2', 'locale': 'fr', 'fileName': 'fr2.jpg'}},
            {'attributes': {'volume': '9', 'locale': 'ja', 'fileName': 'ja9.jpg'}},
            {'attributes': {'volume': None, 'locale': 'ja', 'fileName': 'x.jpg'}},
        ]
        self.assertEqual(covers.choose_volume_covers(cov, {1, 2}), {'1': 'ja1.jpg', '2': 'fr2.jpg'})
        self.assertEqual(covers.choose_volume_covers(cov, {1}, prefer='en'), {'1': 'en1.jpg'})


if __name__ == '__main__':
    unittest.main()
