from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuracao via variaveis de ambiente (prefixo TOV_) ou arquivo .env."""

    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = ""
    db_name: str = "tov"

    secret_key: str = "troque-esta-chave-no-deploy"
    token_expire_minutes: int = 60 * 12  # expediente de um dia
    google_forms_webhook_secret: str = ""

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    uazapi_base_url: str = ""
    uazapi_admin_token: str = ""
    whatsapp_delay_min: int = 5
    whatsapp_delay_max: int = 15

    class Config:
        env_prefix = "TOV_"
        env_file = ".env"

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"
        )


settings = Settings()
