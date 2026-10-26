import json
import tempfile
import unittest
from pathlib import Path
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from backend.app.application.import_archive import import_archive
from backend.app.cli import migrate
from backend.app.core.settings import Settings, PROJECT_ROOT
from backend.app.infrastructure.archive.repository import ArchiveRepository
from backend.app.infrastructure.database.connection import make_engine
from backend.app.infrastructure.database.models import Base
from backend.app.infrastructure.database.repository import SqlCardRepository
from backend.app.main import create_app


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.backups = root / 'backups'
        self.snapshot = 'snapshot_1'
        card = self.backups / self.snapshot / 'cards/123'
        card.mkdir(parents=True)
        (card.parent.parent / 'board').mkdir()
        def write(path, data):
            path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        write(card / 'card.json', {'id': 123, 'title': 'Заказ СИНИЙ 10%', 'column_id': 5})
        write(card / 'files.json', [])
        write(card / 'comments.json', [{'id': 1, 'text': 'Комментарий'}])
        write(card / 'unknown.json', {'keep': True})
        write(card.parent.parent / 'report.json', {'cards_saved': 1, 'files_saved': 0, 'status': 'complete_for_selected_scope', 'issues': []})
        self.source = ArchiveRepository(self.backups)
        self.url = f'sqlite:///{(root / "test.db").as_posix()}'
        migrate(self.url)
        self.engine = make_engine(self.url)
        self.repo = SqlCardRepository(self.engine)

    def tearDown(self):
        self.engine.dispose()
        self.temp.cleanup()

    def test_migration_matches_models_and_is_repeatable(self):
        migrate(self.url)
        with self.engine.connect() as connection:
            self.assertEqual(compare_metadata(MigrationContext.configure(connection), Base.metadata), [])
        self.assertEqual(PROJECT_ROOT, Path(__file__).resolve().parents[1])

    def test_import_preserves_all_json_and_is_idempotent(self):
        first = import_archive(self.source, self.repo, self.snapshot)
        second = import_archive(self.source, self.repo, self.snapshot)
        self.assertEqual(first['saved'], 1)
        self.assertEqual(second['total_in_database'], 1)
        self.assertEqual(self.source.load_card(self.snapshot, 123)['raw'],
                         self.repo.load_card(self.snapshot, 123)['raw'])

    def test_database_search_casefold_literal_percent_and_pagination(self):
        import_archive(self.source, self.repo, self.snapshot)
        self.assertEqual(self.repo.search(self.snapshot, 'синий')['total'], 1)
        self.assertEqual(self.repo.search(self.snapshot, '%')['total'], 1)
        self.assertEqual(self.repo.search(self.snapshot, '99%')['total'], 0)
        self.assertEqual(self.repo.search(self.snapshot, '#123')['total'], 1)
        self.assertEqual(self.repo.search(self.snapshot, '', offset=1)['items'], [])

    def test_database_uses_same_http_contract_and_storage(self):
        import_archive(self.source, self.repo, self.snapshot)
        app = create_app(Settings(backup_root=self.backups, storage='database', database_url=self.url))
        with TestClient(app, base_url='http://127.0.0.1') as client:
            response = client.get('/api/v1/cards/123', params={'snapshot': self.snapshot})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['card']['id'], 123)
            self.assertEqual(response.json()['source']['origin'], 'database')
            self.assertIn('unknown.json', response.json()['raw'])
            self.assertEqual(client.get('/api/v1/cards/999', params={'snapshot': self.snapshot}).status_code, 404)

    def test_missing_card_import_is_reported_without_deleting_source(self):
        result = import_archive(self.source, self.repo, self.snapshot, [123, 999])
        self.assertEqual(result['total_in_database'], 1)
        self.assertEqual(len(result['issues']), 1)
        self.assertTrue((self.backups / self.snapshot / 'cards/123/card.json').exists())
        self.assertEqual(self.repo.snapshots()[0]['status'], 'partial')


if __name__ == '__main__':
    unittest.main()
