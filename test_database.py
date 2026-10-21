import tempfile
import unittest
from pathlib import Path
from database import connect, initialize_database
class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.db"
        initialize_database(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_creates_all_tables_and_index(self):
        with connect(self.db_path) as db:
            objects = db.execute(
                "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
            ).fetchall()
        self.assertEqual(
            {(row["type"], row["name"]) for row in objects},
            {
                ("table", "Users"),
                ("table", "Links"),
                ("table", "Analytics"),
                ("table", "AuthSessions"),
                ("table", "SystemSettings"),
                ("index", "idx_short_code"),
                ("index", "idx_auth_sessions_token_hash"),
            },
        )

    def test_cascades_user_and_link_deletions(self):
        with connect(self.db_path) as db:
            db.execute(
                "INSERT INTO Users (id, email, password_hash) VALUES (?, ?, ?)",
                ("user-1", "person@example.com", "hash"),
            )
            db.execute(
                "INSERT INTO Links (id, original_url, short_code, user_id) VALUES (?, ?, ?, ?)",
                ("link-1", "https://example.com", "aB3x9", "user-1"),
            )
            db.execute(
                "INSERT INTO Analytics (id, link_id) VALUES (?, ?)",
                ("click-1", "link-1"),
            )
            db.execute("DELETE FROM Users WHERE id = ?", ("user-1",))
            self.assertEqual(db.execute("SELECT COUNT(*) FROM Links").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM Analytics").fetchone()[0], 0)

    def test_rejects_duplicate_codes_and_missing_link_foreign_key(self):
        with connect(self.db_path) as db:
            db.execute(
                "INSERT INTO Links (id, original_url, short_code) VALUES (?, ?, ?)",
                ("link-1", "https://example.com", "same"),
            )
            with self.assertRaises(Exception):
                db.execute(
                    "INSERT INTO Links (id, original_url, short_code) VALUES (?, ?, ?)",
                    ("link-2", "https://example.org", "same"),
                )
            with self.assertRaises(Exception):
                db.execute(
                    "INSERT INTO Analytics (id, link_id) VALUES (?, ?)",
                    ("click-1", "missing-link"),
                )

if __name__ == "__main__":
    unittest.main()
