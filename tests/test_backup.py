import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from kaiten_backup.client import Client, BackupError
from kaiten_backup.storage import Store, without_signed_urls
from kaiten_backup.files import FileExporter, walk_files
from kaiten_backup.exporter import Exporter
from kaiten_backup.config import load_config
from backup import main

PERF = dict(requests_per_second=50, min_interval_seconds=0, page_size=2,
            timeout_seconds=1, retries=1, backoff_seconds=.001, max_backoff_seconds=.001)


class Response(io.BytesIO):
    def __init__(self, body=b'', headers=None):
        super().__init__(body)
        self.headers = headers or {}


class ClientTests(unittest.TestCase):
    def client(self):
        c = Client('https://example.kaiten.ru', 'SECRET', PERF)
        c.pace = lambda: None
        return c

    def test_pagination_uses_applied_limit(self):
        c = self.client()
        with patch.object(c, 'json', side_effect=[([{'id': 1}], {'X-Pagination-Limit': '1'}),
                                                  ([{'id': 2}], {'X-Pagination-Limit': '1'}),
                                                  ([], {'X-Pagination-Limit': '1'})]) as get:
            self.assertEqual(len(c.fetch('/cards', 'offset')), 2)
            self.assertEqual([x.args[1]['offset'] for x in get.call_args_list], [0, 1, 2])

    def test_repeated_page_is_error(self):
        c = self.client()
        with patch.object(c, 'json', return_value=([{'id': 1}, {'id': 2}], {})):
            with self.assertRaises(BackupError):
                c.fetch('/cards', 'offset')

    def test_cursor_keeps_filters(self):
        c = self.client()
        with patch.object(c, 'json', side_effect=[({'items': [{'id': '1'}], 'next_cursor': 'abc'}, {}),
                                                 ({'items': [], 'next_cursor': None}, {})]) as get:
            self.assertEqual(len(c.fetch('/company/activity', 'cursor', {'card_id': 42})), 1)
            self.assertEqual(get.call_args_list[1].args[1]['card_id'], 42)
            self.assertEqual(get.call_args_list[1].args[1]['cursor'], 'abc')

    def test_bearer_not_forwarded_to_redirect(self):
        c = self.client()
        redirect = HTTPError('https://example.kaiten.ru/api/v1/x', 302, '',
                             {'Location': 'https://storage.example/file'}, None)
        with patch.object(c.opener, 'open', side_effect=[redirect, Response(b'ok')]) as get:
            with c.open(c.base + '/x', authenticated=True) as r:
                self.assertEqual(r.read(), b'ok')
            self.assertEqual(get.call_args_list[0].args[0].get_header('Authorization'), 'Bearer SECRET')
            self.assertIsNone(get.call_args_list[1].args[0].get_header('Authorization'))

    def test_retry_429(self):
        c = self.client()
        err = HTTPError(c.base, 429, '', {'Retry-After': '0'}, None)
        with patch.object(c.opener, 'open', side_effect=[err, Response(b'{}')]) as get:
            self.assertEqual(c.json('/x')[0], {})
            self.assertEqual(get.call_count, 2)

    def test_reject_http_redirect(self):
        c = self.client()
        err = HTTPError(c.base, 302, '', {'Location': 'http://example.com/f'}, None)
        with patch.object(c.opener, 'open', side_effect=[err]):
            with self.assertRaises(BackupError):
                c.open(c.base + '/x', authenticated=True)


