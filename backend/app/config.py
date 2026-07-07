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

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

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
