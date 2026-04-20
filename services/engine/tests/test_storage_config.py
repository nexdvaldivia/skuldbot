from skuldbot.libs.storage_config import resolve_storage_list_path, resolve_storage_path


def test_resolve_storage_list_path_prefers_source_for_local() -> None:
    result = resolve_storage_list_path("invoices/2026", "/legacy/path", "", "local")
    assert result == "invoices/2026"


def test_resolve_storage_list_path_uses_prefix_when_source_empty() -> None:
    result = resolve_storage_list_path("", "", "root-prefix", "s3")
    assert result == "root-prefix"


def test_resolve_storage_list_path_joins_prefix_and_source_for_cloud() -> None:
    result = resolve_storage_list_path("2026", "", "root-prefix", "s3")
    assert result == "root-prefix/2026"


def test_resolve_storage_list_path_preserves_absolute_local_source() -> None:
    result = resolve_storage_list_path("/Users/demo/files", "", "ignored", "local")
    assert result == "/Users/demo/files"


def test_resolve_storage_path_joins_local_relative_path_with_prefix() -> None:
    result = resolve_storage_path("inbox/2026", "/srv/data", "local")
    assert result == "/srv/data/inbox/2026"


def test_resolve_storage_path_keeps_cloud_prefix_semantics() -> None:
    result = resolve_storage_path("/inbox/2026", "tenant-a", "s3")
    assert result == "tenant-a/inbox/2026"
