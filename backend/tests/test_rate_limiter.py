import time

from services.rate_limiter import RateLimiter, hash_ip

T0 = 1_800_000_000.0  # fixed epoch for deterministic windows
HASH = "a" * 64
IP = "203.0.113.5"


def make(db, settings):
    return RateLimiter(db, settings)


def generate(rl, now, url_hash=HASH, ip=IP, cost=0.01, succeeded=True):
    """Reserve + record, i.e. one full successful generation."""
    denial = rl.reserve(url_hash, ip, now=now)
    if denial is None:
        rl.record_attempt(url_hash, cost, "cheerful-01", "cheerful", 3, succeeded=succeeded, now=now)
    return denial


class TestUrlLimit:
    def test_first_request_allowed(self, db, settings):
        rl = make(db, settings)
        assert rl.reserve(HASH, IP, now=T0) is None

    def test_second_request_within_12h_denied(self, db, settings):
        rl = make(db, settings)
        generate(rl, T0)
        denial = rl.reserve(HASH, IP, now=T0 + 3600)
        assert denial is not None and denial.kind == "rate_limited"
        assert 0 < denial.retry_after <= settings.url_window_sec

    def test_allowed_again_after_window(self, db, settings):
        rl = make(db, settings)
        generate(rl, T0)
        assert rl.reserve(HASH, "198.51.100.1", now=T0 + settings.url_window_sec + 1) is None

    def test_different_url_unaffected(self, db, settings):
        rl = make(db, settings)
        generate(rl, T0)
        assert rl.reserve("b" * 64, "198.51.100.1", now=T0 + 60) is None

    def test_reserve_is_atomic(self, db, settings):
        """The second caller must be denied even though neither has recorded
        an attempt yet — this is the check-then-record race."""
        rl = make(db, settings)
        assert rl.reserve(HASH, IP, now=T0) is None
        assert rl.reserve(HASH, "198.51.100.9", now=T0 + 1) is not None

    def test_release_frees_the_slot(self, db, settings):
        rl = make(db, settings)
        rl.reserve(HASH, IP, now=T0)
        rl.release_url(HASH)
        assert rl.reserve(HASH, IP, now=T0 + 2) is None


class TestIpLimit:
    def test_fourth_request_in_hour_denied(self, db, settings):
        rl = make(db, settings)
        for i in range(settings.ip_max_per_window):
            generate(rl, T0 + i, url_hash=f"{i:064d}")
        denial = rl.reserve("f" * 64, IP, now=T0 + 10)
        assert denial is not None and denial.kind == "rate_limited"

    def test_window_slides(self, db, settings):
        rl = make(db, settings)
        for i in range(settings.ip_max_per_window):
            generate(rl, T0 + i, url_hash=f"{i:064d}")
        assert rl.reserve("f" * 64, IP, now=T0 + settings.ip_window_sec + 60) is None

    def test_failed_attempts_still_count_against_the_ip(self, db, settings):
        """A refusal costs money, so it must not be a free retry."""
        rl = make(db, settings)
        for i in range(settings.ip_max_per_window):
            rl.reserve(f"{i:064d}", IP, now=T0 + i)
            rl.record_attempt(f"{i:064d}", 0.01, "cheerful-01", "cheerful", 0, succeeded=False, now=T0 + i)
            rl.release_url(f"{i:064d}")
        denial = rl.reserve("f" * 64, IP, now=T0 + 10)
        assert denial is not None and denial.kind == "rate_limited"

    def test_raw_ip_is_never_stored(self, db, settings):
        rl = make(db, settings)
        generate(rl, T0)
        with db.connect() as conn:
            rows = [r["ip_hash"] for r in conn.execute("SELECT ip_hash FROM rate_ip")]
        assert IP not in rows
        assert hash_ip(IP) in rows


