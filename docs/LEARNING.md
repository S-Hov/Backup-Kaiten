# Как осваивать Python на этом проекте

Начинайте с одного запроса: «открыть карточку по номеру». Не нужно сначала
изучать весь язык или все библиотеки.

1. `frontend/api.js`: знакомый JavaScript отправляет `GET /api/v1/cards/123`.
2. `backend/app/api/routes.py`: функция `get_card` принимает номер и копию.
   `def` — объявление функции; аннотации `card_id: int` задают ожидаемый тип.
3. `backend/app/application/cards.py`: обычный класс вызывает репозиторий и
   готовит результат. Здесь нет HTTP, SQL и обработки файлов.
4. `backend/app/domain/ports.py`: `Protocol` похож на TypeScript-интерфейс.
   Оба репозитория должны предоставлять одинаковые операции.
5. `infrastructure/archive/repository.py`: `Path` работает с путями,
   `json.loads` похож на `JSON.parse`, `with` гарантирует закрытие ресурса.
6. `infrastructure/database/repository.py`: `Session` соответствует одной
   операции с БД; `with session.begin()` фиксирует транзакцию при успехе и
   откатывает при ошибке.
7. `presentation/card_model.py`: здесь исходные данные превращаются в объект,
   понятный компоненту интерфейса.

Сопоставление привычных конструкций:

| JavaScript/TypeScript | Python |
| --- | --- |
| `null`, `true`, `false` | `None`, `True`, `False` |
| объект `{}` | `dict` |
| массив `[]` | `list` |
| `const fn = ...` / `function fn()` | `def fn():` |
| фигурные скобки блока | отступы, обычно 4 пробела |
| `throw new Error(...)` | `raise ValueError(...)` |
| `try/catch/finally` | `try/except/finally` |
| интерфейс TypeScript | `Protocol` или модель Pydantic в зависимости от задачи |
| `package.json` | `pyproject.toml` |
| отдельные зависимости проекта | `.venv` |

Запуск тестов одной части:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_viewer.py -v
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_database.py -v
```

Первая полезная учебная задача: добавить фильтр по архивности сразу в два
репозитория и в API, проверить одинаковое поведение. Вторая — фильтр по колонке.
К записи в БД и изменению карточек стоит переходить после понимания транзакций
и отделения рабочей доски от исторических снимков.
