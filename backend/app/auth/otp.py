"""SMS OTP via Twilio with expiry and rate limiting.

Storage:
  - In development (no Redis): in-memory dict with timestamps.
  - In production: swap _otp_store for a Redis hash with TTL.

Flow:
  1. Client calls POST /api/auth/otp-request with a phone number.
  2. We look up the user by phone, generate a 6-digit code, store it,
     and send it via Twilio SMS.
  3. Client calls POST /api/auth/otp-verify with phone + code.
  4. On success we return a JWT (full login).
"""

import random
import string
import time

from app.config import settings

# ── In-memory store (replace with Redis in production) ──────

# {phone: {"code": "123456", "created_at": timestamp, "attempts": int}}
_otp_store: dict[str, dict] = {}

OTP_LENGTH = 6
OTP_EXPIRY_SECONDS = settings.otp_expiry_seconds
OTP_MAX_ATTEMPTS = 5
OTP_COOLDOWN_SECONDS = 60  # min seconds between sends


def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=OTP_LENGTH))


def send_otp(phone: str) -> str:
    """Generate OTP, store it, send via Twilio. Returns code for dev logging."""
    now = time.time()

    # Rate limit: prevent spam
    existing = _otp_store.get(phone)
    if existing and (now - existing["created_at"]) < OTP_COOLDOWN_SECONDS:
        remaining = int(OTP_COOLDOWN_SECONDS - (now - existing["created_at"]))
        raise OTPCooldownError(f"Wait {remaining}s before requesting another code")

    code = generate_otp()
    _otp_store[phone] = {
        "code": code,
        "created_at": now,
        "attempts": 0,
    }

    # Send via Twilio (skip in dev if no credentials configured)
    if settings.twilio_account_sid:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            body=f"Your FruitPAK verification code is: {code}",
            from_=settings.twilio_from_number,
            to=phone,
        )

    return code


def verify_otp(phone: str, code: str) -> bool:
    """Verify an OTP code. Returns True on success, False on failure.

    Enforces:
      - Code expiry (configurable, default 5 min)
      - Max verification attempts (brute-force protection)
    """
    entry = _otp_store.get(phone)
    if not entry:
        return False

    now = time.time()

    # Expired?
    if (now - entry["created_at"]) > OTP_EXPIRY_SECONDS:
        _otp_store.pop(phone, None)
        return False

    # Too many attempts?
    if entry["attempts"] >= OTP_MAX_ATTEMPTS:
        _otp_store.pop(phone, None)
        return False

    entry["attempts"] += 1

    if entry["code"] == code:
        _otp_store.pop(phone, None)  # single use
        return True

    return False


class OTPCooldownError(Exception):
    """Raised when an OTP is requested too soon after the previous one."""
    pass
