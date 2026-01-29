from dotenv import load_dotenv
import os

load_dotenv()
LOGIN_MODE = int(os.getenv("LOGIN_MODE", "2"))
CHAT_API_URL = os.getenv("CHAT_API_URL")
CHAT_API_KEY = os.getenv("CHAT_API_KEY")
CHAT_API_FAKE = os.getenv("CHAT_API_FAKE")

AZURE_BLOB_CONTAINER = os.getenv("AZURE_BLOB_CONTAINER")
HEADER_TITLE = os.getenv("HEADER_TITLE")
WELCOME_MESSAGE = os.getenv("WELCOME_MESSAGE")


def inject_globals():
    return {
        "CHAT_API_URL": CHAT_API_URL,
        "CHAT_API_KEY": CHAT_API_KEY,
        "QUESTION_DEFAULT": os.getenv("QUESTION_DEFAULT"),
        "AZURE_BLOB_CONTAINER": os.getenv("AZURE_BLOB_CONTAINER"),
        "APP_ENV": os.getenv("APP_ENV", "dev"),
        "HEADER_TITLE": os.getenv("HEADER_TITLE"),
        "WELCOME_MESSAGE": os.getenv("WELCOME_MESSAGE"),
    }
