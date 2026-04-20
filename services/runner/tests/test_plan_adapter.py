from skuldbot_runner.plan_adapter import execution_plan_to_dsl


def test_execution_plan_to_dsl_maps_jumps_and_entry():
    plan = {
        "entryStepId": "step_0",
        "steps": [
            {
                "stepId": "step_0",
                "nodeId": "trigger-1",
                "type": "trigger.manual",
                "resolvedConfig": {},
                "jumps": [
                    {"on": "success", "toStepId": "step_1"},
                    {"on": "error", "toStepId": "END"},
                ],
            },
            {
                "stepId": "step_1",
                "nodeId": "log-1",
                "type": "control.log",
                "resolvedConfig": {"message": "ok"},
                "jumps": [
                    {"on": "success", "toStepId": "END"},
                    {"on": "error", "toStepId": "END"},
                ],
            },
        ],
    }

    dsl = execution_plan_to_dsl(plan=plan, run_id="run-1", bot_name="Bot A")

    assert dsl["bot"]["id"] == "run-1"
    assert dsl["start_node"] == "trigger-1"
    assert len(dsl["nodes"]) == 2

    first = dsl["nodes"][0]
    assert first["outputs"]["success"] == "log-1"
    assert first["outputs"]["error"] == "END"
