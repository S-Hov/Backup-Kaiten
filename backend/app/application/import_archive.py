"""Explicit, repeatable import. Original files and JSON are never modified."""


def import_archive(source, target, snapshot, card_ids=None, batch_size=100):
    summary = next((s for s in source.snapshots() if s['id'] == snapshot), None)
    if summary is None:
        raise FileNotFoundError('Исходная копия не найдена')
    summary = dict(summary)
    source_status = summary['status']
    summary['status'] = 'importing'
    dictionaries = source.dictionaries(snapshot)
    target.save_snapshot(summary, dictionaries)
    ids = card_ids if card_ids else [c['id'] for c in source.index(snapshot)]
    batch, issues, saved = [], [], 0
    for cid in ids:
        try:
            batch.append(source.load_card(snapshot, cid))
        except (OSError, ValueError) as error:
            issues.append({'card_id': cid, 'error': type(error).__name__})
            continue
        if len(batch) >= batch_size:
            target.save_cards(snapshot, batch)
            saved += len(batch)
            batch.clear()
    if batch:
        target.save_cards(snapshot, batch)
        saved += len(batch)
    summary['cards'] = target.count(snapshot)
    summary['status'] = 'partial' if issues else 'limited' if card_ids else source_status
    summary['issues'] = summary.get('issues', 0) + len(issues)
    target.save_snapshot(summary, dictionaries)
    return {'saved': saved, 'total_in_database': summary['cards'], 'issues': issues}
