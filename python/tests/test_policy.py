import pytest
from invariance.policy import check_policies, assert_policy
from invariance.errors import InvarianceError


class TestCheckPolicies:
    def test_no_policies_allows(self):
        result = check_policies("anything", [])
        assert result.allowed is True

    def test_exact_allow(self):
        policies = [{"action": "search", "effect": "allow"}]
        assert check_policies("search", policies).allowed is True

    def test_exact_deny(self):
        policies = [{"action": "search", "effect": "deny"}]
        result = check_policies("search", policies)
        assert result.allowed is False
        assert "denied" in result.reason

    def test_wildcard_deny(self):
        policies = [{"action": "*", "effect": "deny"}]
        result = check_policies("anything", policies)
        assert result.allowed is False

    def test_prefix_match(self):
        policies = [{"action": "search*", "effect": "deny"}]
        assert check_policies("search_web", policies).allowed is False
        assert check_policies("other", policies).allowed is True

    def test_exact_overrides_wildcard(self):
        policies = [
            {"action": "*", "effect": "deny"},
            {"action": "search", "effect": "allow"},
        ]
        assert check_policies("search", policies).allowed is True
        assert check_policies("other", policies).allowed is False

    def test_exact_overrides_prefix(self):
        policies = [
            {"action": "search*", "effect": "deny"},
            {"action": "search", "effect": "allow"},
        ]
        assert check_policies("search", policies).allowed is True
        assert check_policies("search_deep", policies).allowed is False


class TestAssertPolicy:
    def test_allowed_does_not_raise(self):
        assert_policy("search", [{"action": "search", "effect": "allow"}])

    def test_denied_raises(self):
        with pytest.raises(InvarianceError) as exc_info:
            assert_policy("search", [{"action": "search", "effect": "deny"}])
        assert exc_info.value.code == "POLICY_DENIED"
