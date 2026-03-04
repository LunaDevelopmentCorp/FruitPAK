from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    environment: str = "development"
    debug: bool = False
    allowed_origins: str = "http://localhost:3000,http://localhost:19006"

    # Database
    database_url: str = "postgresql+asyncpg://fruitpak:fruitpak@localhost:5432/fruitpak"
    database_url_sync: str = "postgresql://fruitpak:fruitpak@localhost:5432/fruitpak"

    # Auth / JWT
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    # OTP
    otp_expiry_seconds: int = 300  # 5 minutes

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Database pool (tunable per deployment — see Tier 5 plan)
    pool_size: int = 50
    max_overflow: int = 30

    # Observability (optional — leave empty to disable)
    sentry_dsn: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

if settings.environment != "development" and settings.secret_key == "change-me-in-production":
    raise RuntimeError(
        "SECRET_KEY must be set in production — cannot use default value. "
        "Set SECRET_KEY in your .env file."
    )
