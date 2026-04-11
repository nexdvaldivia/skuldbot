import { BotDSL, DSLNode, FlowEdge, FlowNode } from "../types/flow";
import {
  buildExpressionNormalizationIndex,
  normalizeN8nExpressionsInValue,
} from "../utils/expressionSyntax";
import {
  DEFAULT_STORAGE_MODE,
  isStorageModeNodeType,
  normalizeStorageMode,
} from "./storageMode";

// Utility to remove undefined/null values and ensure JSON-serializable config
function cleanConfig(config: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const nestedCleaned = cleanConfig(value);
        if (Object.keys(nestedCleaned).length > 0) {
          cleaned[key] = nestedCleaned;
        }
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned;
}

const AI_NODES_WITH_MODEL = [
  "ai.agent",
  "ai.extract_data",
  "ai.summarize",
  "ai.classify",
  "ai.translate",
  "ai.sentiment",
  "ai.vision",
  "ai.repair_data",
  "ai.suggest_repairs",
];

const CONFIG_NODES = ["ai.model", "ai.embeddings", "ms365.connection", "vectordb.memory", "storage.provider"];

function normalizeNodeConfigForDsl(
  nodeType: string,
  rawConfig: Record<string, any>
): Record<string, any> {
  const normalized = { ...rawConfig };

  // Migration path: files.list used `path`; canonical field is now `source`.
  if (nodeType === "files.list") {
    const sourceValue =
      typeof normalized.source === "string" ? normalized.source.trim() : "";
    if (!sourceValue && normalized.path !== undefined && normalized.path !== null) {
      normalized.source = normalized.path;
    }
    delete normalized.path;
  }

  if (
    nodeType === "files.read" ||
    nodeType === "files.exists" ||
    nodeType === "files.get_info" ||
    nodeType === "files.watch" ||
    nodeType === "files.presigned_url"
  ) {
    const sourceValue =
      typeof normalized.source === "string" ? normalized.source.trim() : "";
    if (!sourceValue && normalized.path !== undefined && normalized.path !== null) {
      normalized.source = normalized.path;
    }
    delete normalized.path;
  }

  if (nodeType === "files.write") {
    const destinationValue = String(normalized.destination ?? "").trim();
    if (!destinationValue && normalized.path !== undefined && normalized.path !== null) {
      normalized.destination = normalized.path;
    } else if (!destinationValue && normalized.target !== undefined && normalized.target !== null) {
      normalized.destination = normalized.target;
    }
    delete normalized.path;
    delete normalized.target;
  }

  if (nodeType === "files.delete" || nodeType === "files.create_folder") {
    const targetValue =
      typeof normalized.target === "string" ? normalized.target.trim() : "";
    if (!targetValue && normalized.path !== undefined && normalized.path !== null) {
      normalized.target = normalized.path;
    }
    delete normalized.path;
  }

  if (
    nodeType === "data.target.csv" ||
    nodeType === "data.target.excel" ||
    nodeType === "data.target.qbo"
  ) {
    const targetPathValue =
      typeof normalized.target_path === "string" ? normalized.target_path.trim() : "";
    if (!targetPathValue && normalized.path !== undefined && normalized.path !== null) {
      normalized.target_path = normalized.path;
    }
    delete normalized.path;
  }

  if (nodeType === "data.tap.csv" || nodeType === "data.tap.excel") {
    const sourceValue =
      typeof normalized.source === "string" ? normalized.source.trim() : "";
    if (!sourceValue && normalized.path !== undefined && normalized.path !== null) {
      normalized.source = normalized.path;
    }
    delete normalized.path;
  }

  if (isStorageModeNodeType(nodeType)) {
    const rawStorageMode = normalized.storage_mode;
    if (
      rawStorageMode !== undefined &&
      rawStorageMode !== null &&
      String(rawStorageMode).trim() !== ""
    ) {
      normalized.storage_mode = normalizeStorageMode(rawStorageMode);
    }
  }

  // Migration path: storage transfer/sync older configs may use source/destination.
  if (nodeType === "storage.transfer" || nodeType === "storage.sync") {
    const sourcePathValue =
      typeof normalized.source_path === "string" ? normalized.source_path.trim() : "";
    const destPathValue =
      typeof normalized.dest_path === "string" ? normalized.dest_path.trim() : "";
    const destProviderValue =
      typeof normalized.dest_provider === "string" ? normalized.dest_provider.trim() : "";

    if (!sourcePathValue && normalized.source !== undefined && normalized.source !== null) {
      normalized.source_path = normalized.source;
    }
    if (!destPathValue && normalized.destination !== undefined && normalized.destination !== null) {
      normalized.dest_path = normalized.destination;
    }
    if (!destPathValue && normalized.dest !== undefined && normalized.dest !== null) {
      normalized.dest_path = normalized.dest;
    }
    if (!destProviderValue && normalized.destination_provider !== undefined && normalized.destination_provider !== null) {
      normalized.dest_provider = normalized.destination_provider;
    }

    delete normalized.source;
    delete normalized.destination;
    delete normalized.dest;
    delete normalized.destination_provider;
  }

  return normalized;
}

