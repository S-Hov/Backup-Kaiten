"""Local card editing and searchable catalogs. No external Kaiten calls."""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import uuid5
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException
from . import board_models as m
from .avatar_models import UserAvatar, avatar_url


def real_board(session, board_id):
    board = session.scalar(select(m.Board).where(m.Board.id == board_id, m.Board.is_stub.is_(False)).with_for_update())
    if board is None:
        raise FileNotFoundError('Доска не найдена')
    return board


def edit_options(engine, board_id):
    with Session(engine) as session:
        real_board(session, board_id)
        tags = session.scalars(select(m.Tag).where(m.Tag.is_stub.is_(False), m.Tag.archived.is_(False)).order_by(m.Tag.name, m.Tag.id))
        users = session.execute(select(m.User, UserAvatar).outerjoin(UserAvatar, UserAvatar.user_id == m.User.id)
            .where(m.User.is_stub.is_(False), m.User.activated.is_(True)).order_by(m.User.full_name, m.User.id))
        types = session.scalars(select(m.CardType).where(m.CardType.is_stub.is_(False), m.CardType.archived.is_(False)).order_by(m.CardType.name, m.CardType.id))
        properties = list(session.scalars(select(m.CustomProperty).where(m.CustomProperty.is_stub.is_(False), m.CustomProperty.archived.is_(False)).order_by(m.CustomProperty.name)))
        options = list(session.scalars(select(m.PropertyOption).where(m.PropertyOption.is_stub.is_(False)).order_by(m.PropertyOption.sort_order, m.PropertyOption.id)))
        return {
            'tags': [{'id': tag.id, 'name': tag.name, 'color': tag.color} for tag in tags],
            'users': [{'id': user.id, 'name': user.full_name or user.username or 'Участник', 'avatarUrl': avatar_url(user.id, avatar)} for user, avatar in users],
            'types': [{'id': item.id, 'name': item.name} for item in types],
            'properties': [{'id': prop.id, 'name': prop.name, 'type': prop.type,
                'options': [{'id': str(opt.source_id) if opt.source_id is not None else str(opt.id), 'name': opt.label}
                            for opt in options if opt.property_id == prop.id]} for prop in properties],
        }


def create_tag(engine, board_id, name, request_id):
    with Session(engine) as session, session.begin():
        real_board(session, board_id)
        identifier = uuid5(board_id, f'local-tag:{request_id}')
        tag = session.get(m.Tag, identifier)
        if tag and tag.name != name:
            raise ValueError('Этот запрос уже использован для другого тега')
        if tag is None:
            tag = next((item for item in session.scalars(select(m.Tag).where(m.Tag.is_stub.is_(False), m.Tag.archived.is_(False)))
                        if item.name.casefold() == name.casefold()), None)
        if tag is None:
            tag = m.Tag(id=identifier, name=name)
            session.add(tag)
        return {'id': tag.id, 'name': tag.name, 'color': tag.color}


def validate_ids(session, model, identifiers, label):
    identifiers = set(identifiers)
    valid = set(session.scalars(select(model.id).where(model.id.in_(identifiers), model.is_stub.is_(False))))
    if valid != identifiers:
        raise ValueError(f'{label}: выбранное значение больше недоступно')


