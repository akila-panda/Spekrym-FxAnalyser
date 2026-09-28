import asyncio
from pathlib import Path

from sqlalchemy import text

from data.db import get_engine

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _split_statements(sql: str) -> list[str]:
    """Split a .sql file into individual statements.

    Handles two things the naive `split(";")` got wrong:
      * `--` line comments (a semicolon inside a comment is not a terminator)
      * `$$ ... $$` dollar-quoted bodies, so a PL/pgSQL DO block or function
        with internal semicolons stays a single statement.

    Migrations here use no `--` inside dollar-quoted bodies and only the plain
    `$$` delimiter (no custom tags), which keeps this splitter simple.
    """
    no_comments = "\n".join(line.split("--", 1)[0] for line in sql.splitlines())

    statements, buf = [], []
    in_dollar = False
    i = 0
    while i < len(no_comments):
        if no_comments[i:i + 2] == "$$":
            in_dollar = not in_dollar
            buf.append("$$")
            i += 2
            continue
        ch = no_comments[i]
        if ch == ";" and not in_dollar:
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
        else:
            buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


async def run_migrations():
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        sql = path.read_text()
        async with get_engine().begin() as conn:
            for stmt in _split_statements(sql):
                await conn.execute(text(stmt))
        print(f"applied {path.name}")


if __name__ == "__main__":
    asyncio.run(run_migrations())