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

    def test_album_pick_prefers_the_right_record(self):
        it = {'title': 'Kid A', 'creator': 'Radiohead', 'year': 2000}
        res = [
            {'collectionName': 'Kid A Mnesia', 'artistName': 'Radiohead', 'releaseDate': '2021-11-05', 'artworkUrl100': 'https://x/mn/100x100bb.jpg'},
            {'collectionName': 'Kid A', 'artistName': 'Radiohead', 'releaseDate': '2000-10-02', 'artworkUrl100': 'https://x/ka/100x100bb.jpg'},
            {'collectionName': 'Kid A', 'artistName': 'Tribute Band', 'releaseDate': '2015-01-01', 'artworkUrl100': 'https://x/tb/100x100bb.jpg'},
        ]
        hit = covers.choose_album(it, res)
        self.assertEqual(hit['url'], 'https://x/ka/1000x1000bb.jpg')

    def test_album_pick_refuses_a_weak_match(self):
        it = {'title': 'Roja', 'creator': 'A. R. Rahman', 'year': 1992}
        res = [{'collectionName': 'Greatest Hits', 'artistName': 'Someone Else', 'releaseDate': '2004', 'artworkUrl100': 'https://x/100x100bb.jpg'}]
        self.assertIsNone(covers.choose_album(it, res))

    def test_film_pick_uses_year(self):
        it = {'title': 'Oldboy', 'creator': 'Park Chan-wook', 'year': 2003}
        res = [
            {'trackName': 'Oldboy', 'artistName': 'Spike Lee', 'releaseDate': '2013-11-27', 'artworkUrl100': 'https://x/2013/100x100bb.jpg'},
            {'trackName': 'Oldboy', 'artistName': 'Park Chan-wook', 'releaseDate': '2003-11-21', 'artworkUrl100': 'https://x/2003/100x100bb.jpg'},
        ]
        self.assertEqual(covers.choose_film(it, res)['url'], 'https://x/2003/600x900bb.jpg')

    def test_anilist_matches_on_native_title(self):
        it = {'title': 'Spirited Away', 'original': '千と千尋の神隠し', 'creator': 'Studio Ghibli', 'year': 2001}
        res = [
            {'title': {'english': 'Spirited Away', 'romaji': 'Sen to Chihiro no Kamikakushi', 'native': '千と千尋の神隠し'},
             'startDate': {'year': 2001}, 'coverImage': {'extraLarge': 'https://img/sa.jpg'}, 'studios': {'nodes': [{'name': 'Studio Ghibli'}]}},
            {'title': {'english': 'Howl’s Moving Castle', 'romaji': 'Hauru no Ugoku Shiro', 'native': 'ハウルの動く城'},
             'startDate': {'year': 2004}, 'coverImage': {'extraLarge': 'https://img/howl.jpg'}, 'studios': {'nodes': [{'name': 'Studio Ghibli'}]}},
        ]
        self.assertEqual(covers.choose_anilist(it, 'anime', res)['url'], 'https://img/sa.jpg')

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