class BackupTests(unittest.TestCase):
    def test_space_url_can_list_boards_without_board_id(self):
        with tempfile.TemporaryDirectory() as d:
            cfg = Path(d) / 'config.toml'
            cfg.write_text('[kaiten]\nboard_url="https://company.kaiten.ru/space/169965/boards"\nboard_id=0\n', encoding='utf-8')
            value = load_config(cfg, require_token=False, require_board=False)
            self.assertEqual(value['kaiten']['space_id'], 169965)
            with self.assertRaisesRegex(ValueError, '--list-boards'):
                load_config(cfg, require_token=False)

    def test_list_boards_prints_board_ids(self):
        with tempfile.TemporaryDirectory() as d:
            cfg = Path(d) / 'config.toml'
            cfg.write_text('[kaiten]\nboard_url="https://company.kaiten.ru/space/169965/boards"\n', encoding='utf-8')
            with patch.dict('os.environ', {'KAITEN_API_TOKEN': 'TEST'}):
                with patch.object(Client, 'fetch', return_value=[{'id': 7, 'board_id': 7, 'title': 'Orders'}]) as fetch:
                    with patch('sys.stdout', new_callable=io.StringIO) as output:
                        self.assertEqual(main(['--config', str(cfg), '--list-boards']), 0)
                    self.assertIn('board_id = 7', output.getvalue())
                    fetch.assert_called_once_with('/spaces/169965/boards')

    def test_resume_detects_corrupt_json(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / 'snapshot'
            s = Store(root, {'board': 1})
            s.json('x', 'x.json', lambda: {'original': 1})
            (root / 'x.json').write_text('broken')
            s = Store(root, {'board': 1}, resume=True)
            self.assertEqual(s.json('x', 'x.json', lambda: {'reloaded': 1}), {'reloaded': 1})
            with self.assertRaises(ValueError):
                Store(root, {'board': 2}, resume=True)

    def test_signed_links_removed_but_ordinary_urls_retained(self):
        value = {'files': [{'id': 'uid', 'type': 11, 'url': 'TEMP_SECRET'},
                           {'id': 1, 'type': 1, 'url': 'https://files.kaiten.ru/a'}]}
        clean = without_signed_urls(value)
        self.assertNotIn('TEMP_SECRET', json.dumps(clean))
        self.assertEqual(clean['files'][1]['url'], 'https://files.kaiten.ru/a')

    def test_comment_and_property_context(self):
        data = {'comments': [{'uid': 'comment-uid', 'files': [{'id': 'f', 'name': 'x', 'type': 11}]}],
                'properties': {'id_5': [{'id': 'g', 'name': 'y', 'type': 11}]}}
        found = list(walk_files(data))
        self.assertEqual(found[0][1]['comment_uid'], 'comment-uid')
        self.assertEqual(found[1][1]['property_id'], '5')

    def test_protected_file_uses_comment_uid_and_has_checksum(self):
        with tempfile.TemporaryDirectory() as d:
            store = Store(Path(d) / 'copy', {})
            client = Client('https://example.kaiten.ru', 'SECRET', PERF)
            issues = []
            files = FileExporter(client, store, {}, lambda *x: issues.append(x))
            card = {'id': 1, 'uid': 'card-uid', 'files': [dict(id='file-uid', type=11,
                    entity_type='comment', comment_id=5, name='../../x.png', size=3)]}
            with patch.object(client, 'json', return_value=({'url': 'https://store.example/signed'}, {})) as get:
                with patch.object(client, 'open', return_value=Response(b'abc', {'Content-Length': '3'})):
                    entries = files.export(card, {'comments': [{'id': 5, 'uid': 'comment-uid'}]}, [])
            self.assertEqual(get.call_args.args[0], '/cards/card-uid/comments/comment-uid/files/file-uid')
            self.assertFalse(issues)
            self.assertEqual(entries[0]['status'], 'saved')
            self.assertEqual(len(entries[0]['sha256']), 64)
            self.assertTrue((store.root / entries[0]['path']).is_relative_to(store.root))

    def test_failed_download_not_committed(self):
        with tempfile.TemporaryDirectory() as d:
            store = Store(Path(d) / 'copy', {})
            client = Client('https://example.kaiten.ru', 'SECRET', dict(PERF, retries=0))
            files = FileExporter(client, store, {}, lambda *x: None)
            with patch.object(client, 'open', return_value=Response(b'x', {'Content-Length': '3'})):
                with self.assertRaises(BackupError):
                    files.download('x', 'https://files.kaiten.ru/x', 'files/x')
            self.assertNotIn('x', store.state['completed'])
            self.assertFalse((store.root / 'files/x').exists())

    def test_run_with_archives_and_error_reports_partial(self):
        with tempfile.TemporaryDirectory() as d:
            cfg = {'kaiten': {'board_id': 10, 'origin': 'https://example.kaiten.ru'},
                   'backup': {'include_archived': True, 'follow_related': False, 'max_related_cards': 10}}
            store = Store(Path(d) / 'copy', {})
            client = Client(cfg['kaiten']['origin'], 'SECRET', PERF)
            def fetch(path, mode='single', params=None):
                if path == '/cards':
                    return [{'id': params['condition']}]
                if path.endswith('/comments'):
                    raise BackupError('HTTP 403')
                return {'id': int(path.rsplit('/', 1)[1]), 'title': '<script>bad</script>', 'description': 'text'}
            with patch.object(client, 'fetch', side_effect=fetch):
                report = Exporter(client, store, cfg, {'cards', 'comments'}).run()
            self.assertEqual(report['status'], 'partial')
            self.assertEqual(report['cards_saved'], 2)
            self.assertEqual(len(report['issues']), 2)
            self.assertIn('&lt;script&gt;', (store.root / 'cards/1/index.html').read_text(encoding='utf-8'))

    def test_plan_does_not_need_token_or_network(self):
        with tempfile.TemporaryDirectory() as d:
            cfg = Path(d) / 'config.toml'
            cfg.write_text('[kaiten]\nboard_url="https://company.kaiten.ru/space/3/boards/7"\n')
            with patch.object(Client, 'open', side_effect=AssertionError('network')):
                self.assertEqual(main(['--config', str(cfg), '--all', '--plan']), 0)
            self.assertEqual(load_config(cfg, require_token=False)['kaiten']['board_id'], 7)


if __name__ == '__main__':
    unittest.main()