export function buildStorageConnectionConfig(
  providerId: string,
  rawConfig: Record<string, any>
): Record<string, any> {
  const provider = String(rawConfig.provider || "local");
  const configuredPrefix = rawConfig.path_prefix ?? rawConfig.prefix ?? "";
  const localRoot = rawConfig.local_path ?? rawConfig.base_path ?? "";
  const effectivePrefix =
    provider === "local" && (!configuredPrefix || String(configuredPrefix).trim() === "")
      ? localRoot
      : configuredPrefix;
  const normalized: Record<string, any> = {
    connection_type: "storage",
    provider_id: providerId,
    name: rawConfig.name || providerId || "default",
    provider,
    path_prefix: effectivePrefix,
    enable_audit: rawConfig.enable_audit,
    enable_checksums: rawConfig.enable_checksums,
  };

  if (typeof rawConfig.chunk_size_mb === "number" && rawConfig.chunk_size_mb > 0) {
    normalized.chunk_size = Math.round(rawConfig.chunk_size_mb * 1024 * 1024);
  }

  if (provider === "local") {
    normalized.local_path = localRoot;
  } else if (provider === "s3" || provider === "minio") {
    normalized.bucket = rawConfig.bucket;
    normalized.region = rawConfig.region;
    normalized.endpoint_url = rawConfig.endpoint_url;
    normalized.access_key = rawConfig.access_key;
    normalized.secret_key = rawConfig.secret_key;
    normalized.encryption = rawConfig.encryption;
    normalized.kms_key_id = rawConfig.kms_key_id;
  } else if (provider === "azure_blob") {
    normalized.container = rawConfig.container;
    normalized.connection_string = rawConfig.connection_string;
    normalized.account_name = rawConfig.account_name;
    normalized.account_key = rawConfig.account_key;
    normalized.sas_token = rawConfig.sas_token;
  } else if (provider === "gcs") {
    normalized.bucket = rawConfig.gcs_bucket ?? rawConfig.bucket;
    normalized.project = rawConfig.gcs_project ?? rawConfig.project;
    normalized.credentials_json = rawConfig.gcs_credentials_json ?? rawConfig.credentials_json;
    normalized.credentials_path = rawConfig.credentials_path;
  } else if (provider === "sharepoint") {
    normalized.site_url = rawConfig.sp_site_url ?? rawConfig.site_url;
    normalized.tenant_id = rawConfig.sp_tenant_id ?? rawConfig.tenant_id;
    normalized.client_id = rawConfig.sp_client_id ?? rawConfig.client_id;
    normalized.client_secret = rawConfig.sp_client_secret ?? rawConfig.client_secret;
    normalized.library = rawConfig.sp_library ?? rawConfig.library;
  } else if (provider === "onedrive") {
    normalized.tenant_id = rawConfig.od_tenant_id ?? rawConfig.tenant_id;
    normalized.client_id = rawConfig.od_client_id ?? rawConfig.client_id;
    normalized.client_secret = rawConfig.od_client_secret ?? rawConfig.client_secret;
    normalized.user_email = rawConfig.od_user_email ?? rawConfig.user_email;
  } else if (provider === "google_drive") {
    normalized.credentials_json = rawConfig.gd_credentials_json ?? rawConfig.credentials_json;
    normalized.credentials_path = rawConfig.credentials_path;
    normalized.folder_id = rawConfig.gd_folder_id ?? rawConfig.folder_id;
    normalized.shared_drive_id = rawConfig.shared_drive_id;
  } else if (provider === "sftp") {
    normalized.host = rawConfig.sftp_host ?? rawConfig.host;
    normalized.port = rawConfig.sftp_port ?? rawConfig.port;
    normalized.username = rawConfig.sftp_username ?? rawConfig.username;
    normalized.password = rawConfig.sftp_password ?? rawConfig.password;
    normalized.private_key_path = rawConfig.sftp_private_key ?? rawConfig.private_key_path;
    normalized.private_key_passphrase = rawConfig.sftp_passphrase ?? rawConfig.private_key_passphrase;
    normalized.host_key = rawConfig.sftp_host_key ?? rawConfig.host_key;
  } else if (provider === "ftp") {
    normalized.host = rawConfig.ftp_host ?? rawConfig.host;
    normalized.port = rawConfig.ftp_port ?? rawConfig.port;
    normalized.username = rawConfig.ftp_username ?? rawConfig.username;
    normalized.password = rawConfig.ftp_password ?? rawConfig.password;
    normalized.secure = rawConfig.ftp_secure ?? rawConfig.secure;
  } else if (provider === "webdav") {
    normalized.url = rawConfig.webdav_url ?? rawConfig.url;
    normalized.username = rawConfig.webdav_username ?? rawConfig.username;
    normalized.password = rawConfig.webdav_password ?? rawConfig.password;
    normalized.auth_type = rawConfig.webdav_auth_type ?? rawConfig.auth_type;
    normalized.verify_ssl = rawConfig.webdav_verify_ssl ?? rawConfig.verify_ssl;
  }

  return cleanConfig(normalized);
}

