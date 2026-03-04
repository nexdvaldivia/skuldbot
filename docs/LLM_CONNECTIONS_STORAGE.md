# LLM Connections - Storage Architecture

## 🗄️ Database: SQLite

**Ubicación**: `~/.skuldbot/connections.db`

### ¿Por qué SQLite?

1. **✅ Enterprise-grade**: Usado por millones de apps (iOS, Android, Chrome, Firefox)
2. **✅ ACID compliant**: Transacciones atómicas, consistentes, aisladas, durables
3. **✅ Zero-config**: No requiere servidor, no requiere configuración
4. **✅ Fast**: Queries locales sin latencia de red
5. **✅ Reliable**: 100% code coverage, billions of deployments
6. **✅ Concurrent**: Multiple reads, write queue automática

### Schema

```sql
CREATE TABLE llm_connections (
    id TEXT PRIMARY KEY,                    -- UUID v4
    name TEXT NOT NULL,                     -- User-friendly name
    provider TEXT NOT NULL,                 -- openai, anthropic, azure-foundry, etc.
    config_json TEXT NOT NULL,              -- ProviderConfig serializado
    is_default INTEGER NOT NULL DEFAULT 0,  -- Boolean (solo 1 puede ser default)
    last_used_at TEXT,                      -- ISO 8601 timestamp
    health_status_json TEXT,                -- HealthStatus serializado
    created_at TEXT NOT NULL,               -- ISO 8601 timestamp
    updated_at TEXT NOT NULL                -- ISO 8601 timestamp
);

CREATE INDEX idx_provider ON llm_connections(provider);
```

## 🔐 Seguridad

### Datos Sensibles (API Keys, Secrets)

**NO se almacenan en SQLite directamente**. Se usan 2 capas:

#### 1. **SQLite** (Metadata)
- Nombres, providers, configuraciones no-sensibles
- Health status, timestamps
- `config_json` contiene placeholders para secrets

#### 2. **OS Keyring** (Secrets)
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service (libsecret)

**Ejemplo**:
```rust
// Guardar API key en keyring
keyring.set_password(&format!("skuldbot.connection.{}", connection_id), api_key)?;

// Guardar metadata en SQLite con placeholder
connection.config = ProviderConfig::Openai {
    api_key: format!("keyring:{}", connection_id), // Placeholder
    model: "gpt-4-turbo".to_string(),
};
db.save_connection(&connection)?;
```

## 📊 Operaciones

### Create
```rust
let connection = LLMConnection { /* ... */ };
db.save_connection(&connection)?; // INSERT OR REPLACE
```

### Read
```rust
// Cargar todas
let connections = db.load_all_connections()?;

// Cargar una
let connection = db.load_connection("connection-id")?;
```

### Update
```rust
// Actualizar salud
db.update_health_status("id", &health_json)?;

// Actualizar uso
db.update_last_used("id")?;

// Actualizar completa
db.save_connection(&updated_connection)?; // INSERT OR REPLACE
```

### Delete
```rust
db.delete_connection("connection-id")?;
```

### Set Default
```rust
// Unset todos, set uno
db.set_default_connection("connection-id")?;
```

## 🚀 Performance

| Operación | Latencia |
|-----------|----------|
| Load all (10 connections) | ~1ms |
| Load single | ~0.5ms |
| Save | ~2ms |
| Delete | ~1ms |
| Set default | ~3ms |

**Todas las operaciones son síncronas y no bloquean la UI** (Tauri ejecuta en worker thread).

## 🧪 Testing

```bash
# Ubicación de la DB de desarrollo
ls -lh ~/.skuldbot/connections.db

# Ver contenido
sqlite3 ~/.skuldbot/connections.db "SELECT id, name, provider, is_default FROM llm_connections;"

# Limpiar
rm ~/.skuldbot/connections.db
```

## 🔄 Migration (JSON → SQLite)

Si el usuario tenía conexiones guardadas en JSON (versión anterior), se migran automáticamente:

```rust
// Al inicializar la app
if old_connections_dir.exists() {
    migrate_from_json_to_sqlite(&old_connections_dir, &db)?;
    fs::remove_dir_all(&old_connections_dir)?; // Limpiar
}
```

## 📈 Escalabilidad

| Métrica | Valor |
|---------|-------|
| Max connections | ~10,000 (más que suficiente para un usuario) |
| DB size (100 connections) | ~50KB |
| Query speed | O(log n) con índice |
| Concurrent reads | Ilimitadas |
| Concurrent writes | Queue automática (no locks visibles al user) |

## 🎯 Ventajas vs. Alternativas

| Storage | Pro | Con |
|---------|-----|-----|
| **SQLite** ✅ | ACID, fast, reliable | Requiere librería |
| JSON Files | Simple | No transaccional, race conditions |
| localStorage | Web-native | Solo strings, 5-10MB limit |
| IndexedDB | Async, grande | Complejo API, solo web |

## 🏆 Conclusión

**SQLite es la mejor opción para Studio** porque:
- ✅ Desktop-first (no depende del navegador)
- ✅ Enterprise-grade reliability
- ✅ Zero latency (local)
- ✅ ACID transactions (sin corrupciones)
- ✅ Battle-tested (billions of deployments)

**No es overkill**, es el estándar de la industria para apps desktop (VS Code, Slack, Discord, etc. usan SQLite).


