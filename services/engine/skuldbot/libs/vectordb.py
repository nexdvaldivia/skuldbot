"""
Librería SkuldVectorDB para Vector Stores y RAG (Robot Framework)

Proporciona keywords para integración con bases de datos vectoriales:
- pgvector (PostgreSQL con extensión vector) - LOCAL/On-Premise
- Pinecone (Serverless)
- Qdrant (Self-hosted o Cloud)
- ChromaDB (Open Source, Local)

Casos de uso:
- RAG (Retrieval Augmented Generation) para agentes AI
- Búsqueda semántica en documentos
- Memory/contexto para conversaciones de agentes
- Deduplicación semántica
- Clasificación por similitud

Provider Recommendations:
    - Healthcare (HIPAA): pgvector (on-premise) o Qdrant (self-hosted)
    - Finance (SOX/PCI): pgvector (on-premise)
    - General: Cualquier provider
    - Development: ChromaDB (local, sin config)
"""

import json
import uuid
import hashlib
from typing import Any, Dict, List, Optional, Union, Tuple
from dataclasses import dataclass, field
from enum import Enum
from robot.api.deco import keyword, library
from robot.api import logger


class VectorDBProvider(Enum):
    """Proveedores de Vector DB soportados"""
    PGVECTOR = "pgvector"
    PINECONE = "pinecone"
    QDRANT = "qdrant"
    CHROMA = "chroma"
    SUPABASE = "supabase"


@dataclass
class VectorDBConfig:
    """Configuración del proveedor de Vector DB"""
    provider: VectorDBProvider
    # Connection params
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None
    api_key: Optional[str] = None
    # Vector params
    collection: Optional[str] = None
    table: Optional[str] = None
    dimension: int = 1536
    # Advanced
    ssl: bool = False
    ssl_mode: str = "prefer"
    pool_size: int = 5
    index_type: str = "ivfflat"  # ivfflat, hnsw, none
    metric: str = "cosine"  # cosine, euclidean, dotproduct
    extra_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class VectorSearchResult:
    """Resultado de búsqueda vectorial"""
    id: str
    score: float
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EmbeddingConfig:
    """Configuración para generación de embeddings"""
    provider: str = "openai"  # openai, azure, ollama, local
    model: str = "text-embedding-3-small"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    dimension: int = 1536


