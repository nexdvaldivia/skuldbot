from skuldbot_runner.models import ClaimResponse, Job


def test_job_parses_current_orchestrator_payload():
    payload = {
        "runId": "run-123",
        "botVersionId": "ver-1",
        "inputs": {"claimId": "A-10"},
        "queuedAt": "2026-02-20T10:00:00Z",
    }

    job = Job.from_api_payload(payload)

    assert job.id == "run-123"
    assert job.bot_version_id == "ver-1"
    assert job.inputs == {"claimId": "A-10"}
    assert job.package_url is None


def test_claim_response_parses_plan_job_payload():
    payload = {
        "success": True,
        "job": {
            "runId": "run-987",
            "botVersionId": "ver-9",
            "inputs": {"foo": "bar"},
            "plan": {
                "entryStepId": "step_0",
                "run": {"botId": "fnol"},
                "steps": [],
                "policy": {"blocks": [], "warnings": []},
            },
        },
    }

    result = ClaimResponse.from_api_payload(payload)

    assert result.success is True
    assert result.job is not None
    assert result.job.id == "run-987"
    assert result.job.bot_name == "fnol"
    assert result.job.plan is not None
