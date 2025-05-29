from dotenv import load_dotenv
import os

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
DEFAULT_JOIN_TOKEN = os.getenv("DEFAULT_JOIN_TOKEN")
ADMINS = os.getenv("ADMINS").split(",")
ALLOWED_CHAT_ID = int(os.getenv("ALLOWED_CHAT_ID"))
ALLOWED_TOPIC_ID = int(os.getenv("ALLOWED_TOPIC_ID"))
