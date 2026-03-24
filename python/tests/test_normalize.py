from invariance.normalize import normalize_action_type, to_snake_case, to_camel_case


class TestNormalizeActionType:
    def test_legacy_camel(self):
        assert normalize_action_type("DecisionPoint") == "decision_point"
        assert normalize_action_type("ToolCall") == "tool_invocation"
        assert normalize_action_type("SubAgentSpawn") == "sub_agent_spawn"

    def test_already_normalized(self):
        assert normalize_action_type("decision_point") == "decision_point"
        assert normalize_action_type("tool_invocation") == "tool_invocation"

    def test_unknown_passthrough(self):
        assert normalize_action_type("custom_action") == "custom_action"


class TestToSnakeCase:
    def test_known_fields(self):
        result = to_snake_case({"sessionId": "s1", "agentId": "a1", "foo": "bar"})
        assert result == {"session_id": "s1", "agent_id": "a1", "foo": "bar"}


class TestToCamelCase:
    def test_known_fields(self):
        result = to_camel_case({"session_id": "s1", "agent_id": "a1", "foo": "bar"})
        assert result == {"sessionId": "s1", "agentId": "a1", "foo": "bar"}

    def test_roundtrip(self):
        original = {"sessionId": "s1", "agentId": "a1"}
        assert to_camel_case(to_snake_case(original)) == original
