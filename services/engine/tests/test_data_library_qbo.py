from pathlib import Path

from skuldbot.libs.data import DataLibrary


def _read_text(path: Path, encoding: str = "cp1252") -> str:
    return path.read_text(encoding=encoding)


def test_load_to_qbo_writes_ofx_content(tmp_path):
    lib = DataLibrary()
    out = tmp_path / "bank.qbo"

    records = [
        {"date": "2026-04-01", "amount": -45.67, "name": "Grocery Store", "memo": "Weekly shop"},
        {"date": "2026-04-02", "amount": 1200.00, "name": "Payroll", "memo": "Salary", "fitid": "PAY-001"},
    ]

    result = lib.load_to_qbo(str(out), records)
    content = _read_text(out)

    assert result["insertedCount"] == 2
    assert result["errorCount"] == 0
    assert result["path"] == str(out)
    assert "<OFX>" in content
    assert "<BANKMSGSRSV1>" in content
    assert "<TRNAMT>-45.67" in content
    assert "<FITID>PAY-001" in content


def test_load_to_qbo_accepts_directory_path(tmp_path):
    lib = DataLibrary()
    destination_dir = tmp_path / "exports"
    destination_dir.mkdir(parents=True, exist_ok=True)

    result = lib.load_to_qbo(str(destination_dir), [{"date": "2026-04-03", "amount": "10.50"}])
    expected_file = destination_dir / "output.qbo"

    assert expected_file.exists()
    assert result["path"] == str(expected_file)
    assert result["insertedCount"] == 1


def test_load_to_qbo_credit_card_envelope(tmp_path):
    lib = DataLibrary()
    out = tmp_path / "credit.qbo"

    lib.load_to_qbo(
        str(out),
        [{"date": "2026-04-04", "amount": -12.5}],
        account_type="CREDITCARD",
        account_id="4111111111111111",
    )
    content = _read_text(out)

    assert "<CREDITCARDMSGSRSV1>" in content
    assert "<CCACCTFROM>" in content
    assert "<BANKMSGSRSV1>" not in content


def test_load_to_qbo_collects_record_errors(tmp_path):
    lib = DataLibrary()
    out = tmp_path / "errors.qbo"

    records = [
        {"date": "2026-04-05", "amount": "abc"},
        {"date": "2026-04-05", "amount": "15.00", "name": "Valid Tx"},
    ]

    result = lib.load_to_qbo(str(out), records)

    assert result["insertedCount"] == 1
    assert result["errorCount"] == 1
    assert result["errors"]


def test_load_to_qbo_accepts_common_csv_header_aliases(tmp_path):
    lib = DataLibrary()
    out = tmp_path / "aliases.qbo"

    # Typical CSV headers from banking exports (capitalized keys).
    records = [
        {"Date": "2026-04-06", "Description": "Coffee Shop", "Amount": "-5.25"},
        {"Date": "2026-04-07", "Description": "Refund", "Amount": "12.00"},
    ]

    result = lib.load_to_qbo(str(out), records)
    content = _read_text(out)

    assert result["insertedCount"] == 2
    assert result["errorCount"] == 0
    assert "<NAME>Coffee Shop" in content
    assert "<TRNAMT>-5.25" in content
    assert "<TRNAMT>12.00" in content


def test_load_to_qbo_accepts_mm_dd_yy_dates(tmp_path):
    lib = DataLibrary()
    out = tmp_path / "short-year.qbo"

    records = [
        {"Date": "12/24/24", "Description": "OpenAI", "Amount": "-20"},
        {"Date": "1/2/25", "Description": "Payment", "Amount": "420.87"},
    ]

    result = lib.load_to_qbo(
        str(out),
        records,
        date_field="Date",
        amount_field="Amount",
        payee_field="Description",
    )

    assert result["insertedCount"] == 2
    assert result["errorCount"] == 0


def test_load_to_qbo_raises_when_all_records_invalid(tmp_path):
    lib = DataLibrary()
    out = tmp_path / "all-invalid.qbo"

    records = [
        {"Date": "bad-date", "Amount": "-10"},
        {"Date": "another-bad", "Amount": "20"},
    ]

    try:
        lib.load_to_qbo(str(out), records, date_field="Date", amount_field="Amount")
        assert False, "Expected ValueError when all records are invalid"
    except ValueError as exc:
        assert "No valid QBO transactions were produced" in str(exc)
