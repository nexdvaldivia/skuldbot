export type StorageMode =
  | "provider_only"
  | "absolute_path_only"
  | "provider_relative_path";

export const STORAGE_MODE_VALUES: StorageMode[] = [
  "provider_only",
  "absolute_path_only",
  "provider_relative_path",
];

export const DEFAULT_STORAGE_MODE: StorageMode = "provider_relative_path";

const STORAGE_MODE_NODE_EXACT = new Set<string>([
  "data.tap.csv",
  "data.tap.excel",
  "data.target.csv",
  "data.target.excel",
  "data.target.qbo",
]);

export function isStorageModeNodeType(nodeType: string): boolean {
  return nodeType.startsWith("files.") || STORAGE_MODE_NODE_EXACT.has(nodeType);
}

export function normalizeStorageMode(
  value: unknown,
  fallback: StorageMode = DEFAULT_STORAGE_MODE
): StorageMode {
  if (typeof value === "string") {
    const candidate = value.trim().toLowerCase();
    if (
      candidate === "provider_only" ||
      candidate === "absolute_path_only" ||
      candidate === "provider_relative_path"
    ) {
      return candidate;
    }
  }
  return fallback;
}

export function getStoragePathFieldsForNodeType(nodeType: string): string[] {
  switch (nodeType) {
    case "files.read":
    case "files.exists":
    case "files.get_info":
    case "files.watch":
    case "files.presigned_url":
    case "files.list":
    case "data.tap.csv":
    case "data.tap.excel":
      return ["source"];
    case "files.write":
      return ["destination"];
    case "files.copy":
    case "files.move":
    case "files.zip":
    case "files.unzip":
      return ["source", "destination"];
    case "files.delete":
    case "files.create_folder":
      return ["target"];
    case "data.target.csv":
    case "data.target.excel":
    case "data.target.qbo":
      return ["target_path"];
    default:
      return [];
  }
}

export function isStoragePathField(nodeType: string, fieldName: string): boolean {
  return getStoragePathFieldsForNodeType(nodeType).includes(fieldName);
}
