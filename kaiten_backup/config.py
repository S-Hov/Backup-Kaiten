import os
import re
import math
import tomllib
from pathlib import Path
from urllib.parse import urlsplit


def load_config(path, require_token=True, require_board=True):
    path = Path(path).resolve()
    with path.open('rb') as f:
        cfg = tomllib.load(f)
    k = cfg['kaiten']
    u = urlsplit(k['board_url'])
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.port:
        raise ValueError('board_url: требуется HTTPS-ссылка без пароля и порта')
    if 'YOUR-COMPANY' in u.hostname.upper():
        raise ValueError('Замените YOUR-COMPANY в config.toml')
    k['origin'] = f'https://{u.hostname}'
    space = re.search(r'/spaces?/(\d+)(?:/|$)', u.path)
    k['space_id'] = int(space[1]) if space else None
    bid = k.get('board_id', 0)
    if not bid:
        m = re.search(r'/boards/(\d+)(?:/|$)', u.path)
        bid = int(m[1]) if m else 0
    if isinstance(bid, bool) or not isinstance(bid, int) or bid < 0:
        raise ValueError('board_id должен быть положительным целым числом или 0 для определения по ссылке')
    if require_board and bid == 0:
        raise ValueError(
            'В ссылке указан раздел досок пространства, а ID конкретной доски отсутствует. '
            'Выполните python backup.py --list-boards и запишите ID нужной доски '
            'в board_id в config.toml.')
    k['board_id'] = bid
    env_path = path.parent / k.get('env_file', '.env')
    local_env = {}
    if require_token and env_path.exists():
        for line in env_path.read_text(encoding='utf-8-sig').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                name, value = line.split('=', 1)
                local_env[name.strip()] = value.strip().strip('\"\'')
    name = k.get('token_env', 'KAITEN_API_TOKEN')
    k['token'] = (os.environ.get(name) or local_env.get(name, '')) if require_token else ''
    if require_token and (not k['token'] or k['token'] == 'PASTE_TOKEN_HERE'):
        raise ValueError(f'Заполните {name} в {env_path} или переменной окружения')
    b = cfg.setdefault('backup', {})
    b['output_dir'] = str((path.parent / b.get('output_dir', 'backups')).resolve())
    b.setdefault('include_archived', True)
    b.setdefault('follow_related', False)
    b.setdefault('max_related_cards', 10000)
    b.setdefault('extra_asset_hosts', [])
    p = cfg.setdefault('performance', {})
    defaults = dict(requests_per_second=3.0, min_interval_seconds=0.0,
                    page_size=100, timeout_seconds=60, retries=5,
                    backoff_seconds=1.0, max_backoff_seconds=60.0)
    for key, value in defaults.items():
        p.setdefault(key, value)
        if isinstance(p[key], bool) or not isinstance(p[key], (float, int)) or not math.isfinite(p[key]):
            raise ValueError(f'performance.{key}: требуется конечное число')
    if not 0 < p['requests_per_second'] <= 50:
        raise ValueError('requests_per_second должен быть > 0 и <= 50')
    if p['min_interval_seconds'] < 0 or p['timeout_seconds'] <= 0:
        raise ValueError('Некорректные интервал или таймаут')
    if not isinstance(p['page_size'], int) or not 1 <= p['page_size'] <= 100:
        raise ValueError('page_size: целое от 1 до 100')
    if not isinstance(p['retries'], int) or not 0 <= p['retries'] <= 20:
        raise ValueError('retries: целое от 0 до 20')
    if p['backoff_seconds'] <= 0 or p['max_backoff_seconds'] <= 0:
        raise ValueError('Задержки повторов должны быть положительными')
    if not isinstance(b['max_related_cards'], int) or b['max_related_cards'] <= 0:
        raise ValueError('max_related_cards должен быть положительным целым')
    return cfg
