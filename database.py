"SQLite database setup for the ShortLink application."""

import sqlite3
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BASE_DIR / "shortlink.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"


def connect(db_path: str | Path = DEFAULT_DB_PATH) -> sqlite3.Connection:
    "Open a SQLite connection with foreign-key enforcement enabled."
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection

def initialize_database(db_path: str | Path = DEFAULT_DB_PATH) -> None:
    "Create the database schema if it does not already exist."
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    with connect(db_path) as connection:
        connection.executescript(schema)

if __name__ == "__main__":
    initialize_database()
    print(f"SQLite database initialized: {DEFAULT_DB_PATH}")
