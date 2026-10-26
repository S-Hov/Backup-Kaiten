from backend.app.domain.ports import AttachmentStorage, CardRepository
from backend.app.presentation.card_model import normalize_card


class CardService:
    def __init__(self, repository: CardRepository, attachments: AttachmentStorage):
        self.repository = repository
        self.attachments = attachments

    def snapshots(self):
        return self.repository.snapshots()

    def search(self, snapshot, query, offset, limit):
        return self.repository.search(snapshot, query, offset, limit)

    def get_card(self, snapshot, card_id):
        bundle = self.repository.load_card(snapshot, card_id)
        return normalize_card(bundle, self.repository.dictionaries(snapshot))

    def get_attachment(self, snapshot, card_id, index):
        return self.attachments.asset_path(snapshot, card_id, index)
