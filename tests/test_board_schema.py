"""Working schema invariants; fixtures only, no real archive import."""
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.cli import migrate
from backend.app.infrastructure.database.connection import make_engine
from backend.app.infrastructure.database.models import ArchiveSnapshot
from backend.app.infrastructure.database.board_models import (
    Attachment, Board, Card, CardRelation, Column, Comment, FileObject, Lane,
    SourceInstance, User,
)


class BoardSchemaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.url = f'sqlite:///{(Path(self.temp.name) / "schema.db").as_posix()}'
        migrate(self.url)
        self.engine = make_engine(self.url)
        with Session(self.engine) as session, session.begin():
            self.a, self.b = uuid4(), uuid4()
            session.add_all([Board(id=self.a, title='A'), Board(id=self.b, title='B')])
            session.flush()
            self.column, self.lane = uuid4(), uuid4()
            session.add_all([Column(id=self.column, board_id=self.a), Lane(id=self.lane, board_id=self.a)])

    def tearDown(self):
        self.engine.dispose()
        self.temp.cleanup()

    def test_card_column_and_lane_must_belong_to_its_board(self):
        for location in ({'column_id': self.column}, {'lane_id': self.lane}):
            with self.subTest(location=location), self.assertRaises(IntegrityError):
                with Session(self.engine) as session, session.begin():
                    session.add(Card(board_id=self.b, **location))
        with Session(self.engine) as session, session.begin():
            session.add(Card(board_id=self.a, column_id=self.column, lane_id=self.lane))

    def test_parent_column_cannot_belong_to_another_board_or_itself(self):
        for kwargs in ({'board_id': self.b, 'parent_column_id': self.column},
                       {'id': self.column, 'board_id': self.a, 'parent_column_id': self.column}):
            with self.subTest(kwargs=kwargs), self.assertRaises(IntegrityError):
                with Session(self.engine) as session, session.begin():
                    if 'id' in kwargs:
                        session.get(Column, self.column).parent_column_id = self.column
                    else:
                        session.add(Column(**kwargs))

    def test_source_id_is_unique_per_instance_and_local_ids_are_independent(self):
        with Session(self.engine) as session, session.begin():
            one, two = SourceInstance(origin='https://one.kaiten.ru'), SourceInstance(origin='https://two.kaiten.ru')
            session.add_all([one, two]); session.flush()
            self.source = one.id
            session.add_all([Card(board_id=self.a, source_instance_id=one.id, source_id=123, source_version=99),
                            Card(board_id=self.a, source_instance_id=two.id, source_id=123),
                            Card(board_id=self.a), Card(board_id=self.a)])
        with Session(self.engine) as session:
            rows = list(session.scalars(select(Card)))
            self.assertEqual(len({row.id for row in rows}), 4)
            self.assertEqual(next(row for row in rows if row.source_version == 99).local_version, 1)
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session, session.begin():
                session.add(Card(board_id=self.a, source_instance_id=self.source, source_id=123))

    def test_attachment_cannot_reference_comment_of_another_card(self):
        with Session(self.engine) as session, session.begin():
            one, two = Card(board_id=self.a), Card(board_id=self.a)
            session.add_all([one, two]); session.flush()
            comment = Comment(card_id=one.id, text='Original')
            session.add(comment); session.flush()
            comment_id, card_id = comment.id, two.id
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session, session.begin():
                session.add(Attachment(card_id=card_id, comment_id=comment_id, name='Wrong owner'))

    def test_references_prevent_destructive_user_delete_and_self_relation(self):
        with Session(self.engine) as session, session.begin():
            person = User(full_name='User'); session.add(person); session.flush()
            card = Card(board_id=self.a, owner_id=person.id); session.add(card); session.flush()
            uid, cid = person.id, card.id
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session, session.begin():
                session.delete(session.get(User, uid))
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session, session.begin():
                session.add(CardRelation(parent_card_id=cid, child_card_id=cid))

    def test_file_size_cannot_be_negative(self):
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session, session.begin():
                session.add(FileObject(storage_key='test', size=-1))

    def test_schema_downgrade_and_upgrade_preserve_archive(self):
        with Session(self.engine) as session, session.begin():
            session.add(ArchiveSnapshot(id='keep', summary={'status': 'partial'}, dictionaries={'unknown': 'kept'}))
        config = Config('alembic.ini'); config.attributes['database_url'] = self.url
        command.downgrade(config, '0001_archive')
        migrate(self.url)
        with Session(self.engine) as session:
            self.assertEqual(session.get(ArchiveSnapshot, 'keep').dictionaries, {'unknown': 'kept'})


if __name__ == '__main__':
    unittest.main()
