import csv
from pathlib import Path

from skuldbot.libs.data import DataLibrary


def _read_csv_rows(path: Path):
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def test_load_to_csv_with_columns_constructor_objects(tmp_path):
    lib = DataLibrary()
    out = tmp_path / "constructed.csv"

    records = [
        {
            "fecha_transaccion": "02/01/2024",
            "descripcion": "Pago tarjeta",
            "monto": 420.87,
            "meta": {"tipo": "credito"},
        }
    ]
    columns = """
    [
      {"header": "Date", "field": "fecha_transaccion"},
      {"header": "Description", "field": "descripcion"},
      {"header": "Amount", "field": "monto"},
      {"header": "Type", "field": "meta.tipo", "default": "cargo"}
    ]
    """

    result = lib.load_to_csv(str(out), records, columns=columns)
    rows = _read_csv_rows(out)

    assert result["insertedCount"] == 1
    assert rows[0]["Date"] == "02/01/2024"
    assert rows[0]["Description"] == "Pago tarjeta"
    assert rows[0]["Amount"] == "420.87"
    assert rows[0]["Type"] == "credito"


def test_load_to_csv_with_columns_constructor_string_list(tmp_path):
    lib = DataLibrary()
    out = tmp_path / "constructed_simple.csv"

    records = [
        {"a": "1", "b": "2", "c": "3"},
    ]

    result = lib.load_to_csv(str(out), records, columns="c,a")
    rows = _read_csv_rows(out)

    assert result["insertedCount"] == 1
    assert list(rows[0].keys()) == ["c", "a"]
    assert rows[0]["c"] == "3"
    assert rows[0]["a"] == "1"


def test_load_to_csv_accepts_directory_path(tmp_path):
    lib = DataLibrary()
    destination_dir = tmp_path / "exports"
    destination_dir.mkdir(parents=True, exist_ok=True)

    records = [{"Date": "03/10/2026", "Description": "Pago", "Amount": "-20.0"}]
    result = lib.load_to_csv(str(destination_dir), records)

    expected_file = destination_dir / "output.csv"
    rows = _read_csv_rows(expected_file)

    assert expected_file.exists()
    assert result["insertedCount"] == 1
    assert result["path"] == str(expected_file)
    assert rows[0]["Date"] == "03/10/2026"
