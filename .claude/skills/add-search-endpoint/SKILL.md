---
name: add-search-endpoint
description: Use when adding or modifying an API route in backend/api/playground.py or backend/main.py. Enforces the repo's rules about which router a route belongs on, how it gets its database connection, and what bounds its inputs need — the three things that produced real vulnerabilities here before.
---

# Adding an API route

Three decisions, in this order. Each one has been got wrong in this repo
before, and each mistake shipped.

## 1. Which router?

```
Does the route write, crawl, schedule, or call a paid API?
├── yes → @admin.<method>(...)   in api/playground.py
└── no  → @router.<method>(...)  in api/playground.py
```

`admin` carries `Depends(require_api_key)` for every route on it. There is no
per-route auth decorator — putting a write route on `router` silently ships it
unauthenticated.

Money counts as writing. `/api/embedding/rebuild` calls Voyage in a loop; an
unauthenticated version of that endpoint is somebody else spending your
credits.

## 2. Where does the connection come from?

```python
# Request handler — pooled, released when the request ends
def handler(conn: psycopg.Connection = Depends(get_db)):
    ...

# Background thread or a job that runs for minutes — its own connection,
# so a long crawl cannot starve the request pool
from db import get_connection
conn = get_connection()

# Something in between, e.g. a periodic task
from db import db_conn
with db_conn() as conn:
    ...
```

Never open a connection with `get_connection()` inside a request handler.

## 3. What bounds the input?

Every numeric or list input needs a `Field(...)` bound on the Pydantic model.
Unbounded `max_pages` and `iterations` were a one-request denial of service.

```python
class ThingRequest(BaseModel):
    count: int = Field(default=10, ge=1, le=500)
    items: list[str] = Field(default=[], max_length=50)
```

Query parameters take the same treatment:

```python
def handler(days: int = Query(30, ge=1, le=365)):
```

## Then

- **Declare `response_model`** on the route so `/docs` describes a real shape.
  Add the model to `backend/models.py`.
- **Raise `HTTPException`**, never `return {...}, 409`. FastAPI serialises the
  tuple and returns 200.
- **No N+1.** One `= ANY(%s)` for a batch, not a query per row.
- **No `CREATE TABLE`** in the handler. Schema belongs in `db.py`.
- **Parameters cannot go inside SQL string literals.** `INTERVAL '%s days'` is
  literal text; use `make_interval(days => %s)`.

## Verify

```bash
cd backend
pytest tests -q
ruff check .
python -c "import main; print(len([r for r in main.app.routes if hasattr(r,'methods')]))"
```

If the route is an operational one, add a case to `tests/test_request_limits.py`
for its bounds, and confirm it appears under auth:

```python
import main
protected = {r.path for r in main.app.routes if getattr(r, "dependencies", None)}
assert "/api/your/route" in protected
```
