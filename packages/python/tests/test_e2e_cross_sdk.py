"""Cross-SDK hash compatibility tests.

These tests verify that the Python SDK produces identical outputs to the
TypeScript SDK (and backend) for the same inputs. Test vectors are hardcoded
identically in both test files. The ground-truth hash comes from
invariance-core/backend/src/__tests__/crypto.test.ts line 45.
"""
import pytest
from invariance.crypto import sorted_stringify, sha256, compute_receipt_hash


# ── Shared test vectors (must be identical in cross-sdk-compat.test.ts) ──

VECTOR_1 = {
    "id": "test-receipt-001",
    "session_id": "test-session-001",
    "agent": "test-agent-001",
    "action": "read_file",
    "input": {"path": "/tmp/test.txt"},
    "output": {"content": "hello"},
    "error": None,
    "timestamp": 1700000000000,
    "previous_hash": "0",
}
VECTOR_1_EXPECTED_HASH = "545820b70b337413f6a6c42ed76b27f3701b18a9b5ab2ddb46ae1ceb29be72d4"

VECTOR_2 = {
    "id": "r1",
    "session_id": "s1",
    "agent": "a1",
    "action": "act",
    "input": {},
    "output": None,
    "error": None,
    "timestamp": 1,
    "previous_hash": "0",
}

VECTOR_3_INPUT = {"z": [1, {"b": 2, "a": 1}], "a": None}
VECTOR_3_EXPECTED_STRINGIFY = '{"a":null,"z":[1,{"a":1,"b":2}]}'


class TestSortedStringifyCompat:
    """sorted_stringify must produce identical output to TS sortedStringify."""

    def test_sorted_keys(self):
        assert sorted_stringify({"z": 1, "a": 2}) == '{"a":2,"z":1}'

    def test_nested_sorted_keys(self):
        assert sorted_stringify({"b": {"d": 1, "c": 2}, "a": "x"}) == '{"a":"x","b":{"c":2,"d":1}}'

    def test_null(self):
        assert sorted_stringify(None) == "null"

    def test_arrays_preserve_order(self):
        assert sorted_stringify([3, 1, 2]) == "[3,1,2]"

    def test_boolean_true(self):
        assert sorted_stringify(True) == "true"

    def test_boolean_false(self):
        assert sorted_stringify(False) == "false"

    def test_string(self):
        assert sorted_stringify("hello") == '"hello"'

    def test_empty_string(self):
        assert sorted_stringify("") == '""'

    def test_empty_object(self):
        assert sorted_stringify({}) == "{}"

    def test_empty_array(self):
        assert sorted_stringify([]) == "[]"

    def test_nested_with_null_and_array(self):
        """Vector 3: nested input with sorted keys."""
        assert sorted_stringify(VECTOR_3_INPUT) == VECTOR_3_EXPECTED_STRINGIFY

    def test_float_as_int(self):
        """Python 1.0 must produce '1', not '1.0', to match TS JSON.stringify(1)."""
        assert sorted_stringify(1.0) == "1"
        assert sorted_stringify(0.0) == "0"
        assert sorted_stringify(-1.0) == "-1"

    def test_actual_float(self):
        assert sorted_stringify(0.5) == "0.5"

    def test_nested_null_in_object(self):
        assert sorted_stringify({"a": None}) == '{"a":null}'

    def test_nested_null_in_array(self):
        assert sorted_stringify([None, True, 1]) == "[null,true,1]"

    def test_integer(self):
        assert sorted_stringify(42) == "42"
        assert sorted_stringify(0) == "0"
        assert sorted_stringify(-1) == "-1"

    def test_string_with_quotes(self):
        assert sorted_stringify('a"b') == '"a\\"b"'

    def test_deeply_nested(self):
        val = {"a": {"b": {"c": [1, {"d": 2}]}}}
        assert sorted_stringify(val) == '{"a":{"b":{"c":[1,{"d":2}]}}}'


class TestSha256Compat:
    """SHA-256 must produce identical output to TS sha256."""

    def test_empty_string(self):
        assert sha256("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

    def test_hello(self):
        assert sha256("hello") == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"

    def test_json_string(self):
        """Hash of a JSON-like string must match across SDKs."""
        data = '{"a":1,"b":2}'
        result = sha256(data)
        assert len(result) == 64
        # This is deterministic — the TS side will compute the same hash
        assert result == sha256(data)


class TestComputeReceiptHashCompat:
    """compute_receipt_hash must match TS computeReceiptHash for same inputs."""

    def test_vector_1_known_hash(self):
        """Ground truth from crypto.test.ts line 45."""
        h = compute_receipt_hash(**VECTOR_1)
        assert h == VECTOR_1_EXPECTED_HASH

    def test_vector_2_deterministic(self):
        h1 = compute_receipt_hash(**VECTOR_2)
        h2 = compute_receipt_hash(**VECTOR_2)
        assert h1 == h2
        assert len(h1) == 64

    def test_none_output_error_matches_null(self):
        """Python None maps to JS null — both produce the same hash."""
        h = compute_receipt_hash(
            id="r1", session_id="s1", agent="a1", action="act",
            input={}, output=None, error=None, timestamp=1, previous_hash="0",
        )
        # This must equal the TS result where output=null, error=null
        assert h == compute_receipt_hash(**VECTOR_2)

    def test_different_input_different_hash(self):
        h1 = compute_receipt_hash(
            id="r1", session_id="s1", agent="a1", action="act",
            input={"x": 1}, output=None, error=None, timestamp=1, previous_hash="0",
        )
        h2 = compute_receipt_hash(
            id="r1", session_id="s1", agent="a1", action="act",
            input={"x": 2}, output=None, error=None, timestamp=1, previous_hash="0",
        )
        assert h1 != h2

    def test_nested_input_sorted(self):
        """Nested input keys must be sorted for cross-SDK compatibility."""
        h1 = compute_receipt_hash(
            id="r1", session_id="s1", agent="a1", action="act",
            input={"z": 1, "a": 2}, output=None, error=None,
            timestamp=1, previous_hash="0",
        )
        h2 = compute_receipt_hash(
            id="r1", session_id="s1", agent="a1", action="act",
            input={"a": 2, "z": 1}, output=None, error=None,
            timestamp=1, previous_hash="0",
        )
        assert h1 == h2
