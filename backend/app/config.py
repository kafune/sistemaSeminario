from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuracao via variaveis de ambiente (prefixo TOV_) ou arquivo .env."""

    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = ""
    db_name: str = "tov"

    secret_key: str = "troque-esta-chave-no-deploy"
    # Chave própria para cifrar credenciais guardadas no banco (token da
    # instância UazAPI). Vazia, cai na secret_key — mas rotacionar o segredo
    # do JWT não deveria inutilizar a integração do WhatsApp.
    encryption_key: str = ""
    token_expire_minutes: int = 60 * 12  # expediente de um dia
    google_forms_webhook_secret: str = ""
    banco_webhook_secret: str = ""

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    uazapi_base_url: str = ""
    uazapi_admin_token: str = ""
    whatsapp_delay_min: int = 5
    whatsapp_delay_max: int = 15
    whatsapp_upload_max_mb: int = 20
    materiais_upload_max_mb: int = 25
    whatsapp_mass_max_recipients: int = 1000
    public_api_url: str = ""
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = ""
    timezone: str = "America/Sao_Paulo"
    # O reparo de integridade acadêmica apaga vínculos órfãos e duplicatas.
    # É migração de dados, não rotina de boot: desligado por padrão e rodado
    # deliberadamente por ``python -m app.reparar``.
    reparo_integridade_no_boot: bool = False

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
