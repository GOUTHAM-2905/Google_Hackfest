#!/usr/bin/env python3
"""
Seed a local SQLite database with demo data for Turgon development.
Usage (from WSL, inside turgon/ root):
    python scripts/seed_demo_db.py
Creates: scripts/demo.db
"""
import sqlite3
import random
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "demo.db"

DDL = [
    """
    CREATE TABLE IF NOT EXISTS customers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        email       TEXT    UNIQUE NOT NULL,
        country     TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """
    CREATE TABLE IF NOT EXISTS products (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        sku         TEXT    UNIQUE NOT NULL,
        name        TEXT    NOT NULL,
        category    TEXT,
        price       REAL    NOT NULL,
        stock_qty   INTEGER DEFAULT 0,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """
    CREATE TABLE IF NOT EXISTS orders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id     INTEGER REFERENCES customers(id),
        order_date      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status          TEXT CHECK(status IN ('PENDING','PROCESSING','SHIPPED','CANCELLED','DELIVERED')),
        total_amount    REAL,
        shipping_address TEXT
    )""",
    """
    CREATE TABLE IF NOT EXISTS order_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id    INTEGER REFERENCES orders(id),
        product_id  INTEGER REFERENCES products(id),
        quantity    INTEGER NOT NULL,
        unit_price  REAL    NOT NULL
    )""",
    """
    CREATE TABLE IF NOT EXISTS fact_sales (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        order_item_id   INTEGER REFERENCES order_items(id),
        sale_date       TIMESTAMP,
        region          TEXT,
        revenue         REAL,
        cost            REAL,
        profit          REAL
    )""",
    """
    CREATE TABLE IF NOT EXISTS dim_region (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        region_name TEXT UNIQUE NOT NULL,
        country     TEXT,
        timezone    TEXT
    )""",
    """
    CREATE TABLE IF NOT EXISTS data_quality_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name  TEXT NOT NULL,
        run_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completeness_pct REAL,
        row_count   INTEGER,
        status      TEXT
    )""",
    """
    CREATE TABLE IF NOT EXISTS user_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER REFERENCES customers(id),
        event_type  TEXT,
        event_data  TEXT,
        occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
]

STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'CANCELLED', 'DELIVERED']
REGIONS  = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East']
CATEGORIES = ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports']
EVENT_TYPES = ['page_view', 'add_to_cart', 'purchase', 'search', 'login']

def seed():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    for stmt in DDL:
        cur.execute(stmt)

    # dim_region
    for r in REGIONS:
        cur.execute("INSERT OR IGNORE INTO dim_region(region_name, country, timezone) VALUES (?,?,?)",
                    (r, r.split()[0], "UTC"))

    # customers (150)
    for i in range(1, 151):
        cur.execute("INSERT OR IGNORE INTO customers(name, email, country, created_at) VALUES (?,?,?,?)",
                    (f"Customer {i}", f"user{i}@example.com",
                     random.choice(["US","UK","DE","IN","JP"]),
                     datetime.now() - timedelta(days=random.randint(10, 730))))

    # products (40)
    for i in range(1, 41):
        cur.execute("INSERT OR IGNORE INTO products(sku,name,category,price,stock_qty,updated_at) VALUES (?,?,?,?,?,?)",
                    (f"SKU-{i:04d}", f"Product {i}", random.choice(CATEGORIES),
                     round(random.uniform(5, 500), 2), random.randint(0, 1000),
                     datetime.now() - timedelta(hours=random.randint(1, 48))))

    # orders + order_items + fact_sales (500 orders)
    for i in range(500):
        cust_id   = random.randint(1, 150)
        status    = random.choice(STATUSES)
        order_dt  = datetime.now() - timedelta(days=random.randint(0, 365))
        total     = 0
        cur.execute("INSERT INTO orders(customer_id,order_date,status,shipping_address) VALUES (?,?,?,?)",
                    (cust_id, order_dt, status, f"{random.randint(1,999)} Main St"))
        order_id = cur.lastrowid

        for _ in range(random.randint(1, 4)):
            prod_id  = random.randint(1, 40)
            qty      = random.randint(1, 5)
            price    = round(random.uniform(5, 500), 2)
            total   += qty * price
            cur.execute("INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)",
                        (order_id, prod_id, qty, price))
            item_id = cur.lastrowid

            region  = random.choice(REGIONS)
            revenue = qty * price
            cost    = revenue * random.uniform(0.4, 0.7)
            cur.execute("INSERT INTO fact_sales(order_item_id,sale_date,region,revenue,cost,profit) VALUES (?,?,?,?,?,?)",
                        (item_id, order_dt, region, round(revenue,2), round(cost,2), round(revenue-cost,2)))

        cur.execute("UPDATE orders SET total_amount=? WHERE id=?", (round(total,2), order_id))

    # user_events (1000)
    for _ in range(1000):
        cur.execute("INSERT INTO user_events(customer_id,event_type,event_data,occurred_at) VALUES (?,?,?,?)",
                    (random.randint(1,150), random.choice(EVENT_TYPES),
                     '{"page":"home"}', datetime.now() - timedelta(minutes=random.randint(0,10080))))

    conn.commit()
    conn.close()
    print(f"✅ Demo database seeded: {DB_PATH}")
    print("   Tables: customers, products, orders, order_items, fact_sales, dim_region, data_quality_log, user_events")

if __name__ == "__main__":
    seed()
