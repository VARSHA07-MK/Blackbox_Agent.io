"""In-memory marketplace state for the food-delivery simulation.

All data is entirely synthetic. No real customers, restaurants, couriers,
payments, or map services are connected. This module only exists as a
sandboxed testing environment for Blackbox agent analysis.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class Customer:
    customer_id: str
    name: str
    address: str
    phone: str  # synthetic


@dataclass
class MenuItem:
    item_id: str
    name: str
    price: float
    category: str


@dataclass
class Restaurant:
    restaurant_id: str
    name: str
    cuisine: str
    address: str
    rating: float
    open: bool
    menu: list[MenuItem] = field(default_factory=list)


@dataclass
class Courier:
    courier_id: str
    name: str
    available: bool
    current_order: str | None = None


@dataclass
class Order:
    order_id: str
    customer_id: str
    restaurant_id: str
    items: list[dict[str, Any]]  # [{item_id, name, qty, price}]
    total: float
    status: str  # placed|accepted|rejected|preparing|ready|assigned|picked_up|delivered|cancelled
    payment_status: str  # pending|charged|refunded|failed
    assigned_courier: str | None
    created_at: str
    updated_at: str
    support_case_id: str | None = None
    scenario_id: str | None = None


@dataclass
class SupportCase:
    case_id: str
    order_id: str
    customer_id: str
    description: str
    status: str  # open|resolved|escalated
    resolution: str | None = None


@dataclass
class PaymentRecord:
    order_id: str
    charge_amount: float
    charge_count: int
    refund_amount: float
    charge_ids: list[str] = field(default_factory=list)


@dataclass
class MarketplaceState:
    customers: dict[str, Customer] = field(default_factory=dict)
    restaurants: dict[str, Restaurant] = field(default_factory=dict)
    couriers: dict[str, Courier] = field(default_factory=dict)
    orders: dict[str, Order] = field(default_factory=dict)
    support_cases: dict[str, SupportCase] = field(default_factory=dict)
    payments: dict[str, PaymentRecord] = field(default_factory=dict)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_initial_state() -> MarketplaceState:
    state = MarketplaceState()

    # 10 synthetic customers (Bengaluru addresses — entirely synthetic)
    customers = [
        ("cust_001", "Aarav Mehta", "14 MG Road, Bengaluru 560001", "+91-99001-00001"),
        ("cust_002", "Priya Sharma", "22 Koramangala 5th Block, Bengaluru 560095", "+91-99001-00002"),
        ("cust_003", "Vikram Nair", "7 Whitefield Main Rd, Bengaluru 560066", "+91-99001-00003"),
        ("cust_004", "Deepa Rao", "33 Indiranagar 100 Ft Rd, Bengaluru 560038", "+91-99001-00004"),
        ("cust_005", "Rahul Gupta", "5 HSR Layout Sector 2, Bengaluru 560102", "+91-99001-00005"),
        ("cust_006", "Sunita Pillai", "18 JP Nagar 3rd Phase, Bengaluru 560078", "+91-99001-00006"),
        ("cust_007", "Arjun Das", "9 Bellandur Gate, Bengaluru 560103", "+91-99001-00007"),
        ("cust_008", "Kavya Patel", "41 Marathahalli Bridge, Bengaluru 560037", "+91-99001-00008"),
        ("cust_009", "Nikhil Iyer", "3 Ulsoor Lake Rd, Bengaluru 560042", "+91-99001-00009"),
        ("cust_010", "Meera Joshi", "27 BTM Layout 2nd Stage, Bengaluru 560076", "+91-99001-00010"),
    ]
    for cid, name, addr, phone in customers:
        state.customers[cid] = Customer(customer_id=cid, name=name, address=addr, phone=phone)

    # 5 restaurants with menus
    rest_data = [
        (
            "rest_001", "SpiceRoute", "Indian",
            "12 Commercial Street, Bengaluru 560001", 4.3, True,
            [
                ("item_sr_01", "Butter Chicken", 320.0, "Main"),
                ("item_sr_02", "Dal Makhani", 220.0, "Main"),
                ("item_sr_03", "Garlic Naan", 60.0, "Bread"),
                ("item_sr_04", "Mango Lassi", 80.0, "Drinks"),
                ("item_sr_05", "Gulab Jamun", 100.0, "Dessert"),
            ],
        ),
        (
            "rest_002", "Wok Express", "Chinese",
            "8 Residency Road, Bengaluru 560025", 4.1, True,
            [
                ("item_we_01", "Hakka Noodles", 180.0, "Main"),
                ("item_we_02", "Fried Rice", 160.0, "Main"),
                ("item_we_03", "Manchurian", 200.0, "Starter"),
                ("item_we_04", "Spring Roll", 120.0, "Starter"),
            ],
        ),
        (
            "rest_003", "PizzaCraft", "Italian",
            "5 Church Street, Bengaluru 560001", 4.5, True,
            [
                ("item_pc_01", "Margherita Pizza", 350.0, "Pizza"),
                ("item_pc_02", "Pepperoni Pizza", 420.0, "Pizza"),
                ("item_pc_03", "Pasta Arrabbiata", 280.0, "Pasta"),
                ("item_pc_04", "Garlic Bread", 90.0, "Sides"),
                ("item_pc_05", "Tiramisu", 180.0, "Dessert"),
            ],
        ),
        (
            "rest_004", "GreenBowl", "Salads",
            "19 Vittal Mallya Road, Bengaluru 560001", 4.2, True,
            [
                ("item_gb_01", "Greek Salad", 220.0, "Salad"),
                ("item_gb_02", "Caesar Salad", 240.0, "Salad"),
                ("item_gb_03", "Quinoa Bowl", 290.0, "Bowl"),
                ("item_gb_04", "Detox Juice", 120.0, "Drinks"),
            ],
        ),
        (
            "rest_005", "BurgerVault", "Burgers",
            "2 Lavelle Road, Bengaluru 560001", 4.0, True,
            [
                ("item_bv_01", "Classic Beef Burger", 280.0, "Burger"),
                ("item_bv_02", "Veggie Delight Burger", 220.0, "Burger"),
                ("item_bv_03", "Loaded Fries", 130.0, "Sides"),
                ("item_bv_04", "Vanilla Shake", 110.0, "Drinks"),
                ("item_bv_05", "Chocolate Brownie", 120.0, "Dessert"),
            ],
        ),
    ]
    for rid, name, cuisine, addr, rating, open_, menu_items in rest_data:
        menu = [
            MenuItem(item_id=iid, name=iname, price=price, category=cat)
            for iid, iname, price, cat in menu_items
        ]
        state.restaurants[rid] = Restaurant(
            restaurant_id=rid,
            name=name,
            cuisine=cuisine,
            address=addr,
            rating=rating,
            open=open_,
            menu=menu,
        )

    # 10 couriers
    courier_names = [
        "Ravi Kumar", "Suresh Babu", "Manoj Yadav", "Anita Reddy", "Kiran Shetty",
        "Prem Nath", "Divya Thomas", "Sachin More", "Neha Verma", "Amit Shah",
    ]
    for i, cname in enumerate(courier_names, 1):
        cid = f"courier_{i:03d}"
        state.couriers[cid] = Courier(courier_id=cid, name=cname, available=True)

    return state


def snapshot(state: MarketplaceState) -> MarketplaceState:
    """Return a deep copy of the marketplace state (for per-order isolation)."""
    return copy.deepcopy(state)
