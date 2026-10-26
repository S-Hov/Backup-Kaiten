import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from urllib.parse import urlencode

from kaiten_viewer.repository import ArchiveRepository
from kaiten_viewer.model import normalize_card
from kaiten_viewer.server import create_server


class ViewerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.snapshot = '2026-10-22_board_7'
        self.copy = self.root / self.snapshot
        self.card = self.copy / 'cards' / '123'
        self.card.mkdir(parents=True)
        (self.copy / 'board').mkdir()
        self.write(self.copy / 'report.json', {'cards_saved': 1, 'files_saved': 1,
                   'board_id': 7, 'issues': [{'task': 'card:123:file:42', 'message': 'Файл недоступен'}]})
        self.write(self.card / 'card.json', {'id': 123, 'title': 'Тестовый заказ',
                   'board_id': 7, 'column_id': 9, 'properties': {'id_5': [11]},
                   'description': '![](https://files.kaiten.ru/image.png)',
                   'files': [{'id': 42, 'name': 'image.png', 'type': 1,
                              'url': 'https://files.kaiten.ru/image.png', 'comment_id': 8}]})
        self.write(self.card / 'comments.json', [{'id': 8, 'text': 'Комментарий'}])
        self.write(self.card / 'extra-future.json', {'unknown': 'preserved'})
        self.write(self.card / 'history.json', [{'id': 1, 'column_id': 9, 'board_id': 7, 'changed': '2026-01-01'}])
        self.write(self.copy / 'board/columns.json', [{'id': 9, 'title': 'Печать'}])
        self.write(self.copy / 'board/fields.json', [{'id': 5, 'type': 'select', 'name': 'Цвет'}])
        self.write(self.copy / 'board/field_values_5.json', [{'id': 11, 'value': 'Синий'}])
        self.write(self.copy / 'board/cards_1.json', [{'id': 123, 'title': 'Тестовый заказ'}])
        self.write(self.card / 'files.json', [{'id': '42', 'name': 'image.png', 'status': 'saved',
                   'path': 'cards/123/files/42_image.png', 'size': 6}])
        (self.card / 'files').mkdir()
        (self.card / 'files/42_image.png').write_bytes(b'abcdef')
        self.repo = ArchiveRepository(self.root)

    def write(self, path, value):
        path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def test_reads_all_json_and_preserves_unknown_sections(self):
        bundle = self.repo.load_card(self.snapshot, 123)
        self.assertIn('extra-future.json', bundle['raw'])
        self.assertEqual(bundle['errors'], ['Файл недоступен'])

    def test_model_resolves_fields_columns_images(self):
        model = normalize_card(self.repo.load_card(self.snapshot, 123), self.repo.dictionaries(self.snapshot))
        self.assertEqual(model['schemaVersion'], 1)
        self.assertEqual(model['card']['column'], 'Печать')
        self.assertEqual(model['sections']['properties'][0]['name'], 'Цвет')
        self.assertEqual(model['sections']['properties'][0]['value'], ['Синий'])
        self.assertEqual(model['imageMap']['https://files.kaiten.ru/image.png'], model['files'][0]['url'])
        self.assertEqual(model['files'][0]['commentId'], 8)
        self.assertIn('extra-future.json', model['raw'])

    def test_corrupt_secondary_json_does_not_hide_card(self):
        (self.card / 'comments.json').write_text('corrupt', encoding='utf-8')
        bundle = self.repo.load_card(self.snapshot, 123)
        self.assertEqual(bundle['raw']['card.json']['id'], 123)
        self.assertIn('Не удалось прочитать comments.json', bundle['errors'])

    def test_missing_and_empty_sections_are_distinct(self):
        self.write(self.copy / 'report.json', {'selected': ['comments', 'activity']})
        self.write(self.card / 'comments.json', [])
        bundle = self.repo.load_card(self.snapshot, 123)
        model = normalize_card(bundle, self.repo.dictionaries(self.snapshot))
        self.assertEqual(model['sectionStatus']['comments'], 'empty')
        self.assertEqual(model['sectionStatus']['activity'], 'missing')
        self.assertIn('Раздел «activity» не сохранён или не читается', model['diagnostics'])

    def test_search_by_number_and_title(self):
        self.assertEqual(self.repo.search(self.snapshot, '#123')['total'], 1)
        self.assertEqual(self.repo.search(self.snapshot, 'тестовый')['total'], 1)
        self.assertEqual(self.repo.search(self.snapshot, '999')['total'], 0)

    def test_path_escape_is_rejected(self):
        with self.assertRaises(ValueError):
            self.repo.load_card('../outside', 123)
        with self.assertRaises(ValueError):
            self.repo.load_card(self.snapshot, '../123')
        self.write(self.card / 'files.json', [{'status': 'saved', 'path': '../../.env'}])
        with self.assertRaises(FileNotFoundError):
            self.repo.asset_path(self.snapshot, 123, 0)

    def test_http_card_assets_range_and_no_secret_route(self):
        server = create_server(self.repo, 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(base + '/api/cards/123?' + urlencode({'snapshot': self.snapshot})) as r:
                self.assertEqual(json.load(r)['card']['title'], 'Тестовый заказ')
                self.assertIn("connect-src 'self'", r.headers['Content-Security-Policy'])
            with urlopen(Request(base + f'/assets/{self.snapshot}/123/0', headers={'Range': 'bytes=1-3'})) as r:
                self.assertEqual(r.status, 206)
                self.assertEqual(r.read(), b'bcd')
            for path in ('/.env', '/config.toml', '/api/cards/999?snapshot=' + self.snapshot):
                with self.assertRaises(HTTPError) as err:
                    urlopen(base + path)
                self.assertEqual(err.exception.code, 404)
            with self.assertRaises(HTTPError) as err:
                urlopen(Request(base + '/api/snapshots', headers={'Host': 'evil.example'}))
            self.assertEqual(err.exception.code, 403)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