@library(scope="GLOBAL", auto_keywords=True)
class SkuldVectorDB:
    """
    Librería de Vector Databases para Skuldbot.

    Proporciona keywords para:
    - Conexión a diferentes vector stores
    - Upsert de documentos con embeddings
    - Búsqueda semántica (similarity search)
    - Gestión de colecciones/tablas
    - Integración con AI Agent para RAG

    Soporta: pgvector (PostgreSQL), Pinecone, Qdrant, ChromaDB.
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self._config: Optional[VectorDBConfig] = None
        self._client: Any = None
        self._embedding_config: Optional[EmbeddingConfig] = None
        self._embedding_client: Any = None
        self._connections: Dict[str, Any] = {}  # Para múltiples conexiones

    # =========================================================================
    # CONFIGURACIÓN DE EMBEDDINGS
    # =========================================================================

    @keyword("Configure Embeddings Provider")
    def configure_embeddings_provider(
        self,
        provider: str = "openai",
        api_key: Optional[str] = None,
        model: str = "text-embedding-3-small",
        base_url: Optional[str] = None,
        dimension: int = 1536,
    ):
        """
        Configura el proveedor de embeddings.

        Args:
            provider: Proveedor (openai, azure, ollama, local)
            api_key: API key
            model: Modelo de embeddings
            base_url: URL base (para Azure/Ollama)
            dimension: Dimensión del vector

        Example:
            | Configure Embeddings Provider | openai | ${api_key} | text-embedding-3-small |
            | Configure Embeddings Provider | ollama | | nomic-embed-text | base_url=http://localhost:11434 |
        """
        self._embedding_config = EmbeddingConfig(
            provider=provider.lower(),
            api_key=api_key,
            model=model,
            base_url=base_url,
            dimension=dimension,
        )

        # Initialize embedding client
        self._init_embedding_client()
        logger.info(f"Embeddings provider configured: {provider} with model {model}")

    def _init_embedding_client(self):
        """Inicializa el cliente de embeddings"""
        if not self._embedding_config:
            return

        provider = self._embedding_config.provider

        if provider == "openai":
            try:
                from openai import OpenAI
                self._embedding_client = OpenAI(
                    api_key=self._embedding_config.api_key,
                    base_url=self._embedding_config.base_url,
                )
            except ImportError:
                logger.warn("openai package not installed. Install with: pip install openai")

        elif provider == "azure":
            try:
                from openai import AzureOpenAI
                self._embedding_client = AzureOpenAI(
                    api_key=self._embedding_config.api_key,
                    azure_endpoint=self._embedding_config.base_url,
                    api_version="2024-02-15-preview",
                )
            except ImportError:
                logger.warn("openai package not installed. Install with: pip install openai")

        elif provider == "ollama":
            try:
                from openai import OpenAI
                self._embedding_client = OpenAI(
                    api_key="ollama",
                    base_url=self._embedding_config.base_url or "http://localhost:11434/v1",
                )
            except ImportError:
                logger.warn("openai package not installed. Install with: pip install openai")

    @keyword("Generate Embedding")
    def generate_embedding(self, text: str) -> List[float]:
        """
        Genera embedding para un texto.

        Args:
            text: Texto para generar embedding

        Returns:
            Lista de floats (vector)

        Example:
            | ${vector}= | Generate Embedding | Hello world |
        """
        if not self._embedding_client or not self._embedding_config:
            raise ValueError("Embeddings provider not configured. Use 'Configure Embeddings Provider' first.")

        try:
            response = self._embedding_client.embeddings.create(
                input=text,
                model=self._embedding_config.model,
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            return []

    @keyword("Generate Embeddings Batch")
    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Genera embeddings para múltiples textos en batch.

        Args:
            texts: Lista de textos

        Returns:
            Lista de vectores

        Example:
            | ${vectors}= | Generate Embeddings Batch | ${texts_list} |
        """
        if not self._embedding_client or not self._embedding_config:
            raise ValueError("Embeddings provider not configured.")

        try:
            response = self._embedding_client.embeddings.create(
                input=texts,
                model=self._embedding_config.model,
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            logger.error(f"Failed to generate batch embeddings: {e}")
            return []

    # =========================================================================
    # PGVECTOR - PostgreSQL con extensión vector
    # =========================================================================

    @keyword("Connect To PGVector")
    def connect_to_pgvector(
        self,
        host: str = "localhost",
        port: int = 5432,
        database: str = "vectors",
        user: str = "postgres",
        password: str = "",
        table: str = "embeddings",
        dimension: int = 1536,
        ssl: bool = False,
        ssl_mode: str = "prefer",
        create_table_if_not_exists: bool = True,
        index_type: str = "ivfflat",
        pool_size: int = 5,
    ) -> Dict[str, Any]:
        """
        Conecta a PostgreSQL con pgvector.

        Args:
            host: Host del servidor
            port: Puerto (default 5432)
            database: Nombre de la base de datos
            user: Usuario
            password: Contraseña
            table: Nombre de la tabla
            dimension: Dimensión del vector
            ssl: Usar SSL
            ssl_mode: Modo SSL (disable, prefer, require, verify-ca, verify-full)
            create_table_if_not_exists: Auto-crear tabla
            index_type: Tipo de índice (none, ivfflat, hnsw)
            pool_size: Tamaño del pool de conexiones

        Returns:
            Diccionario con info de conexión

        Example:
            | ${conn}= | Connect To PGVector | localhost | 5432 | mydb | user | pass | documents |
        """
        try:
            import psycopg2
            from psycopg2.extras import execute_values
            from psycopg2.pool import ThreadedConnectionPool
        except ImportError:
            raise ImportError("psycopg2 not installed. Install with: pip install psycopg2-binary")

        self._config = VectorDBConfig(
            provider=VectorDBProvider.PGVECTOR,
            host=host,
            port=port,
            database=database,
            user=user,
            password=password,
            table=table,
            dimension=dimension,
            ssl=ssl,
            ssl_mode=ssl_mode,
            index_type=index_type,
            pool_size=pool_size,
        )

        # Build connection string
        conn_params = {
            "host": host,
            "port": port,
            "dbname": database,
            "user": user,
            "password": password,
        }
        if ssl:
            conn_params["sslmode"] = ssl_mode

        # Create connection pool
        self._client = ThreadedConnectionPool(
            minconn=1,
            maxconn=pool_size,
            **conn_params
        )

        # Get a connection to setup
        conn = self._client.getconn()
        cursor = conn.cursor()

        result = {
            "connection_id": f"pgvector_{database}_{table}",
            "table_exists": False,
            "table_created": False,
            "index_exists": False,
            "row_count": 0,
            "pg_version": "",
            "pgvector_version": "",
        }

        try:
            # Check PostgreSQL version
            cursor.execute("SELECT version();")
            result["pg_version"] = cursor.fetchone()[0].split(",")[0]

            # Ensure pgvector extension
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            conn.commit()

            # Check pgvector version
            cursor.execute("SELECT extversion FROM pg_extension WHERE extname = 'vector';")
            row = cursor.fetchone()
            result["pgvector_version"] = row[0] if row else "unknown"

            # Check if table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = %s
                );
            """, (table,))
            result["table_exists"] = cursor.fetchone()[0]

            # Create table if needed
            if create_table_if_not_exists and not result["table_exists"]:
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        id TEXT PRIMARY KEY,
                        content TEXT,
                        embedding vector({dimension}),
                        metadata JSONB DEFAULT '{{}}',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                conn.commit()
                result["table_created"] = True
                result["table_exists"] = True

                # Create index
                if index_type != "none":
                    if index_type == "hnsw":
                        cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS {table}_embedding_idx
                            ON {table} USING hnsw (embedding vector_cosine_ops);
                        """)
                    else:  # ivfflat
                        cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS {table}_embedding_idx
                            ON {table} USING ivfflat (embedding vector_cosine_ops)
                            WITH (lists = 100);
                        """)
                    conn.commit()
                    result["index_exists"] = True

            # Get row count
            if result["table_exists"]:
                cursor.execute(f"SELECT COUNT(*) FROM {table};")
                result["row_count"] = cursor.fetchone()[0]

                # Check for index
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM pg_indexes
                        WHERE tablename = %s AND indexname LIKE '%%embedding%%'
                    );
                """, (table,))
                result["index_exists"] = cursor.fetchone()[0]

        finally:
            cursor.close()
            self._client.putconn(conn)

        logger.info(f"Connected to pgvector: {database}/{table} ({result['row_count']} rows)")
        return result

    @keyword("PGVector Upsert")
    def pgvector_upsert(
        self,
        documents: List[Dict[str, Any]],
        auto_embed: bool = True,
    ) -> Dict[str, Any]:
        """
        Inserta o actualiza documentos en pgvector.

        Args:
            documents: Lista de documentos con 'id', 'content', 'metadata' (opcional), 'embedding' (opcional)
            auto_embed: Generar embeddings automáticamente si no se proporcionan

        Returns:
            Diccionario con estadísticas

        Example:
            | ${docs}= | Create List | ${doc1} | ${doc2} |
            | ${result}= | PGVector Upsert | ${docs} |
        """
        if not self._client or self._config.provider != VectorDBProvider.PGVECTOR:
            raise ValueError("Not connected to pgvector. Use 'Connect To PGVector' first.")

        table = self._config.table
        conn = self._client.getconn()
        cursor = conn.cursor()

        inserted = 0
        updated = 0
        errors = []

        try:
            for doc in documents:
                doc_id = doc.get("id", str(uuid.uuid4()))
                content = doc.get("content", "")
                metadata = doc.get("metadata", {})
                embedding = doc.get("embedding")

                # Generate embedding if needed
                if not embedding and auto_embed and content:
                    embedding = self.generate_embedding(content)

                if not embedding:
                    errors.append({"id": doc_id, "error": "No embedding provided or generated"})
                    continue

                # Upsert
                cursor.execute(f"""
                    INSERT INTO {table} (id, content, embedding, metadata, updated_at)
                    VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET
                        content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding,
                        metadata = EXCLUDED.metadata,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING (xmax = 0) AS inserted;
                """, (doc_id, content, embedding, json.dumps(metadata)))

                was_inserted = cursor.fetchone()[0]
                if was_inserted:
                    inserted += 1
                else:
                    updated += 1

            conn.commit()

        except Exception as e:
            conn.rollback()
            logger.error(f"PGVector upsert failed: {e}")
            raise
        finally:
            cursor.close()
            self._client.putconn(conn)

        result = {
            "success": True,
            "inserted": inserted,
            "updated": updated,
            "total": inserted + updated,
            "errors": errors,
        }
        logger.info(f"PGVector upsert: {inserted} inserted, {updated} updated")
        return result

    @keyword("PGVector Query")
    def pgvector_query(
        self,
        query: str,
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        min_score: float = 0.0,
        include_metadata: bool = True,
        include_content: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda semántica en pgvector.

        Args:
            query: Texto de consulta
            top_k: Número de resultados
            filter_metadata: Filtro por metadata (JSONB)
            min_score: Score mínimo (0-1)
            include_metadata: Incluir metadata en resultados
            include_content: Incluir contenido en resultados

        Returns:
            Lista de resultados con id, score, content, metadata

        Example:
            | ${results}= | PGVector Query | What is machine learning? | top_k=5 |
        """
        if not self._client or self._config.provider != VectorDBProvider.PGVECTOR:
            raise ValueError("Not connected to pgvector.")

        # Generate query embedding
        query_embedding = self.generate_embedding(query)
        if not query_embedding:
            raise ValueError("Failed to generate query embedding")

        table = self._config.table
        conn = self._client.getconn()
        cursor = conn.cursor()

        try:
            # Build query
            select_fields = ["id", f"1 - (embedding <=> %s::vector) AS score"]
            if include_content:
                select_fields.append("content")
            if include_metadata:
                select_fields.append("metadata")

            sql = f"""
                SELECT {', '.join(select_fields)}
                FROM {table}
            """

            params = [query_embedding]

            # Add metadata filter
            if filter_metadata:
                conditions = []
                for key, value in filter_metadata.items():
                    conditions.append(f"metadata->>{repr(key)} = %s")
                    params.append(str(value))
                if conditions:
                    sql += " WHERE " + " AND ".join(conditions)

            # Add ordering and limit
            sql += f"""
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """
            params.extend([query_embedding, top_k])

            cursor.execute(sql, params)
            rows = cursor.fetchall()

            results = []
            for row in rows:
                idx = 0
                doc_id = row[idx]
                idx += 1
                score = float(row[idx])
                idx += 1

                if score < min_score:
                    continue

                result = {"id": doc_id, "score": round(score, 4)}

                if include_content:
                    result["content"] = row[idx]
                    idx += 1
                if include_metadata:
                    result["metadata"] = row[idx] if row[idx] else {}

                results.append(result)

            return results

        finally:
            cursor.close()
            self._client.putconn(conn)

    @keyword("PGVector Delete")
    def pgvector_delete(
        self,
        ids: Optional[List[str]] = None,
        filter_metadata: Optional[Dict[str, Any]] = None,
        delete_all: bool = False,
    ) -> Dict[str, Any]:
        """
        Elimina documentos de pgvector.

        Args:
            ids: Lista de IDs a eliminar
            filter_metadata: Eliminar por filtro de metadata
            delete_all: Eliminar todos los documentos (CUIDADO)

        Returns:
            Diccionario con cantidad eliminada

        Example:
            | ${result}= | PGVector Delete | ids=${id_list} |
            | ${result}= | PGVector Delete | filter_metadata=${filter} |
        """
        if not self._client or self._config.provider != VectorDBProvider.PGVECTOR:
            raise ValueError("Not connected to pgvector.")

        if not ids and not filter_metadata and not delete_all:
            raise ValueError("Must specify ids, filter_metadata, or delete_all=True")

        table = self._config.table
        conn = self._client.getconn()
        cursor = conn.cursor()

        try:
            if delete_all:
                cursor.execute(f"DELETE FROM {table};")
            elif ids:
                cursor.execute(f"DELETE FROM {table} WHERE id = ANY(%s);", (ids,))
            elif filter_metadata:
                conditions = []
                params = []
                for key, value in filter_metadata.items():
                    conditions.append(f"metadata->>{repr(key)} = %s")
                    params.append(str(value))
                cursor.execute(
                    f"DELETE FROM {table} WHERE {' AND '.join(conditions)};",
                    params
                )

            deleted = cursor.rowcount
            conn.commit()

            return {"success": True, "deleted": deleted}

        except Exception as e:
            conn.rollback()
            logger.error(f"PGVector delete failed: {e}")
            raise
        finally:
            cursor.close()
            self._client.putconn(conn)

    @keyword("PGVector Get Stats")
    def pgvector_get_stats(self) -> Dict[str, Any]:
        """
        Obtiene estadísticas de la tabla pgvector.

        Returns:
            Diccionario con estadísticas

        Example:
            | ${stats}= | PGVector Get Stats |
        """
        if not self._client or self._config.provider != VectorDBProvider.PGVECTOR:
            raise ValueError("Not connected to pgvector.")

        table = self._config.table
        conn = self._client.getconn()
        cursor = conn.cursor()

        try:
            stats = {"table": table}

            # Row count
            cursor.execute(f"SELECT COUNT(*) FROM {table};")
            stats["row_count"] = cursor.fetchone()[0]

            # Table size
            cursor.execute(f"SELECT pg_size_pretty(pg_total_relation_size('{table}'));")
            stats["table_size"] = cursor.fetchone()[0]

            # Index info
            cursor.execute("""
                SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass))
                FROM pg_indexes WHERE tablename = %s;
            """, (table,))
            stats["indexes"] = [{"name": r[0], "size": r[1]} for r in cursor.fetchall()]

            return stats

        finally:
            cursor.close()
            self._client.putconn(conn)

    # =========================================================================
    # PINECONE
    # =========================================================================

    @keyword("Connect To Pinecone")
    def connect_to_pinecone(
        self,
        api_key: str,
        index_name: str,
        environment: str = "",
        namespace: str = "",
        dimension: int = 1536,
        metric: str = "cosine",
        create_if_not_exists: bool = True,
        cloud: str = "aws",
        region: str = "us-east-1",
    ) -> Dict[str, Any]:
        """
        Conecta a Pinecone (serverless).

        Args:
            api_key: API key de Pinecone
            index_name: Nombre del índice
            environment: Ambiente (deprecated, usar cloud/region)
            namespace: Namespace dentro del índice
            dimension: Dimensión del vector
            metric: Métrica (cosine, euclidean, dotproduct)
            create_if_not_exists: Crear índice si no existe
            cloud: Proveedor cloud (aws, gcp, azure)
            region: Región

        Returns:
            Diccionario con info de conexión

        Example:
            | ${conn}= | Connect To Pinecone | ${api_key} | my-index |
        """
        try:
            from pinecone import Pinecone, ServerlessSpec
        except ImportError:
            raise ImportError("pinecone not installed. Install with: pip install pinecone-client")

        self._config = VectorDBConfig(
            provider=VectorDBProvider.PINECONE,
            api_key=api_key,
            collection=index_name,
            dimension=dimension,
            metric=metric,
            extra_params={"namespace": namespace, "cloud": cloud, "region": region},
        )

        # Initialize Pinecone client
        pc = Pinecone(api_key=api_key)
        self._client = pc

        result = {
            "connection_id": f"pinecone_{index_name}",
            "index_exists": False,
            "index_created": False,
            "dimension": dimension,
            "metric": metric,
            "row_count": 0,
        }

        # Check existing indexes
        existing_indexes = [idx.name for idx in pc.list_indexes()]
        result["index_exists"] = index_name in existing_indexes

        # Create if needed
        if create_if_not_exists and not result["index_exists"]:
            pc.create_index(
                name=index_name,
                dimension=dimension,
                metric=metric,
                spec=ServerlessSpec(cloud=cloud, region=region),
            )
            result["index_created"] = True
            result["index_exists"] = True

        # Get index reference
        self._config.extra_params["index"] = pc.Index(index_name)

        # Get stats
        stats = self._config.extra_params["index"].describe_index_stats()
        result["row_count"] = stats.total_vector_count
        result["namespaces"] = list(stats.namespaces.keys()) if stats.namespaces else []

        logger.info(f"Connected to Pinecone: {index_name} ({result['row_count']} vectors)")
        return result

    @keyword("Pinecone Upsert")
    def pinecone_upsert(
        self,
        documents: List[Dict[str, Any]],
        namespace: str = "",
        auto_embed: bool = True,
        batch_size: int = 100,
    ) -> Dict[str, Any]:
        """
        Inserta documentos en Pinecone.

        Args:
            documents: Lista de documentos con 'id', 'content', 'metadata', 'embedding'
            namespace: Namespace
            auto_embed: Generar embeddings automáticamente
            batch_size: Tamaño de batch

        Returns:
            Diccionario con estadísticas

        Example:
            | ${result}= | Pinecone Upsert | ${docs} |
        """
        if not self._client or self._config.provider != VectorDBProvider.PINECONE:
            raise ValueError("Not connected to Pinecone.")

        index = self._config.extra_params.get("index")
        if not index:
            raise ValueError("Pinecone index not available")

        ns = namespace or self._config.extra_params.get("namespace", "")
        vectors = []

        for doc in documents:
            doc_id = doc.get("id", str(uuid.uuid4()))
            content = doc.get("content", "")
            metadata = doc.get("metadata", {})
            embedding = doc.get("embedding")

            # Generate embedding if needed
            if not embedding and auto_embed and content:
                embedding = self.generate_embedding(content)

            if not embedding:
                continue

            # Add content to metadata for retrieval
            if content and "content" not in metadata:
                metadata["content"] = content

            vectors.append({
                "id": doc_id,
                "values": embedding,
                "metadata": metadata,
            })

        # Upsert in batches
        total_upserted = 0
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            index.upsert(vectors=batch, namespace=ns)
            total_upserted += len(batch)

        result = {
            "success": True,
            "upserted": total_upserted,
            "namespace": ns,
        }
        logger.info(f"Pinecone upsert: {total_upserted} vectors")
        return result

    @keyword("Pinecone Query")
    def pinecone_query(
        self,
        query: str,
        top_k: int = 5,
        namespace: str = "",
        filter_metadata: Optional[Dict[str, Any]] = None,
        min_score: float = 0.0,
        include_metadata: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda semántica en Pinecone.

        Args:
            query: Texto de consulta
            top_k: Número de resultados
            namespace: Namespace
            filter_metadata: Filtro de metadata
            min_score: Score mínimo
            include_metadata: Incluir metadata

        Returns:
            Lista de resultados

        Example:
            | ${results}= | Pinecone Query | What is AI? | top_k=5 |
        """
        if not self._client or self._config.provider != VectorDBProvider.PINECONE:
            raise ValueError("Not connected to Pinecone.")

        index = self._config.extra_params.get("index")
        ns = namespace or self._config.extra_params.get("namespace", "")

        # Generate query embedding
        query_embedding = self.generate_embedding(query)
        if not query_embedding:
            raise ValueError("Failed to generate query embedding")

        # Query
        response = index.query(
            vector=query_embedding,
            top_k=top_k,
            namespace=ns,
            filter=filter_metadata,
            include_metadata=include_metadata,
        )

        results = []
        for match in response.matches:
            if match.score < min_score:
                continue

            result = {
                "id": match.id,
                "score": round(match.score, 4),
            }
            if include_metadata and match.metadata:
                result["content"] = match.metadata.pop("content", "")
                result["metadata"] = match.metadata

            results.append(result)

        return results

    @keyword("Pinecone Delete")
    def pinecone_delete(
        self,
        ids: Optional[List[str]] = None,
        namespace: str = "",
        filter_metadata: Optional[Dict[str, Any]] = None,
        delete_all: bool = False,
    ) -> Dict[str, Any]:
        """
        Elimina vectores de Pinecone.

        Args:
            ids: Lista de IDs
            namespace: Namespace
            filter_metadata: Filtro de metadata
            delete_all: Eliminar todo el namespace

        Returns:
            Diccionario con resultado

        Example:
            | ${result}= | Pinecone Delete | ids=${id_list} |
        """
        if not self._client or self._config.provider != VectorDBProvider.PINECONE:
            raise ValueError("Not connected to Pinecone.")

        index = self._config.extra_params.get("index")
        ns = namespace or self._config.extra_params.get("namespace", "")

        if delete_all:
            index.delete(delete_all=True, namespace=ns)
        elif ids:
            index.delete(ids=ids, namespace=ns)
        elif filter_metadata:
            index.delete(filter=filter_metadata, namespace=ns)

        return {"success": True, "namespace": ns}

    # =========================================================================
    # QDRANT
    # =========================================================================

    @keyword("Connect To Qdrant")
    def connect_to_qdrant(
        self,
        host: str = "localhost",
        port: int = 6333,
        api_key: Optional[str] = None,
        collection: str = "documents",
        dimension: int = 1536,
        metric: str = "cosine",
        create_if_not_exists: bool = True,
        grpc_port: Optional[int] = None,
        prefer_grpc: bool = False,
        https: bool = False,
    ) -> Dict[str, Any]:
        """
        Conecta a Qdrant.

        Args:
            host: Host del servidor
            port: Puerto REST (default 6333)
            api_key: API key (para Qdrant Cloud)
            collection: Nombre de la colección
            dimension: Dimensión del vector
            metric: Métrica (cosine, euclidean, dot)
            create_if_not_exists: Crear colección si no existe
            grpc_port: Puerto gRPC (default 6334)
            prefer_grpc: Preferir gRPC
            https: Usar HTTPS

        Returns:
            Diccionario con info de conexión

        Example:
            | ${conn}= | Connect To Qdrant | localhost | 6333 | | documents |
        """
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.http.models import Distance, VectorParams
        except ImportError:
            raise ImportError("qdrant-client not installed. Install with: pip install qdrant-client")

        self._config = VectorDBConfig(
            provider=VectorDBProvider.QDRANT,
            host=host,
            port=port,
            api_key=api_key,
            collection=collection,
            dimension=dimension,
            metric=metric,
        )

        # Map metric names
        distance_map = {
            "cosine": Distance.COSINE,
            "euclidean": Distance.EUCLID,
            "dot": Distance.DOT,
            "dotproduct": Distance.DOT,
        }
        distance = distance_map.get(metric.lower(), Distance.COSINE)

        # Initialize client
        url = f"{'https' if https else 'http'}://{host}:{port}"
        self._client = QdrantClient(
            url=url,
            api_key=api_key,
            prefer_grpc=prefer_grpc,
            grpc_port=grpc_port,
        )

        result = {
            "connection_id": f"qdrant_{collection}",
            "collection_exists": False,
            "collection_created": False,
            "dimension": dimension,
            "metric": metric,
            "point_count": 0,
        }

        # Check if collection exists
        collections = self._client.get_collections().collections
        result["collection_exists"] = any(c.name == collection for c in collections)

        # Create if needed
        if create_if_not_exists and not result["collection_exists"]:
            self._client.create_collection(
                collection_name=collection,
                vectors_config=VectorParams(size=dimension, distance=distance),
            )
            result["collection_created"] = True
            result["collection_exists"] = True

        # Get stats
        if result["collection_exists"]:
            info = self._client.get_collection(collection)
            result["point_count"] = info.points_count

        logger.info(f"Connected to Qdrant: {collection} ({result['point_count']} points)")
        return result

    @keyword("Qdrant Upsert")
    def qdrant_upsert(
        self,
        documents: List[Dict[str, Any]],
        auto_embed: bool = True,
        batch_size: int = 100,
    ) -> Dict[str, Any]:
        """
        Inserta documentos en Qdrant.

        Args:
            documents: Lista de documentos
            auto_embed: Generar embeddings automáticamente
            batch_size: Tamaño de batch

        Returns:
            Diccionario con estadísticas

        Example:
            | ${result}= | Qdrant Upsert | ${docs} |
        """
        if not self._client or self._config.provider != VectorDBProvider.QDRANT:
            raise ValueError("Not connected to Qdrant.")

        try:
            from qdrant_client.http.models import PointStruct
        except ImportError:
            raise ImportError("qdrant-client not installed")

        collection = self._config.collection
        points = []

        for doc in documents:
            doc_id = doc.get("id", str(uuid.uuid4()))
            content = doc.get("content", "")
            metadata = doc.get("metadata", {})
            embedding = doc.get("embedding")

            # Generate embedding if needed
            if not embedding and auto_embed and content:
                embedding = self.generate_embedding(content)

            if not embedding:
                continue

            # Add content to payload
            payload = {**metadata, "content": content}

            # Convert string ID to int hash for Qdrant
            if isinstance(doc_id, str):
                point_id = int(hashlib.md5(doc_id.encode()).hexdigest()[:16], 16)
            else:
                point_id = doc_id

            points.append(PointStruct(
                id=point_id,
                vector=embedding,
                payload=payload,
            ))

        # Upsert in batches
        total_upserted = 0
        for i in range(0, len(points), batch_size):
            batch = points[i:i + batch_size]
            self._client.upsert(collection_name=collection, points=batch)
            total_upserted += len(batch)

        result = {
            "success": True,
            "upserted": total_upserted,
        }
        logger.info(f"Qdrant upsert: {total_upserted} points")
        return result

    @keyword("Qdrant Query")
    def qdrant_query(
        self,
        query: str,
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        min_score: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda semántica en Qdrant.

        Args:
            query: Texto de consulta
            top_k: Número de resultados
            filter_metadata: Filtro de metadata
            min_score: Score mínimo

        Returns:
            Lista de resultados

        Example:
            | ${results}= | Qdrant Query | What is RPA? | top_k=5 |
        """
        if not self._client or self._config.provider != VectorDBProvider.QDRANT:
            raise ValueError("Not connected to Qdrant.")

        try:
            from qdrant_client.http.models import Filter, FieldCondition, MatchValue
        except ImportError:
            raise ImportError("qdrant-client not installed")

        collection = self._config.collection

        # Generate query embedding
        query_embedding = self.generate_embedding(query)
        if not query_embedding:
            raise ValueError("Failed to generate query embedding")

        # Build filter
        query_filter = None
        if filter_metadata:
            conditions = [
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filter_metadata.items()
            ]
            query_filter = Filter(must=conditions)

        # Search
        response = self._client.search(
            collection_name=collection,
            query_vector=query_embedding,
            query_filter=query_filter,
            limit=top_k,
            with_payload=True,
        )

        results = []
        for hit in response:
            if hit.score < min_score:
                continue

            payload = hit.payload or {}
            results.append({
                "id": str(hit.id),
                "score": round(hit.score, 4),
                "content": payload.pop("content", ""),
                "metadata": payload,
            })

        return results

    @keyword("Qdrant Delete")
    def qdrant_delete(
        self,
        ids: Optional[List[str]] = None,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Elimina puntos de Qdrant.

        Args:
            ids: Lista de IDs
            filter_metadata: Filtro de metadata

        Returns:
            Diccionario con resultado

        Example:
            | ${result}= | Qdrant Delete | ids=${id_list} |
        """
        if not self._client or self._config.provider != VectorDBProvider.QDRANT:
            raise ValueError("Not connected to Qdrant.")

        try:
            from qdrant_client.http.models import Filter, FieldCondition, MatchValue, PointIdsList
        except ImportError:
            raise ImportError("qdrant-client not installed")

        collection = self._config.collection

        if ids:
            # Convert string IDs to int hashes
            point_ids = []
            for doc_id in ids:
                if isinstance(doc_id, str):
                    point_ids.append(int(hashlib.md5(doc_id.encode()).hexdigest()[:16], 16))
                else:
                    point_ids.append(doc_id)

            self._client.delete(
                collection_name=collection,
                points_selector=PointIdsList(points=point_ids),
            )
        elif filter_metadata:
            conditions = [
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filter_metadata.items()
            ]
            self._client.delete(
                collection_name=collection,
                points_selector=Filter(must=conditions),
            )

        return {"success": True}

    # =========================================================================
    # CHROMADB
    # =========================================================================

    @keyword("Connect To ChromaDB")
    def connect_to_chromadb(
        self,
        collection: str = "documents",
        persist_directory: Optional[str] = None,
        host: Optional[str] = None,
        port: Optional[int] = None,
        create_if_not_exists: bool = True,
    ) -> Dict[str, Any]:
        """
        Conecta a ChromaDB.

        Args:
            collection: Nombre de la colección
            persist_directory: Directorio para persistencia local
            host: Host para modo cliente-servidor
            port: Puerto para modo cliente-servidor
            create_if_not_exists: Crear colección si no existe

        Returns:
            Diccionario con info de conexión

        Example:
            | ${conn}= | Connect To ChromaDB | my_docs | persist_directory=/data/chroma |
        """
        try:
            import chromadb
            from chromadb.config import Settings
        except ImportError:
            raise ImportError("chromadb not installed. Install with: pip install chromadb")

        self._config = VectorDBConfig(
            provider=VectorDBProvider.CHROMA,
            collection=collection,
            host=host,
            port=port,
            extra_params={"persist_directory": persist_directory},
        )

        # Initialize client
        if host and port:
            self._client = chromadb.HttpClient(host=host, port=port)
        elif persist_directory:
            self._client = chromadb.PersistentClient(path=persist_directory)
        else:
            self._client = chromadb.Client()

        result = {
            "connection_id": f"chroma_{collection}",
            "collection_exists": False,
            "collection_created": False,
            "document_count": 0,
        }

        # Check/create collection
        try:
            collections = [c.name for c in self._client.list_collections()]
            result["collection_exists"] = collection in collections

            if create_if_not_exists:
                coll = self._client.get_or_create_collection(name=collection)
                if not result["collection_exists"]:
                    result["collection_created"] = True
                    result["collection_exists"] = True
            else:
                coll = self._client.get_collection(name=collection)

            self._config.extra_params["collection_obj"] = coll
            result["document_count"] = coll.count()

        except Exception as e:
            logger.error(f"ChromaDB collection error: {e}")
            raise

        logger.info(f"Connected to ChromaDB: {collection} ({result['document_count']} docs)")
        return result

    @keyword("ChromaDB Add")
    def chromadb_add(
        self,
        documents: List[Dict[str, Any]],
        auto_embed: bool = True,
    ) -> Dict[str, Any]:
        """
        Agrega documentos a ChromaDB.

        Args:
            documents: Lista de documentos
            auto_embed: Usar embeddings propios (si False, ChromaDB genera)

        Returns:
            Diccionario con estadísticas

        Example:
            | ${result}= | ChromaDB Add | ${docs} |
        """
        if not self._client or self._config.provider != VectorDBProvider.CHROMA:
            raise ValueError("Not connected to ChromaDB.")

        coll = self._config.extra_params.get("collection_obj")
        if not coll:
            raise ValueError("ChromaDB collection not available")

        ids = []
        contents = []
        metadatas = []
        embeddings = []

        for doc in documents:
            doc_id = doc.get("id", str(uuid.uuid4()))
            content = doc.get("content", "")
            metadata = doc.get("metadata", {})

            ids.append(doc_id)
            contents.append(content)
            metadatas.append(metadata)

            if auto_embed and self._embedding_client:
                embedding = doc.get("embedding") or self.generate_embedding(content)
                embeddings.append(embedding)

        # Add to collection
        if embeddings and auto_embed:
            coll.add(
                ids=ids,
                documents=contents,
                metadatas=metadatas,
                embeddings=embeddings,
            )
        else:
            # Let ChromaDB generate embeddings
            coll.add(
                ids=ids,
                documents=contents,
                metadatas=metadatas,
            )

        result = {
            "success": True,
            "added": len(ids),
        }
        logger.info(f"ChromaDB add: {len(ids)} documents")
        return result

    @keyword("ChromaDB Query")
    def chromadb_query(
        self,
        query: str,
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        include_documents: bool = True,
        include_embeddings: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda semántica en ChromaDB.

        Args:
            query: Texto de consulta
            top_k: Número de resultados
            filter_metadata: Filtro where
            include_documents: Incluir documentos
            include_embeddings: Incluir embeddings

        Returns:
            Lista de resultados

        Example:
            | ${results}= | ChromaDB Query | What is automation? | top_k=5 |
        """
        if not self._client or self._config.provider != VectorDBProvider.CHROMA:
            raise ValueError("Not connected to ChromaDB.")

        coll = self._config.extra_params.get("collection_obj")

        # Build include list
        include = ["metadatas", "distances"]
        if include_documents:
            include.append("documents")
        if include_embeddings:
            include.append("embeddings")

        # Query - use custom embedding if available
        if self._embedding_client:
            query_embedding = self.generate_embedding(query)
            response = coll.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=filter_metadata,
                include=include,
            )
        else:
            response = coll.query(
                query_texts=[query],
                n_results=top_k,
                where=filter_metadata,
                include=include,
            )

        results = []
        if response and response["ids"]:
            for i, doc_id in enumerate(response["ids"][0]):
                # ChromaDB returns distances, convert to similarity score
                distance = response["distances"][0][i] if response.get("distances") else 0
                score = 1 - distance  # Convert distance to similarity

                result = {
                    "id": doc_id,
                    "score": round(score, 4),
                }

                if include_documents and response.get("documents"):
                    result["content"] = response["documents"][0][i]

                if response.get("metadatas"):
                    result["metadata"] = response["metadatas"][0][i] or {}

                results.append(result)

        return results

    @keyword("ChromaDB Update")
    def chromadb_update(
        self,
        documents: List[Dict[str, Any]],
        auto_embed: bool = True,
    ) -> Dict[str, Any]:
        """
        Actualiza documentos en ChromaDB.

        Args:
            documents: Lista de documentos con 'id'
            auto_embed: Regenerar embeddings

        Returns:
            Diccionario con resultado

        Example:
            | ${result}= | ChromaDB Update | ${docs} |
        """
        if not self._client or self._config.provider != VectorDBProvider.CHROMA:
            raise ValueError("Not connected to ChromaDB.")

        coll = self._config.extra_params.get("collection_obj")

        ids = []
        contents = []
        metadatas = []
        embeddings = []

        for doc in documents:
            doc_id = doc.get("id")
            if not doc_id:
                continue

            content = doc.get("content")
            metadata = doc.get("metadata")

            ids.append(doc_id)
            if content:
                contents.append(content)
            if metadata:
                metadatas.append(metadata)

            if auto_embed and content and self._embedding_client:
                embeddings.append(self.generate_embedding(content))

        # Update
        update_kwargs = {"ids": ids}
        if contents:
            update_kwargs["documents"] = contents
        if metadatas:
            update_kwargs["metadatas"] = metadatas
        if embeddings:
            update_kwargs["embeddings"] = embeddings

        coll.update(**update_kwargs)

        return {"success": True, "updated": len(ids)}

    @keyword("ChromaDB Delete")
    def chromadb_delete(
        self,
        ids: Optional[List[str]] = None,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Elimina documentos de ChromaDB.

        Args:
            ids: Lista de IDs
            filter_metadata: Filtro where

        Returns:
            Diccionario con resultado

        Example:
            | ${result}= | ChromaDB Delete | ids=${id_list} |
        """
        if not self._client or self._config.provider != VectorDBProvider.CHROMA:
            raise ValueError("Not connected to ChromaDB.")

        coll = self._config.extra_params.get("collection_obj")

        if ids:
            coll.delete(ids=ids)
        elif filter_metadata:
            coll.delete(where=filter_metadata)

        return {"success": True}

    # =========================================================================
    # SUPABASE (pgvector as a service)
    # =========================================================================

    @keyword("Connect To Supabase")
    def connect_to_supabase(
        self,
        url: str,
        api_key: str,
        table: str = "documents",
        dimension: int = 1536,
        create_table_if_not_exists: bool = True,
        index_type: str = "ivfflat",
    ) -> Dict[str, Any]:
        """
        Conecta a Supabase (pgvector como servicio).

        Supabase usa pgvector internamente, pero se conecta via API REST o
        conexión directa a PostgreSQL. Esta implementación usa la conexión
        directa para máximo rendimiento.

        Args:
            url: URL del proyecto Supabase (ej: https://xxx.supabase.co)
            api_key: Supabase service_role key (con acceso a la DB)
            table: Nombre de la tabla
            dimension: Dimensión del vector
            create_table_if_not_exists: Auto-crear tabla
            index_type: Tipo de índice (ivfflat, hnsw)

        Returns:
            Diccionario con info de conexión

        Example:
            | ${conn}= | Connect To Supabase | ${supabase_url} | ${api_key} | documents |
        """
        try:
            import psycopg2
            from psycopg2.pool import ThreadedConnectionPool
        except ImportError:
            raise ImportError("psycopg2 not installed. Install with: pip install psycopg2-binary")

        # Parse Supabase URL to get PostgreSQL connection string
        # Supabase URLs: https://xxx.supabase.co -> db.xxx.supabase.co:5432
        import re
        match = re.match(r"https?://([^.]+)\.supabase\.co", url)
        if not match:
            raise ValueError(f"Invalid Supabase URL format: {url}")

        project_ref = match.group(1)
        pg_host = f"db.{project_ref}.supabase.co"

        # Supabase uses 'postgres' user with pooler on port 6543 or direct on 5432
        # For vector operations, direct connection (5432) is recommended
        self._config = VectorDBConfig(
            provider=VectorDBProvider.SUPABASE,
            host=pg_host,
            port=5432,
            database="postgres",
            user="postgres",
            password=api_key,  # Service role key is used as password
            table=table,
            dimension=dimension,
            ssl=True,
            ssl_mode="require",
            index_type=index_type,
            extra_params={"supabase_url": url, "project_ref": project_ref},
        )

        # Create connection pool
        conn_params = {
            "host": pg_host,
            "port": 5432,
            "dbname": "postgres",
            "user": "postgres",
            "password": api_key,
            "sslmode": "require",
        }

        self._client = ThreadedConnectionPool(minconn=1, maxconn=5, **conn_params)

        # Get a connection to setup
        conn = self._client.getconn()
        cursor = conn.cursor()

        result = {
            "connection_id": f"supabase_{project_ref}_{table}",
            "table_exists": False,
            "table_created": False,
            "index_exists": False,
            "row_count": 0,
            "supabase_url": url,
            "project_ref": project_ref,
        }

        try:
            # Ensure pgvector extension (usually already enabled in Supabase)
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            conn.commit()

            # Check if table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = %s
                );
            """, (table,))
            result["table_exists"] = cursor.fetchone()[0]

            # Create table if needed
            if create_table_if_not_exists and not result["table_exists"]:
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        id TEXT PRIMARY KEY,
                        content TEXT,
                        embedding vector({dimension}),
                        metadata JSONB DEFAULT '{{}}',
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    );
                """)
                conn.commit()
                result["table_created"] = True
                result["table_exists"] = True

                # Create index
                if index_type != "none":
                    if index_type == "hnsw":
                        cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS {table}_embedding_idx
                            ON {table} USING hnsw (embedding vector_cosine_ops);
                        """)
                    else:  # ivfflat
                        cursor.execute(f"""
                            CREATE INDEX IF NOT EXISTS {table}_embedding_idx
                            ON {table} USING ivfflat (embedding vector_cosine_ops)
                            WITH (lists = 100);
                        """)
                    conn.commit()
                    result["index_exists"] = True

            # Get row count
            if result["table_exists"]:
                cursor.execute(f"SELECT COUNT(*) FROM {table};")
                result["row_count"] = cursor.fetchone()[0]

        finally:
            cursor.close()
            self._client.putconn(conn)

        logger.info(f"Connected to Supabase: {project_ref}/{table} ({result['row_count']} rows)")
        return result

    @keyword("Supabase Upsert")
    def supabase_upsert(
        self,
        documents: List[Dict[str, Any]],
        auto_embed: bool = True,
    ) -> Dict[str, Any]:
        """
        Inserta o actualiza documentos en Supabase pgvector.

        Args:
            documents: Lista de documentos con 'id', 'content', 'metadata', 'embedding'
            auto_embed: Generar embeddings automáticamente

        Returns:
            Diccionario con estadísticas

        Example:
            | ${result}= | Supabase Upsert | ${docs} |
        """
        if not self._client or self._config.provider != VectorDBProvider.SUPABASE:
            raise ValueError("Not connected to Supabase. Use 'Connect To Supabase' first.")

        # Reuse pgvector implementation since Supabase uses pgvector
        # Temporarily set provider to PGVECTOR for the upsert
        original_provider = self._config.provider
        self._config.provider = VectorDBProvider.PGVECTOR
        try:
            result = self.pgvector_upsert(documents, auto_embed)
        finally:
            self._config.provider = original_provider

        return result

    @keyword("Supabase Query")
    def supabase_query(
        self,
        query: str,
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
        min_score: float = 0.0,
        include_metadata: bool = True,
        include_content: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda semántica en Supabase.

        Args:
            query: Texto de consulta
            top_k: Número de resultados
            filter_metadata: Filtro por metadata (JSONB)
            min_score: Score mínimo
            include_metadata: Incluir metadata
            include_content: Incluir contenido

        Returns:
            Lista de resultados

        Example:
            | ${results}= | Supabase Query | What is machine learning? | top_k=5 |
        """
        if not self._client or self._config.provider != VectorDBProvider.SUPABASE:
            raise ValueError("Not connected to Supabase.")

        # Reuse pgvector implementation
        original_provider = self._config.provider
        self._config.provider = VectorDBProvider.PGVECTOR
        try:
            results = self.pgvector_query(
                query, top_k, filter_metadata, min_score,
                include_metadata, include_content
            )
        finally:
            self._config.provider = original_provider

        return results

    @keyword("Supabase Delete")
    def supabase_delete(
        self,
        ids: Optional[List[str]] = None,
        filter_metadata: Optional[Dict[str, Any]] = None,
        delete_all: bool = False,
    ) -> Dict[str, Any]:
        """
        Elimina documentos de Supabase.

        Args:
            ids: Lista de IDs
            filter_metadata: Filtro por metadata
            delete_all: Eliminar todo

        Returns:
            Diccionario con resultado

        Example:
            | ${result}= | Supabase Delete | ids=${id_list} |
        """
        if not self._client or self._config.provider != VectorDBProvider.SUPABASE:
            raise ValueError("Not connected to Supabase.")

        # Reuse pgvector implementation
        original_provider = self._config.provider
        self._config.provider = VectorDBProvider.PGVECTOR
        try:
            result = self.pgvector_delete(ids, filter_metadata, delete_all)
        finally:
            self._config.provider = original_provider

        return result

    @keyword("Supabase Get Stats")
    def supabase_get_stats(self) -> Dict[str, Any]:
        """
        Obtiene estadísticas de la tabla Supabase.

        Returns:
            Diccionario con estadísticas

        Example:
            | ${stats}= | Supabase Get Stats |
        """
        if not self._client or self._config.provider != VectorDBProvider.SUPABASE:
            raise ValueError("Not connected to Supabase.")

        # Reuse pgvector implementation
        original_provider = self._config.provider
        self._config.provider = VectorDBProvider.PGVECTOR
        try:
            stats = self.pgvector_get_stats()
            # Add Supabase-specific info
            stats["supabase_url"] = self._config.extra_params.get("supabase_url")
            stats["project_ref"] = self._config.extra_params.get("project_ref")
        finally:
            self._config.provider = original_provider

        return stats

    # =========================================================================
    # VECTOR MEMORY - Para integración con AI Agent
    # =========================================================================

    @keyword("Initialize Vector Memory")
    def initialize_vector_memory(
        self,
        provider: str = "chroma",
        collection: str = "agent_memory",
        memory_type: str = "both",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Inicializa memoria vectorial para un agente AI.

        Args:
            provider: Proveedor (chroma, pgvector, pinecone, qdrant, supabase)
            collection: Nombre de la colección
            memory_type: Tipo de memoria (retrieve, store, both)
            **kwargs: Parámetros adicionales del proveedor

        Returns:
            Diccionario con info de memoria

        Example:
            | ${memory}= | Initialize Vector Memory | chroma | agent_memory |
            | ${memory}= | Initialize Vector Memory | supabase | agent_memory | url=${supabase_url} | api_key=${key} |
        """
        # Connect based on provider
        if provider == "chroma":
            result = self.connect_to_chromadb(collection=collection, **kwargs)
        elif provider == "pgvector":
            result = self.connect_to_pgvector(table=collection, **kwargs)
        elif provider == "pinecone":
            result = self.connect_to_pinecone(index_name=collection, **kwargs)
        elif provider == "qdrant":
            result = self.connect_to_qdrant(collection=collection, **kwargs)
        elif provider == "supabase":
            result = self.connect_to_supabase(table=collection, **kwargs)
        else:
            raise ValueError(f"Unknown provider: {provider}")

        result["memory_type"] = memory_type
        result["provider"] = provider

        logger.info(f"Vector memory initialized: {provider}/{collection} (type={memory_type})")
        return result

    @keyword("Store In Memory")
    def store_in_memory(
        self,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        doc_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Almacena contenido en la memoria vectorial.

        Args:
            content: Contenido a almacenar
            metadata: Metadata adicional
            doc_id: ID del documento (auto-generado si no se proporciona)

        Returns:
            Diccionario con ID almacenado

        Example:
            | ${result}= | Store In Memory | ${conversation_turn} |
        """
        if not self._config:
            raise ValueError("Vector memory not initialized")

        doc = {
            "id": doc_id or str(uuid.uuid4()),
            "content": content,
            "metadata": metadata or {},
        }

        provider = self._config.provider

        if provider == VectorDBProvider.CHROMA:
            self.chromadb_add([doc])
        elif provider == VectorDBProvider.PGVECTOR:
            self.pgvector_upsert([doc])
        elif provider == VectorDBProvider.PINECONE:
            self.pinecone_upsert([doc])
        elif provider == VectorDBProvider.QDRANT:
            self.qdrant_upsert([doc])
        elif provider == VectorDBProvider.SUPABASE:
            self.supabase_upsert([doc])

        return {"success": True, "id": doc["id"]}

    @keyword("Retrieve From Memory")
    def retrieve_from_memory(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.5,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Recupera contenido relevante de la memoria vectorial.

        Args:
            query: Consulta de búsqueda
            top_k: Número de resultados
            min_score: Score mínimo
            filter_metadata: Filtro de metadata

        Returns:
            Lista de documentos relevantes

        Example:
            | ${context}= | Retrieve From Memory | What did we discuss about RPA? |
        """
        if not self._config:
            raise ValueError("Vector memory not initialized")

        provider = self._config.provider

        if provider == VectorDBProvider.CHROMA:
            return self.chromadb_query(query, top_k, filter_metadata)
        elif provider == VectorDBProvider.PGVECTOR:
            return self.pgvector_query(query, top_k, filter_metadata, min_score)
        elif provider == VectorDBProvider.PINECONE:
            return self.pinecone_query(query, top_k, "", filter_metadata, min_score)
        elif provider == VectorDBProvider.QDRANT:
            return self.qdrant_query(query, top_k, filter_metadata, min_score)
        elif provider == VectorDBProvider.SUPABASE:
            return self.supabase_query(query, top_k, filter_metadata, min_score)

        return []

    @keyword("Build RAG Context")
    def build_rag_context(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.5,
        max_context_length: int = 4000,
        separator: str = "\n\n---\n\n",
    ) -> Dict[str, Any]:
        """
        Construye contexto RAG para un prompt de agente.

        Args:
            query: La consulta del usuario
            top_k: Número de documentos a recuperar
            min_score: Score mínimo de relevancia
            max_context_length: Longitud máxima del contexto
            separator: Separador entre documentos

        Returns:
            Diccionario con contexto y metadata

        Example:
            | ${rag}= | Build RAG Context | What is the company policy? |
            | ${prompt}= | Set Variable | Context:\\n${rag}[context]\\n\\nQuestion: ${query} |
        """
        results = self.retrieve_from_memory(query, top_k, min_score)

        if not results:
            return {
                "context": "",
                "sources": [],
                "num_sources": 0,
                "total_score": 0,
            }

        # Build context string
        context_parts = []
        sources = []
        total_length = 0

        for result in results:
            content = result.get("content", "")
            if total_length + len(content) > max_context_length:
                # Truncate if needed
                remaining = max_context_length - total_length
                if remaining > 100:  # Only add if meaningful
                    content = content[:remaining] + "..."
                else:
                    break

            context_parts.append(content)
            sources.append({
                "id": result.get("id"),
                "score": result.get("score"),
                "metadata": result.get("metadata", {}),
            })
            total_length += len(content)

        context = separator.join(context_parts)
        total_score = sum(s["score"] for s in sources) / len(sources) if sources else 0

        return {
            "context": context,
            "sources": sources,
            "num_sources": len(sources),
            "total_score": round(total_score, 4),
            "context_length": len(context),
        }

    # =========================================================================
    # DOCUMENT LOADING HELPERS
    # =========================================================================

    @keyword("Load Documents From Text")
    def load_documents_from_text(
        self,
        text: str,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Divide un texto largo en chunks para vectorización.

        Args:
            text: Texto a dividir
            chunk_size: Tamaño de cada chunk
            chunk_overlap: Solapamiento entre chunks
            metadata: Metadata a agregar a cada chunk

        Returns:
            Lista de documentos (chunks)

        Example:
            | ${docs}= | Load Documents From Text | ${long_text} | chunk_size=500 |
        """
        chunks = []
        start = 0
        chunk_index = 0

        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end]

            # Try to end at a sentence boundary
            if end < len(text):
                last_period = chunk_text.rfind(".")
                last_newline = chunk_text.rfind("\n")
                break_point = max(last_period, last_newline)
                if break_point > chunk_size // 2:
                    chunk_text = chunk_text[:break_point + 1]
                    end = start + break_point + 1

            chunk_metadata = {
                **(metadata or {}),
                "chunk_index": chunk_index,
                "start_char": start,
                "end_char": end,
            }

            chunks.append({
                "id": f"chunk_{chunk_index}_{uuid.uuid4().hex[:8]}",
                "content": chunk_text.strip(),
                "metadata": chunk_metadata,
            })

            start = end - chunk_overlap
            chunk_index += 1

        logger.info(f"Loaded text into {len(chunks)} chunks")
        return chunks

    @keyword("Load Documents From File")
    def load_documents_from_file(
        self,
        file_path: str,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
    ) -> List[Dict[str, Any]]:
        """
        Carga y divide un archivo en chunks.

        Args:
            file_path: Ruta al archivo
            chunk_size: Tamaño de cada chunk
            chunk_overlap: Solapamiento

        Returns:
            Lista de documentos

        Example:
            | ${docs}= | Load Documents From File | /path/to/doc.txt |
        """
        import os

        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()

        metadata = {
            "source": file_path,
            "filename": os.path.basename(file_path),
        }

        return self.load_documents_from_text(text, chunk_size, chunk_overlap, metadata)

    # =========================================================================
    # CLEANUP
    # =========================================================================

    @keyword("Close Vector DB Connection")
    def close_vector_db_connection(self):
        """
        Cierra la conexión al vector database.

        Example:
            | Close Vector DB Connection |
        """
        if self._client:
            provider = self._config.provider if self._config else None

            if provider == VectorDBProvider.PGVECTOR:
                try:
                    self._client.closeall()
                except:
                    pass

            self._client = None
            self._config = None

        logger.info("Vector DB connection closed")