function clearStoragePathFieldsForProviderOnly(
  nodeType: string,
  config: Record<string, any>
): Record<string, any> {
  if (config.storage_mode !== "provider_only") {
    return config;
  }

  const normalized = { ...config };
  const strip = (key: string) => {
    if (key in normalized) delete normalized[key];
    if (key === "target_path" && "path" in normalized) delete normalized.path;
  };

  if (
    nodeType === "files.read" ||
    nodeType === "files.exists" ||
    nodeType === "files.get_info" ||
    nodeType === "files.watch" ||
    nodeType === "files.presigned_url" ||
    nodeType === "files.list" ||
    nodeType === "data.tap.csv" ||
    nodeType === "data.tap.excel"
  ) {
    strip("source");
    strip("path");
  } else if (nodeType === "files.write") {
    strip("destination");
    strip("path");
    strip("target");
  } else if (
    nodeType === "files.copy" ||
    nodeType === "files.move" ||
    nodeType === "files.zip" ||
    nodeType === "files.unzip"
  ) {
    strip("source");
    strip("destination");
  } else if (nodeType === "files.delete" || nodeType === "files.create_folder") {
    strip("target");
    strip("path");
  } else if (
    nodeType === "data.target.csv" ||
    nodeType === "data.target.excel" ||
    nodeType === "data.target.qbo"
  ) {
    strip("target_path");
  }

  return normalized;
}

