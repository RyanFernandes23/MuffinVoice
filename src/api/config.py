from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_creator_plan_id: str = ""
    razorpay_professional_plan_id: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="allow")


settings = Settings()
