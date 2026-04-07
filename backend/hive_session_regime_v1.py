"""
HIVE Wave 2 — session regime lite: US/Eastern clock windows only.
No market feeds, no VIX, no volume — time-of-day context for operators.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover — py<3.9
    ZoneInfo = None  # type: ignore[misc, assignment]

_ET: Any = None
if ZoneInfo:
    try:
        _ET = ZoneInfo("America/New_York")
    except Exception:  # pragma: no cover — missing tzdata on some Windows installs
        _ET = None


def compute_hive_session_regime_v1(*, at: datetime | None = None) -> dict[str, Any]:
    """
    Classify broad session bucket from wall clock in America/New_York.

    `at`: optional fixed instant for tests. If naive, interpreted as UTC.
    Production: pass None for current Eastern time.
    """
    if _ET is None:
        return {
            "code": "unknown",
            "label": "Unknown",
            "detail": "Timezone data unavailable in this Python build.",
            "market_hours": False,
        }

    try:
        if at is None:
            et_now = datetime.now(_ET)
        elif at.tzinfo is None:
            et_now = at.replace(tzinfo=ZoneInfo("UTC")).astimezone(_ET)  # type: ignore[union-attr]
        else:
            et_now = at.astimezone(_ET)
    except Exception:
        return {
            "code": "unknown",
            "label": "Unknown",
            "detail": "Could not resolve Eastern time for session window.",
            "market_hours": False,
        }

    h, mi = et_now.hour, et_now.minute
    total = h * 60 + mi
    wd = et_now.weekday()  # Mon=0 .. Sun=6

    def rth_open() -> bool:
        return wd < 5 and (9 * 60 + 30) <= total < (16 * 60)

    if wd >= 5:
        return {
            "code": "closed",
            "label": "Closed",
            "detail": "US equity session closed (weekend).",
            "market_hours": False,
        }

    if total < 4 * 60 or total > 20 * 60:
        return {
            "code": "closed",
            "label": "Closed",
            "detail": "US equity session closed (outside extended-hours clock window).",
            "market_hours": False,
        }

    if 4 * 60 <= total < 9 * 60 + 30:
        return {
            "code": "premarket",
            "label": "Premarket",
            "detail": "Premarket setup window — extended hours; liquidity is typically lower than regular session.",
            "market_hours": False,
        }

    if 9 * 60 + 30 <= total < 10 * 60 + 30:
        return {
            "code": "open_drive",
            "label": "Open drive",
            "detail": "First hour of regular session — liquidity and volatility are often elevated (clock context only).",
            "market_hours": rth_open(),
        }

    if 10 * 60 + 30 <= total < 15 * 60:
        return {
            "code": "midday",
            "label": "Midday",
            "detail": "Core regular session — often lower energy than open or close (time context only).",
            "market_hours": rth_open(),
        }

    if 15 * 60 <= total < 16 * 60:
        return {
            "code": "power_hour",
            "label": "Power hour",
            "detail": "Late regular-session decision window — participation often concentrates before the bell (clock only).",
            "market_hours": rth_open(),
        }

    if total == 16 * 60:
        return {
            "code": "closed",
            "label": "Closed",
            "detail": "Regular session close — brief clock gap before extended-hours window.",
            "market_hours": False,
        }

    if 16 * 60 + 1 <= total <= 20 * 60:
        return {
            "code": "after_hours",
            "label": "After hours",
            "detail": "Extended-hours window — generally reduced liquidity vs regular session (clock context only).",
            "market_hours": False,
        }

    return {
        "code": "closed",
        "label": "Closed",
        "detail": "US equity session closed.",
        "market_hours": False,
    }