export function buildExecutionDSL(
  bot: { id: string; name: string; description?: string },
  nodes: FlowNode[],
  edges: FlowEdge[]
): BotDSL {
  const expressionIndex = buildExpressionNormalizationIndex(nodes);
  const findServiceConnectionEdge = (
    targetNodeId: string,
    sourceNodeType: "ms365.connection" | "storage.provider"
  ) =>
    edges.find((e) => {
      if (e.target !== targetNodeId) return false;
      const sourceNode = nodes.find((n) => n.id === e.source);
      if (!sourceNode || sourceNode.data.nodeType !== sourceNodeType) return false;

      // Primary path: explicit connection wiring.
      if (e.targetHandle === "connection" && (e.data?.edgeType === "connection" || e.sourceHandle === "connection-out")) {
        return true;
      }

      // Backward compatibility for legacy edges that may miss type/handles.
      if (e.data?.edgeType === "connection") return true;
      if (e.sourceHandle === "connection-out") return true;
      if (!e.sourceHandle && !e.targetHandle) return true;
      if (sourceNodeType === "storage.provider") {
        const targetNode = nodes.find((n) => n.id === targetNodeId);
        if (
          targetNode &&
          (targetNode.data.nodeType === "storage.transfer" ||
            targetNode.data.nodeType === "storage.sync" ||
            isStorageModeNodeType(targetNode.data.nodeType))
        ) {
          return true;
        }
      }

      return false;
    });

  const executableNodes = nodes.filter(
    (node) => !CONFIG_NODES.includes(node.data.nodeType)
  );

  const dslNodes = executableNodes.map((node) => {
    const successEdge = edges.find(
      (e) => e.source === node.id && e.sourceHandle === "success"
    );
    const errorEdge = edges.find(
      (e) => e.source === node.id && e.sourceHandle === "error"
    );

    let tools: { nodeId: string; name: string; description: string }[] | undefined;
    let memory: Record<string, any> | undefined;
    let model_config: Record<string, any> | undefined;

    if (AI_NODES_WITH_MODEL.includes(node.data.nodeType)) {
      const modelEdge = edges.find(
        (e) => e.target === node.id && e.targetHandle === "model" && e.data?.edgeType === "model"
      );
      if (modelEdge) {
        const modelNode = nodes.find((n) => n.id === modelEdge.source);
        if (modelNode && modelNode.data.nodeType === "ai.model") {
          const modConfig = modelNode.data.config || {};
          const resolvedModel =
            (typeof modConfig.custom_model === "string" && modConfig.custom_model.trim().length > 0)
              ? modConfig.custom_model
              : modConfig.model || "gpt-4o";
          model_config = {
            provider: modConfig.provider || "openai",
            model: resolvedModel,
            temperature: modConfig.temperature ?? 0.7,
          };
          if (modConfig.max_tokens) {
            model_config.max_tokens = modConfig.max_tokens;
          }
          if (modConfig.provider === "openai") {
            model_config.api_key = modConfig.api_key;
          } else if (modConfig.provider === "anthropic") {
            model_config.api_key = modConfig.api_key;
          } else if (modConfig.provider === "azure") {
            model_config.api_key = modConfig.api_key;
            model_config.base_url = modConfig.base_url;
            model_config.api_version = modConfig.api_version;
          } else if (modConfig.provider === "ollama") {
            model_config.base_url = modConfig.base_url || "http://localhost:11434";
          } else if (modConfig.provider === "google") {
            model_config.api_key = modConfig.api_key;
          } else if (modConfig.provider === "aws") {
            model_config.aws_access_key = modConfig.aws_access_key;
            model_config.aws_secret_key = modConfig.aws_secret_key;
            model_config.region = modConfig.region;
          } else if (modConfig.provider === "groq") {
            model_config.api_key = modConfig.api_key;
          } else if (modConfig.provider === "mistral") {
            model_config.api_key = modConfig.api_key;
          }
        }
      }
    }

    if (node.data.nodeType === "ai.agent") {
      const toolEdges = edges.filter(
        (e) => e.target === node.id && e.targetHandle === "tools" && e.data?.edgeType === "tool"
      );
      if (toolEdges.length > 0) {
        tools = toolEdges.map((edge) => {
          const sourceNode = nodes.find((n) => n.id === edge.source);
          return {
            nodeId: edge.source,
            name:
              edge.data?.toolName ||
              sourceNode?.data.label.toLowerCase().replace(/\s+/g, "_") ||
              "unknown_tool",
            description: edge.data?.toolDescription || `Execute ${sourceNode?.data.label || "node"}`,
          };
        });
      }

      const memoryEdge = edges.find(
        (e) => e.target === node.id && e.targetHandle === "memory" && e.data?.edgeType === "memory"
      );
      if (memoryEdge) {
        const memoryNode = nodes.find((n) => n.id === memoryEdge.source);
        if (memoryNode && memoryNode.data.nodeType === "vectordb.memory") {
          const memConfig = memoryNode.data.config || {};
          memory = {
            provider: memConfig.provider || "chroma",
            collection: memConfig.collection || "agent_memory",
            memory_type: memoryEdge.data?.memoryType || memConfig.memory_type || "both",
            top_k: memConfig.top_k || 5,
            min_score: memConfig.min_score || 0.5,
          };
          if (memConfig.provider === "pgvector") {
            memory.connection_params = {
              host: memConfig.host,
              port: memConfig.port,
              database: memConfig.database,
              user: memConfig.user,
              password: memConfig.password,
              table: memConfig.table,
            };
          } else if (memConfig.provider === "supabase") {
            memory.connection_params = {
              url: memConfig.url,
              api_key: memConfig.api_key,
              table: memConfig.table,
            };
          } else if (memConfig.provider === "pinecone") {
            memory.connection_params = {
              api_key: memConfig.api_key,
              index_name: memConfig.index_name,
              namespace: memConfig.namespace,
            };
          } else if (memConfig.provider === "qdrant") {
            memory.connection_params = {
              host: memConfig.host,
              port: memConfig.port,
              api_key: memConfig.api_key,
              collection: memConfig.collection,
            };
          } else if (memConfig.provider === "chroma" && memConfig.persist_directory) {
            memory.connection_params = {
              persist_directory: memConfig.persist_directory,
            };
          }
        }
      }
    }

    let embeddings: Record<string, any> | undefined;
    const embeddingsEdge = edges.find(
      (e) => e.target === node.id && e.targetHandle === "embeddings" && e.data?.edgeType === "embeddings"
    );
    if (embeddingsEdge) {
      const embeddingsNode = nodes.find((n) => n.id === embeddingsEdge.source);
      if (embeddingsNode && embeddingsNode.data.nodeType === "ai.embeddings") {
        const embConfig = embeddingsNode.data.config || {};
        embeddings = {
          provider: embConfig.provider || "openai",
          model: embConfig.model || "text-embedding-3-small",
          dimension: embConfig.dimension || 1536,
        };
        if (embConfig.provider === "openai") {
          embeddings.api_key = embConfig.api_key;
        } else if (embConfig.provider === "azure") {
          embeddings.api_key = embConfig.api_key;
          embeddings.base_url = embConfig.base_url;
          embeddings.api_version = embConfig.api_version;
        } else if (embConfig.provider === "ollama") {
          embeddings.base_url = embConfig.base_url || "http://localhost:11434";
        } else if (embConfig.provider === "cohere") {
          embeddings.api_key = embConfig.api_key;
        } else if (embConfig.provider === "huggingface") {
          embeddings.api_key = embConfig.api_key;
          embeddings.base_url = embConfig.base_url;
        } else if (embConfig.provider === "google") {
          embeddings.api_key = embConfig.api_key;
          embeddings.project_id = embConfig.project_id;
          embeddings.location = embConfig.location;
        } else if (embConfig.provider === "aws") {
          embeddings.aws_access_key = embConfig.aws_access_key;
          embeddings.aws_secret_key = embConfig.aws_secret_key;
          embeddings.region = embConfig.region;
        }
      }
    }

    const needsMS365Connection =
      node.data.nodeType === "trigger.ms365_email" ||
      (node.data.nodeType.startsWith("ms365.") && node.data.nodeType !== "ms365.connection");

    let connection_config: Record<string, any> | undefined;
    if (needsMS365Connection) {
      const connectionEdge = findServiceConnectionEdge(node.id, "ms365.connection");
      if (connectionEdge) {
        const connectionNode = nodes.find((n) => n.id === connectionEdge.source);
        if (connectionNode && connectionNode.data.nodeType === "ms365.connection") {
          const connConfig = connectionNode.data.config || {};
          connection_config = {
            tenant_id: connConfig.tenant_id,
            client_id: connConfig.client_id,
            client_secret: connConfig.client_secret,
            user_email: connConfig.user_email,
          };
        }
      }
    }

    const normalizedNodeType = node.data.nodeType;

    let normalizedNodeConfig = normalizeNodeConfigForDsl(
      normalizedNodeType,
      normalizeN8nExpressionsInValue(
        node.data.config || {},
        expressionIndex,
        node.id
      ) as Record<string, any>
    );

    const initialStorageProviderEdge = findServiceConnectionEdge(node.id, "storage.provider");
    if (isStorageModeNodeType(normalizedNodeType) && !normalizedNodeConfig.storage_mode) {
      normalizedNodeConfig.storage_mode = initialStorageProviderEdge
        ? "provider_relative_path"
        : "absolute_path_only";
    }
    normalizedNodeConfig = clearStoragePathFieldsForProviderOnly(normalizedNodeType, normalizedNodeConfig);

    // Storage provider connection for storage-aware nodes
    const storageMode = isStorageModeNodeType(normalizedNodeType)
      ? normalizeStorageMode(
          normalizedNodeConfig.storage_mode,
          initialStorageProviderEdge ? "provider_relative_path" : "absolute_path_only"
        )
      : DEFAULT_STORAGE_MODE;
    const needsStorageProvider =
      normalizedNodeType === "storage.transfer" ||
      normalizedNodeType === "storage.sync" ||
      (isStorageModeNodeType(normalizedNodeType) && storageMode !== "absolute_path_only");
    const storageProviderEdge = needsStorageProvider
      ? findServiceConnectionEdge(node.id, "storage.provider")
      : undefined;

    if (needsStorageProvider && !connection_config) {
      if (storageProviderEdge) {
        const storageNode = nodes.find((n) => n.id === storageProviderEdge.source);
        if (storageNode && storageNode.data.nodeType === "storage.provider") {
          const storageConfig = storageNode.data.config || {};
          connection_config = buildStorageConnectionConfig(storageNode.id, storageConfig);
        }
      }
    }

    if (
      normalizedNodeType === "files.list" &&
      storageProviderEdge &&
      storageMode === "provider_only"
    ) {
      // Provider-driven behavior: list source comes from storage.provider root/prefix.
      delete normalizedNodeConfig.source;
      delete normalizedNodeConfig.path;
    }

    if (isStorageModeNodeType(normalizedNodeType) && storageMode === "absolute_path_only") {
      connection_config = undefined;
    }

    const dslNode: DSLNode = {
      id: node.id,
      type: node.data.nodeType,
      config: cleanConfig(normalizedNodeConfig),
      outputs: {
        success: successEdge?.target || "END",
        error: errorEdge?.target || "END",
      },
      label: node.data.label,
    };

    if (tools && tools.length > 0) {
      dslNode.tools = tools.map(t => cleanConfig(t) as { nodeId: string; name: string; description: string });
    }
    if (model_config) {
      dslNode.model_config_ = cleanConfig(model_config) as DSLNode["model_config_"];
    }
    if (memory) {
      dslNode.memory = cleanConfig(memory) as DSLNode["memory"];
    }
    if (embeddings) {
      dslNode.embeddings = cleanConfig(embeddings) as DSLNode["embeddings"];
    }
    if (connection_config) {
      dslNode.connection_config = cleanConfig(connection_config);
    }

    return dslNode;
  });

  const triggerNodes = executableNodes.filter((node) => node.data.category === "trigger");
  const triggerIds = triggerNodes.map((node) => node.id);

  let startNode: string | undefined;
  if (triggerNodes.length > 0) {
    startNode = triggerNodes[0].id;
  } else if (executableNodes.length > 0) {
    startNode = executableNodes[0].id;
  }

  const dsl = {
    version: "1.0",
    bot: {
      id: bot.id,
      name: bot.name,
      description: bot.description,
    },
    nodes: dslNodes,
    triggers: triggerIds.length > 0 ? triggerIds : undefined,
    start_node: startNode,
  };
  
  // Clean entire DSL to remove undefined values (JSON.stringify doesn't handle them well)
  return JSON.parse(JSON.stringify(dsl));
}
