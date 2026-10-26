from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .models import ArchiveCard, ArchiveSnapshot


class SqlCardRepository:
    def __init__(self, engine):
        self.engine = engine

    @staticmethod
    def require_snapshot(session, snapshot):
        row = session.get(ArchiveSnapshot, snapshot)
        if row is None:
            raise FileNotFoundError('Копия не найдена в базе данных')
        return row

    def snapshots(self):
        with Session(self.engine) as session:
            return [s.summary for s in session.scalars(select(ArchiveSnapshot).order_by(ArchiveSnapshot.id.desc()))]

    def dictionaries(self, snapshot):
        with Session(self.engine) as session:
            return self.require_snapshot(session, snapshot).dictionaries

    def load_card(self, snapshot, card_id):
        with Session(self.engine) as session:
            self.require_snapshot(session, snapshot)
            row = session.get(ArchiveCard, (snapshot, card_id))
            if row is None:
                raise FileNotFoundError('Карточка не найдена в базе данных')
            return {'snapshot': snapshot, 'raw': row.raw, 'errors': row.diagnostics, 'origin': 'database'}

    def search(self, snapshot, query='', offset=0, limit=40):
        query = query.strip().lstrip('#').casefold()
        with Session(self.engine) as session:
            self.require_snapshot(session, snapshot)
            filters = [ArchiveCard.snapshot_id == snapshot]
            if query:
                filters.append(ArchiveCard.search_text.contains(query, autoescape=True))
            total = session.scalar(select(func.count()).select_from(ArchiveCard).where(*filters))
            rows = session.scalars(select(ArchiveCard).where(*filters).order_by(
                ArchiveCard.card_id.desc()).offset(offset).limit(limit))
            items = [dict(id=r.card_id, title=r.title, archived=r.archived,
                          columnId=r.column_id, updated=r.updated) for r in rows]
            return dict(items=items, total=total, offset=offset, limit=limit)

    def save_snapshot(self, summary, dictionaries):
        with Session(self.engine) as session, session.begin():
            session.merge(ArchiveSnapshot(id=summary['id'], summary=summary, dictionaries=dictionaries))

    def save_cards(self, snapshot, bundles):
        """One transaction per batch. Repeating an import updates existing keys."""
        with Session(self.engine) as session, session.begin():
            self.require_snapshot(session, snapshot)
            for bundle in bundles:
                c = bundle['raw']['card.json']
                session.merge(ArchiveCard(snapshot_id=snapshot, card_id=c['id'],
                    title=c.get('title') or '', archived=bool(c.get('archived')),
                    column_id=c.get('column_id'), updated=c.get('updated'),
                    search_text=f'{c["id"]}\n{c.get("title") or ""}'.casefold(),
                    raw=bundle['raw'], diagnostics=bundle.get('errors', [])))

    def count(self, snapshot):
        with Session(self.engine) as session:
            return session.scalar(select(func.count()).select_from(ArchiveCard).where(
                ArchiveCard.snapshot_id == snapshot))
