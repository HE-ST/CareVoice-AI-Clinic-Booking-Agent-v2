
import os

import psycopg
from dotenv import load_dotenv

load_dotenv(".env.local")

database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise RuntimeError("DATABASE_URL is missing from .env.local")

try:
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT current_database(), version();")
            database_name, version = cur.fetchone()

            cur.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """)
            tables = [row[0] for row in cur.fetchall()]

    print("Database connection successful!")
    print(f"Database: {database_name}")
    print(f"Tables: {', '.join(tables)}")

except psycopg.Error as error:
    print(f"Database connection failed: {error}")
