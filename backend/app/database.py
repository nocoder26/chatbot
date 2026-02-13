import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Determine if running in production (Railway) or local development
IS_PRODUCTION = os.getenv("RAILWAY_ENVIRONMENT") is not None

# Set up database path
if IS_PRODUCTION:
    # Railway: use absolute path for volume mount
    DATA_DIR = "/app/backend/data"
    DB_PATH = "/app/backend/data/chatbot.db"
else:
    # Local development: use path relative to current working directory
    DATA_DIR = os.path.join(os.getcwd(), "data")
    DB_PATH = os.path.join(DATA_DIR, "chatbot.db")

# IMPORTANT: Create data directory before anything else
os.makedirs(DATA_DIR, exist_ok=True)

# Build SQLAlchemy database URL (4 slashes for absolute path)
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# Create engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Needed for SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
