"""OWASP scrypt minimum, random salts; never persist plaintext credentials."""
import hashlib
import hmac
import secrets
from threading import BoundedSemaphore
from starlette.exceptions import HTTPException

_slots = BoundedSemaphore(2)


def derive(password, salt):
    if not _slots.acquire(blocking=False):
        raise HTTPException(429, 'Попробуйте войти через несколько секунд')
    try:
        return hashlib.scrypt(password.encode(), salt=salt, n=2**17, r=8, p=1, dklen=32, maxmem=256*1024*1024)
    finally:
        _slots.release()


def hash_password(password):
    if not 12 <= len(password) <= 128 or not password.strip():
        raise ValueError('Пароль должен содержать от 12 до 128 символов')
    salt = secrets.token_bytes(16)
    return 'scrypt$' + salt.hex() + '$' + derive(password, salt).hex()


def verify_password(password, encoded):
    try:
        kind, salt, expected = (encoded or 'scrypt$' + '00'*16 + '$' + '00'*32).split('$')
        if kind != 'scrypt':
            return False
        return hmac.compare_digest(derive(password, bytes.fromhex(salt)).hex(), expected)
    except (ValueError, TypeError):
        return False


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()