class TestDailyCaps:
    def test_generation_cap(self, db, settings):
        settings.daily_gen_cap = 2
        rl = make(db, settings)
        generate(rl, T0, url_hash="1" * 64, ip="203.0.113.1")
        generate(rl, T0 + 1, url_hash="2" * 64, ip="203.0.113.2")
        denial = rl.reserve("3" * 64, "203.0.113.3", now=T0 + 2)
        assert denial is not None and denial.kind == "capacity"

    def test_spend_cap(self, db, settings):
        settings.daily_spend_cap = 0.015
        rl = make(db, settings)
        generate(rl, T0, url_hash="1" * 64, ip="203.0.113.1", cost=0.02)
        denial = rl.reserve("2" * 64, "203.0.113.2", now=T0 + 2)
        assert denial is not None and denial.kind == "capacity"

    def test_failed_attempts_count_toward_spend(self, db, settings):
        """The bill arrives whether or not the lyrics were usable."""
        settings.daily_spend_cap = 0.015
        rl = make(db, settings)
        rl.reserve("1" * 64, "203.0.113.1", now=T0)
        rl.record_attempt("1" * 64, 0.02, "cheerful-01", "cheerful", 0, succeeded=False, now=T0)
        rl.release_url("1" * 64)
        denial = rl.reserve("2" * 64, "203.0.113.2", now=T0 + 2)
        assert denial is not None and denial.kind == "capacity"

    def test_today_stats(self, db, settings):
        rl = make(db, settings)
        generate(rl, T0, cost=0.01)
        count, spend = rl.today_stats(now=T0 + 10)
        assert count == 1
        assert abs(spend - 0.01) < 1e-9


class TestCircuitBreaker:
    def test_opens_after_threshold(self, db, settings):
        rl = make(db, settings)
        assert not rl.circuit_open(now=T0)
        for _ in range(settings.circuit_error_threshold):
            rl.record_api_error(now=T0)
        assert rl.circuit_open(now=T0 + 1)

    def test_closes_after_cooldown(self, db, settings):
        rl = make(db, settings)
        for _ in range(settings.circuit_error_threshold):
            rl.record_api_error(now=T0)
        assert not rl.circuit_open(now=T0 + settings.circuit_cooldown_sec + 1)

    def test_success_resets_error_count(self, db, settings):
        rl = make(db, settings)
        for _ in range(settings.circuit_error_threshold - 1):
            rl.record_api_error(now=T0)
        rl.record_api_success()
        for _ in range(settings.circuit_error_threshold - 1):
            rl.record_api_error(now=T0)
        assert not rl.circuit_open(now=T0 + 1)


class TestRetention:
    """Expired rows are pruned by SQLite triggers, so the file can't balloon.

    These use REAL wall-clock timestamps because the triggers compare against
    strftime('now') — the injected clock the other tests use is deliberately
    far in the future and would never look expired.
    """

    def test_expired_rate_ip_rows_are_pruned(self, db, settings):
        rl = make(db, settings)
        stale = time.time() - settings.ip_window_sec - 60
        with db.connect() as conn:
            conn.execute("INSERT INTO rate_ip (ip_hash, ts) VALUES ('stale', ?)", (stale,))
        # Any subsequent insert fires the prune trigger.
        rl.reserve("c" * 64, "198.51.100.7")
        with db.connect() as conn:
            remaining = [r["ip_hash"] for r in conn.execute("SELECT ip_hash FROM rate_ip")]
        assert "stale" not in remaining
        assert len(remaining) == 1

    def test_expired_rate_url_rows_are_pruned(self, db, settings):
        rl = make(db, settings)
        stale = time.time() - settings.url_window_sec - 60
        with db.connect() as conn:
            conn.execute("INSERT INTO rate_url (url_hash, last_ts) VALUES ('stale', ?)", (stale,))
        rl.reserve("d" * 64, "198.51.100.8")
        with db.connect() as conn:
            remaining = [r["url_hash"] for r in conn.execute("SELECT url_hash FROM rate_url")]
        assert "stale" not in remaining

    def test_old_generation_log_rows_are_pruned(self, db, settings):
        rl = make(db, settings)
        ancient = time.time() - (settings.generation_log_days + 5) * 86400
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO generations (ts, url_hash, cost, track_id, mood, event_count) "
                "VALUES (?, 'old', 0.01, 't', 'warm', 0)",
                (ancient,),
            )
        rl.record_attempt("e" * 64, 0.01, "cheerful-01", "cheerful", 1, succeeded=True)
        with db.connect() as conn:
            hashes = [r["url_hash"] for r in conn.execute("SELECT url_hash FROM generations")]
        assert "old" not in hashes

    def test_old_daily_stats_rows_are_pruned(self, db, settings):
        rl = make(db, settings)
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO daily_stats (date, count, spend) VALUES (?, 1, 0.5)",
                ("2019-01-01",),
            )
        rl.record_attempt("e" * 64, 0.01, "cheerful-01", "cheerful", 1, succeeded=True)
        with db.connect() as conn:
            dates = [r["date"] for r in conn.execute("SELECT date FROM daily_stats")]
        assert "2019-01-01" not in dates