def update_card(engine, card_id, version, changes, actor=None):
    with Session(engine) as session, session.begin():
        card = session.scalar(select(m.Card).where(m.Card.id == card_id).with_for_update())
        if card is None or card.is_stub or card.deleted_at is not None:
            raise FileNotFoundError('Карточка не найдена')
        if card.local_version != version:
            raise HTTPException(409, 'Карточка уже изменилась. Введённые данные остались в поле. Обновите карточку и повторите изменение')
        if card.archived:
            raise ValueError('Архивную карточку нельзя редактировать')
        fields = {'title': ('title', 'Название'), 'description': ('description', 'Описание'),
                  'asap': ('asap', 'Срочно'), 'dueDate': ('due_date', 'Срок'), 'typeId': ('type_id', 'Тип'),
                  'sizeText': ('size_text', 'Размер'), 'size': ('size', 'Размер'), 'sizeUnit': ('size_unit', 'Единица размера'),
                  'externalId': ('external_id', 'Внешний ID'), 'plannedStart': ('planned_start', 'Плановое начало'),
                  'plannedEnd': ('planned_end', 'Плановое окончание'), 'completedAt': ('completed_at', 'Завершена')}
        changed = []
        if changes.get('typeId') is not None:
            validate_ids(session, m.CardType, [changes['typeId']], 'Тип')
        for name, (attribute, label) in fields.items():
            if name not in changes:
                continue
            value = changes[name]
            if name == 'size' and value is not None:
                try:
                    value = Decimal(value)
                    if not value.is_finite() or abs(value) >= Decimal(10) ** 20:
                        raise ValueError()
                except (ValueError, InvalidOperation):
                    raise ValueError('Укажите корректный размер')
            previous = getattr(card, attribute)
            if isinstance(previous, datetime) and previous.tzinfo is None:
                previous = previous.replace(tzinfo=timezone.utc)
            if previous != value:
                setattr(card, attribute, value)
                changed.append(label)
                if name == 'dueDate':
                    card.due_date_time_present = value is not None
        # Keep omitted relations untouched, and replace each submitted selection atomically.
        for name, link, field, model, label in (
            ('tagIds', m.CardTag, 'tag_id', m.Tag, 'Теги'),
            ('subscriberIds', m.CardSubscriber, 'user_id', m.User, 'Подписчики')):
            if name in changes:
                identifiers = set(changes[name])
                validate_ids(session, model, identifiers, label)
                previous = set(session.scalars(select(getattr(link, field)).where(link.card_id == card_id)))
                if previous != identifiers:
                    session.execute(delete(link).where(link.card_id == card_id))
                    session.add_all([link(card_id=card_id, **{field: item}) for item in identifiers])
                    changed.append(label)
        if 'members' in changes:
            members = changes['members']
            if len({item['id'] for item in members}) != len(members):
                raise ValueError('Участник выбран несколько раз')
            if sum(item.get('role', 1) == 2 for item in members) > 1:
                raise ValueError('Выберите одного ответственного')
            validate_ids(session, m.User, [item['id'] for item in members], 'Участники')
            previous = set(session.execute(select(m.CardMember.user_id, m.CardMember.role).where(m.CardMember.card_id == card_id)))
            desired = {(item['id'], item.get('role', 1)) for item in members}
            if previous != desired:
                session.execute(delete(m.CardMember).where(m.CardMember.card_id == card_id))
                session.add_all([m.CardMember(card_id=card_id, user_id=identifier, role=role) for identifier, role in desired])
                changed.append('Участники')
        for item in changes.get('properties', []):
            prop = session.get(m.CustomProperty, item['id'])
            if prop is None or prop.is_stub or prop.archived:
                raise ValueError('Поле больше недоступно')
            value = item['value']
            options = list(session.scalars(select(m.PropertyOption).where(m.PropertyOption.property_id == prop.id, m.PropertyOption.is_stub.is_(False))))
            if options and value is not None:
                allowed = {str(opt.source_id) if opt.source_id is not None else str(opt.id) for opt in options}
                if any(str(entry) not in allowed for entry in (value if isinstance(value, list) else [value])):
                    raise ValueError('Выберите значение из списка')
            elif value is not None:
                kind = prop.type.casefold()
                if kind in ('number', 'numeric') and (type(value) not in (int, float) or not Decimal(str(value)).is_finite()):
                    raise ValueError('Укажите число')
                if kind in ('boolean', 'checkbox') and not isinstance(value, bool):
                    raise ValueError('Выберите да или нет')
                if not isinstance(value, (str, bool, int, float, list, dict)):
                    raise ValueError('Неверное значение поля')
            existing = session.get(m.CardPropertyValue, (card_id, prop.id))
            if value is None:
                if existing:
                    session.delete(existing)
                    changed.append(prop.name)
            elif existing is None:
                session.add(m.CardPropertyValue(card_id=card_id, property_id=prop.id, value=value))
                changed.append(prop.name)
            elif existing.value != value:
                existing.value = value
                changed.append(prop.name)
        for item in changes.get('checklistItems', []):
            entry = session.scalar(select(m.ChecklistItem).join(m.CardChecklist,
                m.CardChecklist.checklist_id == m.ChecklistItem.checklist_id).where(
                    m.CardChecklist.card_id == card_id, m.ChecklistItem.id == item['id'], m.ChecklistItem.deleted.is_(False)))
            if entry is None:
                raise ValueError('Пункт чек-листа не найден в этой карточке')
            for name in ('text', 'checked'):
                if name in item and item[name] is not None and getattr(entry, name) != item[name]:
                    setattr(entry, name, item[name])
                    changed.append('Чек-лист')
                    if name == 'checked':
                        entry.checker_id = actor if item[name] else None
                        entry.checked_at = datetime.now(timezone.utc) if item[name] else None
        if changed:
            card.local_version += 1
            card.updated_at = datetime.now(timezone.utc)
            session.add(m.ActivityEvent(card_id=card.id, author_id=actor, action='Карточка изменена',
                occurred_at=card.updated_at, data={'Изменены поля': list(dict.fromkeys(changed))}))
        return {'id': card.id}
