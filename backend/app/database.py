import json
import csv
import logging
from contextlib import contextmanager
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from app.config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS

logger = logging.getLogger("placement-tracker.db")

_connection_pool = None

def init_db_pool():
    global _connection_pool
    if _connection_pool is None:
        try:
            logger.info("Initializing PostgreSQL Connection Pool to %s:%s...", DB_HOST, DB_PORT)
            _connection_pool = pool.ThreadedConnectionPool(
                minconn=2,
                maxconn=15,
                host=DB_HOST,
                port=DB_PORT,
                dbname=DB_NAME,
                user=DB_USER,
                password=DB_PASS,
                connect_timeout=10,
            )
            logger.info("Database Connection Pool successfully initialized.")
        except Exception as e:
            logger.error("Failed to initialize DB pool: %s", e)
            raise e

def close_db_pool():
    global _connection_pool
    if _connection_pool:
        _connection_pool.closeall()
        _connection_pool = None
        logger.info("Database Connection Pool closed.")

@contextmanager
def get_db():
    global _connection_pool
    if _connection_pool is None:
        try:
            init_db_pool()
        except Exception:
            pass

    if _connection_pool is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Database connection is not configured or unavailable. Please configure your DATABASE_URL in .env and restart."
        )

    conn = _connection_pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        _connection_pool.putconn(conn)

def parse_skills(val):
    """Normalize any database representation of skills into a clean Python list."""
    if not val:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return []
        if val.startswith("[") and val.endswith("]"):
            try:
                res = json.loads(val)
                if isinstance(res, list):
                    return res
            except Exception:
                pass
        if val.startswith("{") and val.endswith("}"):
            inner = val[1:-1]
            try:
                reader = csv.reader([inner])
                for row in reader:
                    return [x.strip('"') for x in row if x.strip()]
            except Exception:
                return [s.strip().strip('"') for s in inner.split(",") if s.strip()]
        return [s.strip() for s in val.split(",") if s.strip()]
    return []
