from services.rate_limiter import RateLimiter

T0 = 1_800_000_000.0  # fixed epoch for deterministic windows
HASH = "a" * 64
IP = "203.0.113.5"


def make(db, settings):
    return RateLimiter(db, settings)


def record(rl, now, url_hash=HASH, ip=IP, cost=0.01):
    rl.record_generation(url_hash, ip, cost, "cheerful-01", "cheerful", 3, now=now)


class TestUrlLimit:
    def test_first_request_allowed(self, db, settings):
        rl = make(db, settings)
        assert rl.check(HASH, IP, now=T0) is None

    def test_second_request_within_12h_denied(self, db, settings):
        rl = make(db, settings)
        record(rl, T0)
        denial = rl.check(HASH, IP, now=T0 + 3600)
        assert denial is not None and denial.kind == "rate_limited"
        assert 0 < denial.retry_after <= settings.url_window_sec

    def test_allowed_again_after_window(self, db, settings):
        rl = make(db, settings)
        record(rl, T0)
        assert rl.check(HASH, "198.51.100.1", now=T0 + settings.url_window_sec + 1) is None

    def test_different_url_unaffected(self, db, settings):
        rl = make(db, settings)
        record(rl, T0)
        assert rl.check("b" * 64, "198.51.100.1", now=T0 + 60) is None


class TestIpLimit:
    def test_fourth_request_in_hour_denied(self, db, settings):
        rl = make(db, settings)
        for i in range(settings.ip_max_per_window):
            record(rl, T0 + i, url_hash=f"{i:064d}")
        denial = rl.check("f" * 64, IP, now=T0 + 10)
        assert denial is not None and denial.kind == "rate_limited"

    def test_window_slides(self, db, settings):
        rl = make(db, settings)
        for i in range(settings.ip_max_per_window):
            record(rl, T0 + i, url_hash=f"{i:064d}")
        assert rl.check("f" * 64, IP, now=T0 + settings.ip_window_sec + 60) is None


class TestDailyCaps:
    def test_generation_cap(self, db, settings):
        settings.daily_gen_cap = 2
        rl = make(db, settings)
        record(rl, T0, url_hash="1" * 64, ip="203.0.113.1")
        record(rl, T0 + 1, url_hash="2" * 64, ip="203.0.113.2")
        denial = rl.check("3" * 64, "203.0.113.3", now=T0 + 2)
        assert denial is not None and denial.kind == "capacity"

    def test_spend_cap(self, db, settings):
        settings.daily_spend_cap = 0.015
        rl = make(db, settings)
        record(rl, T0, url_hash="1" * 64, ip="203.0.113.1", cost=0.02)
        denial = rl.check("2" * 64, "203.0.113.2", now=T0 + 2)
        assert denial is not None and denial.kind == "capacity"

    def test_today_stats(self, db, settings):
        rl = make(db, settings)
        record(rl, T0, cost=0.01)
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
