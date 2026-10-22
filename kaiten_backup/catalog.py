from dataclasses import dataclass


@dataclass(frozen=True)
class Endpoint:
    path: str
    mode: str = 'single'  # single, offset, cursor
    description: str = ''


# Каталог GET-функций. Исполнитель использует только чтение.
CARD = {
    'comments': Endpoint('/cards/{card_id}/comments', 'offset', 'Комментарии'),
    'members': Endpoint('/cards/{card_id}/members', description='Участники карточки'),
    'children': Endpoint('/cards/{card_id}/children', 'offset', 'Дочерние карточки'),
    'links': Endpoint('/cards/{card_id}/external-links', description='Внешние ссылки'),
    'blockers': Endpoint('/cards/{card_id}/blockers', 'offset', 'Блокировки'),
    'time-logs': Endpoint('/cards/{card_id}/time-logs', 'offset', 'Учёт времени'),
    'history': Endpoint('/cards/{card_id}/location-history', description='История перемещений'),
    'activity': Endpoint('/company/activity', 'cursor', 'Лента событий по card_id; нужны права'),
    'baselines': Endpoint('/cards/{card_id}/baselines', description='Базовые планы'),
    'sla': Endpoint('/cards/{card_id}/sla-rules-measurements', description='SLA'),
    'iterations': Endpoint('/cards/{card_uid}/iterations-history', description='История итераций (beta)'),
}
BOARD = {
    'board': Endpoint('/boards/{board_id}', description='Настройки доски'),
    'columns': Endpoint('/boards/{board_id}/columns', description='Колонки и подколонки'),
    'lanes': Endpoint('/boards/{board_id}/lanes', description='Дорожки: активные и архивные'),
    'users': Endpoint('/users', 'offset', 'Доступные пользователи компании'),
    'fields': Endpoint('/company/custom-properties', 'offset', 'Определения пользовательских полей'),
    'types': Endpoint('/card-types', 'offset', 'Типы карточек'),
    'tags': Endpoint('/tags', 'offset', 'Справочник меток'),
}
LOCAL = {'cards': 'Полные JSON карточек (без дополнительных GET)',
         'checklists': 'Чек-листы и их пункты',
         'files': 'Вложения и изображения в тексте'}
FULL = set(CARD) | set(LOCAL) | {'fields', 'types', 'tags'}
ALL = FULL | set(BOARD)
