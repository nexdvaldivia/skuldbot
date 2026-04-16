"""
SkuldStorage - Enterprise-Grade Multi-Provider Storage Abstraction

Provides unified file operations across multiple storage backends:
- Local filesystem
- AWS S3 / S3-compatible (MinIO, Ceph, DigitalOcean Spaces)
- Azure Blob Storage
- Google Cloud Storage
- Microsoft SharePoint / OneDrive
- Google Drive
- SFTP / FTP
- WebDAV

Enterprise Features:
- Automatic retry with exponential backoff
- Connection pooling
- Streaming for large files
- Progress callbacks
- Metadata preservation
- Cross-provider copy/sync
- Audit logging
- Rate limiting
- Encryption at rest (client-side)

HIPAA/SOC2/PCI-DSS compliant when configured properly.
"""

import os
import io
import json
import hashlib
import mimetypes
import tempfile
import shutil
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import (
    Any, Dict, List, Optional, Union, BinaryIO, 
    Callable, Iterator, Tuple, TypeVar, Generic
)
from functools import wraps
import logging
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager

from robot.api.deco import keyword, library
from robot.api import logger as robot_logger

# Type definitions
ProgressCallback = Callable[[int, int], None]  # (bytes_transferred, total_bytes)
T = TypeVar('T')


class StorageProvider(str, Enum):
    """Supported storage provider types"""
    LOCAL = "local"
    S3 = "s3"
    AZURE_BLOB = "azure_blob"
    GCS = "gcs"
    SHAREPOINT = "sharepoint"
    ONEDRIVE = "onedrive"
    GOOGLE_DRIVE = "google_drive"
    SFTP = "sftp"
    FTP = "ftp"
    WEBDAV = "webdav"
    MINIO = "minio"  # S3-compatible


class StorageError(Exception):
    """Base storage exception"""
    def __init__(self, message: str, provider: str = None, operation: str = None):
        self.provider = provider
        self.operation = operation
        super().__init__(f"[{provider}:{operation}] {message}" if provider else message)


class StorageNotFoundError(StorageError):
    """File/object not found"""
    pass


class StoragePermissionError(StorageError):
    """Permission denied"""
    pass


class StorageConnectionError(StorageError):
    """Connection failed"""
    pass


class StorageQuotaError(StorageError):
    """Storage quota exceeded"""
    pass


class StorageIntegrityError(StorageError):
    """Data integrity check failed"""
    pass


@dataclass
class StorageMetadata:
    """Universal file/object metadata"""
    name: str
    path: str
    size: int
    content_type: str = "application/octet-stream"
    etag: Optional[str] = None
    created: Optional[datetime] = None
    modified: Optional[datetime] = None
    checksum_md5: Optional[str] = None
    checksum_sha256: Optional[str] = None
    is_directory: bool = False
    custom_metadata: Dict[str, str] = field(default_factory=dict)
    provider: Optional[str] = None
    storage_class: Optional[str] = None  # S3: STANDARD, GLACIER, etc.
    version_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "path": self.path,
            "size": self.size,
            "content_type": self.content_type,
            "etag": self.etag,
            "created": self.created.isoformat() if self.created else None,
            "modified": self.modified.isoformat() if self.modified else None,
            "checksum_md5": self.checksum_md5,
            "checksum_sha256": self.checksum_sha256,
            "is_directory": self.is_directory,
            "custom_metadata": self.custom_metadata,
            "provider": self.provider,
            "storage_class": self.storage_class,
            "version_id": self.version_id,
        }


@dataclass
class ListResult:
    """Result of a list operation"""
    items: List[StorageMetadata]
    prefixes: List[str] = field(default_factory=list)  # For hierarchical listing
    continuation_token: Optional[str] = None
    is_truncated: bool = False
    
    @property
    def files(self) -> List[StorageMetadata]:
        return [i for i in self.items if not i.is_directory]
    
    @property
    def directories(self) -> List[StorageMetadata]:
        return [i for i in self.items if i.is_directory]


@dataclass 
class TransferProgress:
    """Track transfer progress"""
    bytes_transferred: int = 0
    total_bytes: int = 0
    start_time: float = field(default_factory=time.time)
    
    @property
    def percentage(self) -> float:
        if self.total_bytes == 0:
            return 0.0
        return (self.bytes_transferred / self.total_bytes) * 100
    
    @property
    def elapsed_seconds(self) -> float:
        return time.time() - self.start_time
    
    @property
    def speed_bps(self) -> float:
        elapsed = self.elapsed_seconds
        if elapsed == 0:
            return 0.0
        return self.bytes_transferred / elapsed
    
    @property
    def eta_seconds(self) -> Optional[float]:
        speed = self.speed_bps
        if speed == 0:
            return None
        remaining = self.total_bytes - self.bytes_transferred
        return remaining / speed


def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exceptions: Tuple[type, ...] = (StorageConnectionError, TimeoutError)
):
    """Decorator for retry with exponential backoff"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_retries:
                        delay = min(base_delay * (2 ** attempt), max_delay)
                        logging.warning(
                            f"Retry {attempt + 1}/{max_retries} for {func.__name__} "
                            f"after {delay:.1f}s: {e}"
                        )
                        time.sleep(delay)
            raise last_exception
        return wrapper
    return decorator


class StorageBackend(ABC):
    """
    Abstract base class for storage backends.
    
    All providers must implement these methods for consistent behavior.
    """
    
    def __init__(
        self,
        provider_type: StorageProvider,
        config: Dict[str, Any],
        enable_audit: bool = True,
        enable_checksums: bool = True,
        chunk_size: int = 8 * 1024 * 1024,  # 8MB chunks
    ):
        self.provider_type = provider_type
        self.config = config
        self.enable_audit = enable_audit
        self.enable_checksums = enable_checksums
        self.chunk_size = chunk_size
        self._connected = False
        self._audit_log: List[Dict[str, Any]] = []
    
    @abstractmethod
    def connect(self) -> bool:
        """Establish connection to storage backend"""
        pass
    
    @abstractmethod
    def disconnect(self) -> None:
        """Close connection to storage backend"""
        pass
    
    @abstractmethod
    def read(
        self, 
        path: str,
        encoding: Optional[str] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read file contents"""
        pass
    
    @abstractmethod
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Write file contents"""
        pass
    
    @abstractmethod
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete file or directory"""
        pass
    
    @abstractmethod
    def exists(self, path: str) -> bool:
        """Check if file/directory exists"""
        pass
    
    @abstractmethod
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get file/object metadata"""
        pass
    
    @abstractmethod
    def list(
        self,
        path: str = "",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List files/objects"""
        pass
    
    @abstractmethod
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy file within same backend"""
        pass
    
    @abstractmethod
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move/rename file within same backend"""
        pass
    
    @abstractmethod
    def create_directory(self, path: str) -> bool:
        """Create directory/prefix"""
        pass
    
    def stream_read(
        self,
        path: str,
        chunk_size: Optional[int] = None
    ) -> Iterator[bytes]:
        """Stream read for large files"""
        # Default implementation - backends can override for efficiency
        content = self.read(path)
        if isinstance(content, str):
            content = content.encode('utf-8')
        
        chunk_size = chunk_size or self.chunk_size
        for i in range(0, len(content), chunk_size):
            yield content[i:i + chunk_size]
    
    def stream_write(
        self,
        path: str,
        stream: Iterator[bytes],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> StorageMetadata:
        """Stream write for large files"""
        # Default implementation - backends can override for multipart upload
        content = b''.join(stream)
        return self.write(path, content, content_type, metadata)
    
    def compute_checksum(
        self,
        path: str,
        algorithm: str = "sha256"
    ) -> str:
        """Compute file checksum"""
        hasher = hashlib.new(algorithm)
        for chunk in self.stream_read(path):
            hasher.update(chunk)
        return hasher.hexdigest()
    
    def _audit(self, operation: str, path: str, details: Dict[str, Any] = None):
        """Log audit entry"""
        if not self.enable_audit:
            return
            
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "provider": self.provider_type.value,
            "operation": operation,
            "path": path,
            "details": details or {}
        }
        self._audit_log.append(entry)
        logging.info(f"STORAGE_AUDIT: {json.dumps(entry)}")
    
    @property
    def is_connected(self) -> bool:
        return self._connected
    
    def __enter__(self):
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()


class LocalStorageBackend(StorageBackend):
    """
    Local filesystem storage backend.
    
    Enterprise features:
    - Atomic writes (write to temp, then rename)
    - File locking
    - Metadata preservation
    - Checksum verification
    """
    
    def __init__(
        self,
        base_path: str = "",
        local_path: str = "",  # Alias for base_path (Studio uses this)
        config: Dict[str, Any] = None,
        **kwargs
    ):
        # Support both base_path and local_path (local_path takes precedence)
        resolved_path = local_path or base_path
        super().__init__(
            provider_type=StorageProvider.LOCAL,
            config=config or {"local_path": resolved_path},
            **kwargs
        )
        self.base_path = Path(resolved_path) if resolved_path else Path.cwd()
        self._locks: Dict[str, threading.Lock] = {}
        self._lock_manager = threading.Lock()
    
    def _resolve_path(self, path: str) -> Path:
        """Resolve path relative to base"""
        if Path(path).is_absolute():
            return Path(path)
        return self.base_path / path
    
    def _get_lock(self, path: str) -> threading.Lock:
        """Get or create lock for path"""
        with self._lock_manager:
            if path not in self._locks:
                self._locks[path] = threading.Lock()
            return self._locks[path]
    
    def connect(self) -> bool:
        """Local filesystem doesn't need connection"""
        self._connected = True
        self._audit("connect", str(self.base_path))
        return True
    
    def disconnect(self) -> None:
        """Local filesystem doesn't need disconnection"""
        self._connected = False
        self._audit("disconnect", str(self.base_path))
    
    @retry_with_backoff(max_retries=3)
    def read(
        self,
        path: str,
        encoding: Optional[str] = "utf-8",
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read file contents with optional progress tracking"""
        resolved = self._resolve_path(path)
        
        if not resolved.exists():
            raise StorageNotFoundError(f"File not found: {path}", "local", "read")
        
        file_size = resolved.stat().st_size
        
        with self._get_lock(str(resolved)):
            if encoding:
                with open(resolved, 'r', encoding=encoding) as f:
                    content = f.read()
                    if progress_callback:
                        progress_callback(file_size, file_size)
                    return content
            else:
                with open(resolved, 'rb') as f:
                    content = b''
                    bytes_read = 0
                    while True:
                        chunk = f.read(self.chunk_size)
                        if not chunk:
                            break
                        content += chunk
                        bytes_read += len(chunk)
                        if progress_callback:
                            progress_callback(bytes_read, file_size)
                    return content
        
        self._audit("read", path, {"size": file_size})
    
    @retry_with_backoff(max_retries=3)
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None,
        append: bool = False
    ) -> StorageMetadata:
        """Atomic write with optional append mode"""
        resolved = self._resolve_path(path)
        
        # Ensure parent directory exists
        resolved.parent.mkdir(parents=True, exist_ok=True)
        
        with self._get_lock(str(resolved)):
            if append and resolved.exists():
                # Append mode
                mode = 'a' if isinstance(content, str) else 'ab'
                with open(resolved, mode) as f:
                    if isinstance(content, (bytes, str)):
                        f.write(content)
                    else:
                        shutil.copyfileobj(content, f)
            else:
                # Atomic write: write to temp file, then rename
                temp_path = resolved.parent / f".{resolved.name}.tmp"
                try:
                    if isinstance(content, str):
                        with open(temp_path, 'w', encoding='utf-8') as f:
                            f.write(content)
                    elif isinstance(content, bytes):
                        with open(temp_path, 'wb') as f:
                            f.write(content)
                    else:
                        with open(temp_path, 'wb') as f:
                            total = 0
                            while True:
                                chunk = content.read(self.chunk_size)
                                if not chunk:
                                    break
                                f.write(chunk)
                                total += len(chunk)
                                if progress_callback:
                                    progress_callback(total, 0)
                    
                    # Atomic rename
                    temp_path.rename(resolved)
                except Exception:
                    if temp_path.exists():
                        temp_path.unlink()
                    raise
        
        # Store custom metadata in xattr or sidecar file
        if metadata:
            self._store_metadata(resolved, metadata)
        
        result = self.get_metadata(path)
        self._audit("write", path, {"size": result.size})
        return result
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete file or directory"""
        resolved = self._resolve_path(path)
        
        if not resolved.exists():
            return False
        
        with self._get_lock(str(resolved)):
            if resolved.is_dir():
                if recursive:
                    shutil.rmtree(resolved)
                else:
                    resolved.rmdir()
            else:
                resolved.unlink()
        
        self._audit("delete", path, {"recursive": recursive})
        return True
    
    def exists(self, path: str) -> bool:
        """Check if path exists"""
        return self._resolve_path(path).exists()
    
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get file metadata"""
        resolved = self._resolve_path(path)
        
        if not resolved.exists():
            raise StorageNotFoundError(f"Path not found: {path}", "local", "get_metadata")
        
        stat = resolved.stat()
        mime_type, _ = mimetypes.guess_type(str(resolved))
        
        # Load custom metadata if exists
        custom = self._load_metadata(resolved)
        
        return StorageMetadata(
            name=resolved.name,
            path=str(resolved),
            size=stat.st_size if resolved.is_file() else 0,
            content_type=mime_type or "application/octet-stream",
            created=datetime.fromtimestamp(stat.st_ctime),
            modified=datetime.fromtimestamp(stat.st_mtime),
            is_directory=resolved.is_dir(),
            custom_metadata=custom,
            provider="local"
        )
    
    def list(
        self,
        path: str = "",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List directory contents"""
        resolved = self._resolve_path(path)
        
        if not resolved.exists():
            raise StorageNotFoundError(f"Path not found: {path}", "local", "list")
        
        items = []
        
        if recursive:
            glob_pattern = f"**/{pattern}" if pattern else "**/*"
            paths = list(resolved.glob(glob_pattern))
        else:
            glob_pattern = pattern or "*"
            paths = list(resolved.glob(glob_pattern))
        
        # Handle pagination via continuation_token (index-based)
        start_idx = int(continuation_token) if continuation_token else 0
        end_idx = start_idx + max_items
        
        for p in paths[start_idx:end_idx]:
            try:
                items.append(self.get_metadata(str(p)))
            except Exception:
                continue
        
        is_truncated = end_idx < len(paths)
        next_token = str(end_idx) if is_truncated else None
        
        return ListResult(
            items=items,
            continuation_token=next_token,
            is_truncated=is_truncated
        )
    
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy file"""
        src = self._resolve_path(source)
        dst = self._resolve_path(destination)
        
        if not src.exists():
            raise StorageNotFoundError(f"Source not found: {source}", "local", "copy")
        
        if dst.exists() and not overwrite:
            raise StorageError(f"Destination exists: {destination}", "local", "copy")
        
        dst.parent.mkdir(parents=True, exist_ok=True)
        
        if src.is_dir():
            shutil.copytree(src, dst, dirs_exist_ok=overwrite)
        else:
            # Copy with progress
            total = src.stat().st_size
            copied = 0
            with open(src, 'rb') as fsrc, open(dst, 'wb') as fdst:
                while True:
                    chunk = fsrc.read(self.chunk_size)
                    if not chunk:
                        break
                    fdst.write(chunk)
                    copied += len(chunk)
                    if progress_callback:
                        progress_callback(copied, total)
        
        self._audit("copy", source, {"destination": destination})
        return self.get_metadata(destination)
    
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move/rename file"""
        src = self._resolve_path(source)
        dst = self._resolve_path(destination)
        
        if not src.exists():
            raise StorageNotFoundError(f"Source not found: {source}", "local", "move")
        
        if dst.exists() and not overwrite:
            raise StorageError(f"Destination exists: {destination}", "local", "move")
        
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        
        self._audit("move", source, {"destination": destination})
        return self.get_metadata(destination)
    
    def create_directory(self, path: str) -> bool:
        """Create directory"""
        resolved = self._resolve_path(path)
        resolved.mkdir(parents=True, exist_ok=True)
        self._audit("create_directory", path)
        return True
    
    def _store_metadata(self, path: Path, metadata: Dict[str, str]):
        """Store custom metadata in sidecar file"""
        meta_path = path.parent / f".{path.name}.meta.json"
        with open(meta_path, 'w') as f:
            json.dump(metadata, f)
    
    def _load_metadata(self, path: Path) -> Dict[str, str]:
        """Load custom metadata from sidecar file"""
        meta_path = path.parent / f".{path.name}.meta.json"
        if meta_path.exists():
            with open(meta_path) as f:
                return json.load(f)
        return {}


class S3StorageBackend(StorageBackend):
    """
    AWS S3 / S3-compatible storage backend.
    
    Supports:
    - AWS S3
    - MinIO
    - DigitalOcean Spaces
    - Wasabi
    - Any S3-compatible API
    
    Enterprise features:
    - Multipart upload for large files
    - Server-side encryption (SSE-S3, SSE-KMS, SSE-C)
    - Versioning support
    - Transfer acceleration
    - Intelligent tiering
    """
    
    def __init__(
        self,
        bucket: str,
        region: str = "us-east-1",
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        config: Dict[str, Any] = None,
        use_ssl: bool = True,
        encryption: Optional[str] = None,  # SSE-S3, SSE-KMS, SSE-C
        kms_key_id: Optional[str] = None,
        **kwargs
    ):
        config = config or {}
        config.update({
            "bucket": bucket,
            "region": region,
            "endpoint_url": endpoint_url,
            "use_ssl": use_ssl,
            "encryption": encryption,
            "kms_key_id": kms_key_id,
        })
        
        super().__init__(
            provider_type=StorageProvider.S3,
            config=config,
            **kwargs
        )
        
        self.bucket = bucket
        self.region = region
        self.endpoint_url = endpoint_url
        self.use_ssl = use_ssl
        self.encryption = encryption
        self.kms_key_id = kms_key_id
        
        # Credentials from params or environment
        self.access_key = access_key or os.environ.get('AWS_ACCESS_KEY_ID')
        self.secret_key = secret_key or os.environ.get('AWS_SECRET_ACCESS_KEY')
        
        self._client = None
        self._resource = None
    
    def connect(self) -> bool:
        """Connect to S3"""
        try:
            import boto3
            from botocore.config import Config
            
            boto_config = Config(
                region_name=self.region,
                retries={'max_attempts': 3, 'mode': 'adaptive'},
                max_pool_connections=50,
            )
            
            session_kwargs = {}
            if self.access_key and self.secret_key:
                session_kwargs['aws_access_key_id'] = self.access_key
                session_kwargs['aws_secret_access_key'] = self.secret_key
            
            client_kwargs = {
                'config': boto_config,
                'use_ssl': self.use_ssl,
            }
            if self.endpoint_url:
                client_kwargs['endpoint_url'] = self.endpoint_url
            
            self._client = boto3.client('s3', **session_kwargs, **client_kwargs)
            self._resource = boto3.resource('s3', **session_kwargs, **client_kwargs)
            
            # Test connection
            self._client.head_bucket(Bucket=self.bucket)
            
            self._connected = True
            self._audit("connect", f"s3://{self.bucket}")
            return True
            
        except ImportError:
            raise StorageError(
                "boto3 required for S3 storage. Install with: pip install boto3",
                "s3", "connect"
            )
        except Exception as e:
            raise StorageConnectionError(str(e), "s3", "connect")
    
    def disconnect(self) -> None:
        """Disconnect from S3"""
        self._client = None
        self._resource = None
        self._connected = False
        self._audit("disconnect", f"s3://{self.bucket}")
    
    def _get_extra_args(self) -> Dict[str, Any]:
        """Get encryption and other extra args for uploads"""
        extra = {}
        if self.encryption == "SSE-S3":
            extra['ServerSideEncryption'] = 'AES256'
        elif self.encryption == "SSE-KMS":
            extra['ServerSideEncryption'] = 'aws:kms'
            if self.kms_key_id:
                extra['SSEKMSKeyId'] = self.kms_key_id
        return extra
    
    @retry_with_backoff(max_retries=3)
    def read(
        self,
        path: str,
        encoding: Optional[str] = "utf-8",
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read object from S3"""
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=path)
            content = response['Body'].read()
            
            if progress_callback:
                progress_callback(len(content), len(content))
            
            self._audit("read", f"s3://{self.bucket}/{path}")
            
            if encoding:
                return content.decode(encoding)
            return content
            
        except self._client.exceptions.NoSuchKey:
            raise StorageNotFoundError(f"Object not found: {path}", "s3", "read")
    
    @retry_with_backoff(max_retries=3)
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Write object to S3 with multipart for large files"""
        
        if isinstance(content, str):
            content = content.encode('utf-8')
        
        extra_args = self._get_extra_args()
        if content_type:
            extra_args['ContentType'] = content_type
        if metadata:
            extra_args['Metadata'] = metadata
        
        # Use multipart for large files
        if isinstance(content, bytes) and len(content) > 100 * 1024 * 1024:  # 100MB
            self._multipart_upload(path, io.BytesIO(content), extra_args, progress_callback)
        elif hasattr(content, 'read'):
            self._multipart_upload(path, content, extra_args, progress_callback)
        else:
            self._client.put_object(
                Bucket=self.bucket,
                Key=path,
                Body=content,
                **extra_args
            )
        
        self._audit("write", f"s3://{self.bucket}/{path}")
        return self.get_metadata(path)
    
    def _multipart_upload(
        self,
        key: str,
        file_obj: BinaryIO,
        extra_args: Dict,
        progress_callback: Optional[ProgressCallback]
    ):
        """Multipart upload for large files"""
        from boto3.s3.transfer import TransferConfig
        
        config = TransferConfig(
            multipart_threshold=8 * 1024 * 1024,
            multipart_chunksize=8 * 1024 * 1024,
            max_concurrency=10,
            use_threads=True
        )
        
        self._resource.Bucket(self.bucket).upload_fileobj(
            file_obj,
            key,
            ExtraArgs=extra_args,
            Config=config,
            Callback=progress_callback
        )
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete object(s) from S3"""
        try:
            if recursive:
                # Delete all objects with prefix
                paginator = self._client.get_paginator('list_objects_v2')
                for page in paginator.paginate(Bucket=self.bucket, Prefix=path):
                    objects = [{'Key': obj['Key']} for obj in page.get('Contents', [])]
                    if objects:
                        self._client.delete_objects(
                            Bucket=self.bucket,
                            Delete={'Objects': objects}
                        )
            else:
                self._client.delete_object(Bucket=self.bucket, Key=path)
            
            self._audit("delete", f"s3://{self.bucket}/{path}", {"recursive": recursive})
            return True
        except Exception:
            return False
    
    def exists(self, path: str) -> bool:
        """Check if object exists"""
        try:
            self._client.head_object(Bucket=self.bucket, Key=path)
            return True
        except:
            return False
    
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get object metadata"""
        try:
            response = self._client.head_object(Bucket=self.bucket, Key=path)
            
            return StorageMetadata(
                name=path.split('/')[-1],
                path=f"s3://{self.bucket}/{path}",
                size=response['ContentLength'],
                content_type=response.get('ContentType', 'application/octet-stream'),
                etag=response.get('ETag', '').strip('"'),
                modified=response.get('LastModified'),
                custom_metadata=response.get('Metadata', {}),
                provider="s3",
                storage_class=response.get('StorageClass'),
                version_id=response.get('VersionId'),
            )
        except self._client.exceptions.NoSuchKey:
            raise StorageNotFoundError(f"Object not found: {path}", "s3", "get_metadata")
    
    def list(
        self,
        path: str = "",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List objects in S3"""
        import fnmatch
        
        kwargs = {
            'Bucket': self.bucket,
            'Prefix': path,
            'MaxKeys': max_items,
        }
        
        if not recursive:
            kwargs['Delimiter'] = '/'
        
        if continuation_token:
            kwargs['ContinuationToken'] = continuation_token
        
        response = self._client.list_objects_v2(**kwargs)
        
        items = []
        for obj in response.get('Contents', []):
            if pattern and not fnmatch.fnmatch(obj['Key'], pattern):
                continue
            
            items.append(StorageMetadata(
                name=obj['Key'].split('/')[-1],
                path=f"s3://{self.bucket}/{obj['Key']}",
                size=obj['Size'],
                etag=obj.get('ETag', '').strip('"'),
                modified=obj.get('LastModified'),
                provider="s3",
                storage_class=obj.get('StorageClass'),
            ))
        
        prefixes = [p['Prefix'] for p in response.get('CommonPrefixes', [])]
        
        return ListResult(
            items=items,
            prefixes=prefixes,
            continuation_token=response.get('NextContinuationToken'),
            is_truncated=response.get('IsTruncated', False)
        )
    
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy object within S3"""
        if not overwrite and self.exists(destination):
            raise StorageError(f"Destination exists: {destination}", "s3", "copy")
        
        copy_source = {'Bucket': self.bucket, 'Key': source}
        extra_args = self._get_extra_args()
        
        self._client.copy(copy_source, self.bucket, destination, ExtraArgs=extra_args)
        
        self._audit("copy", f"s3://{self.bucket}/{source}", {"destination": destination})
        return self.get_metadata(destination)
    
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move object within S3 (copy then delete)"""
        result = self.copy(source, destination, overwrite)
        self.delete(source)
        self._audit("move", f"s3://{self.bucket}/{source}", {"destination": destination})
        return result
    
    def create_directory(self, path: str) -> bool:
        """Create directory marker in S3"""
        if not path.endswith('/'):
            path += '/'
        self._client.put_object(Bucket=self.bucket, Key=path, Body=b'')
        return True
    
    def generate_presigned_url(
        self,
        path: str,
        expiration: int = 3600,
        operation: str = "get_object"
    ) -> str:
        """Generate presigned URL for temporary access"""
        return self._client.generate_presigned_url(
            operation,
            Params={'Bucket': self.bucket, 'Key': path},
            ExpiresIn=expiration
        )


class AzureBlobStorageBackend(StorageBackend):
    """
    Azure Blob Storage backend.
    
    Enterprise features:
    - Block blob, append blob, page blob support
    - Managed identity authentication
    - Server-side encryption
    - Immutability policies
    - Soft delete & versioning
    """
    
    def __init__(
        self,
        container: str,
        connection_string: Optional[str] = None,
        account_name: Optional[str] = None,
        account_key: Optional[str] = None,
        sas_token: Optional[str] = None,
        config: Dict[str, Any] = None,
        **kwargs
    ):
        config = config or {}
        config.update({
            "container": container,
            "account_name": account_name,
        })
        
        super().__init__(
            provider_type=StorageProvider.AZURE_BLOB,
            config=config,
            **kwargs
        )
        
        self.container = container
        self.connection_string = connection_string or os.environ.get('AZURE_STORAGE_CONNECTION_STRING')
        self.account_name = account_name or os.environ.get('AZURE_STORAGE_ACCOUNT')
        self.account_key = account_key or os.environ.get('AZURE_STORAGE_KEY')
        self.sas_token = sas_token
        
        self._container_client = None
    
    def connect(self) -> bool:
        """Connect to Azure Blob Storage"""
        try:
            from azure.storage.blob import BlobServiceClient, ContainerClient
            
            if self.connection_string:
                service_client = BlobServiceClient.from_connection_string(self.connection_string)
            elif self.account_name and self.account_key:
                account_url = f"https://{self.account_name}.blob.core.windows.net"
                service_client = BlobServiceClient(account_url, credential=self.account_key)
            elif self.account_name and self.sas_token:
                account_url = f"https://{self.account_name}.blob.core.windows.net"
                service_client = BlobServiceClient(account_url, credential=self.sas_token)
            else:
                # Try managed identity
                from azure.identity import DefaultAzureCredential
                account_url = f"https://{self.account_name}.blob.core.windows.net"
                credential = DefaultAzureCredential()
                service_client = BlobServiceClient(account_url, credential=credential)
            
            self._container_client = service_client.get_container_client(self.container)
            
            # Ensure container exists
            try:
                self._container_client.get_container_properties()
            except:
                self._container_client.create_container()
            
            self._connected = True
            self._audit("connect", f"azure://{self.container}")
            return True
            
        except ImportError:
            raise StorageError(
                "azure-storage-blob required. Install with: pip install azure-storage-blob",
                "azure_blob", "connect"
            )
        except Exception as e:
            raise StorageConnectionError(str(e), "azure_blob", "connect")
    
    def disconnect(self) -> None:
        """Disconnect from Azure"""
        self._container_client = None
        self._connected = False
    
    @retry_with_backoff(max_retries=3)
    def read(
        self,
        path: str,
        encoding: Optional[str] = "utf-8",
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read blob from Azure"""
        from azure.core.exceptions import ResourceNotFoundError
        
        try:
            blob_client = self._container_client.get_blob_client(path)
            content = blob_client.download_blob().readall()
            
            if progress_callback:
                progress_callback(len(content), len(content))
            
            self._audit("read", f"azure://{self.container}/{path}")
            
            if encoding:
                return content.decode(encoding)
            return content
            
        except ResourceNotFoundError:
            raise StorageNotFoundError(f"Blob not found: {path}", "azure_blob", "read")
    
    @retry_with_backoff(max_retries=3)
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Write blob to Azure"""
        if isinstance(content, str):
            content = content.encode('utf-8')
        
        blob_client = self._container_client.get_blob_client(path)
        
        kwargs = {}
        if content_type:
            from azure.storage.blob import ContentSettings
            kwargs['content_settings'] = ContentSettings(content_type=content_type)
        if metadata:
            kwargs['metadata'] = metadata
        
        blob_client.upload_blob(content, overwrite=True, **kwargs)
        
        self._audit("write", f"azure://{self.container}/{path}")
        return self.get_metadata(path)
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete blob from Azure"""
        try:
            if recursive:
                blobs = self._container_client.list_blobs(name_starts_with=path)
                for blob in blobs:
                    self._container_client.delete_blob(blob.name)
            else:
                blob_client = self._container_client.get_blob_client(path)
                blob_client.delete_blob()
            
            self._audit("delete", f"azure://{self.container}/{path}")
            return True
        except:
            return False
    
    def exists(self, path: str) -> bool:
        """Check if blob exists"""
        blob_client = self._container_client.get_blob_client(path)
        return blob_client.exists()
    
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get blob metadata"""
        from azure.core.exceptions import ResourceNotFoundError
        
        try:
            blob_client = self._container_client.get_blob_client(path)
            props = blob_client.get_blob_properties()
            
            return StorageMetadata(
                name=path.split('/')[-1],
                path=f"azure://{self.container}/{path}",
                size=props.size,
                content_type=props.content_settings.content_type or "application/octet-stream",
                etag=props.etag,
                created=props.creation_time,
                modified=props.last_modified,
                custom_metadata=props.metadata or {},
                provider="azure_blob",
            )
        except ResourceNotFoundError:
            raise StorageNotFoundError(f"Blob not found: {path}", "azure_blob", "get_metadata")
    
    def list(
        self,
        path: str = "",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List blobs in Azure container"""
        import fnmatch
        
        kwargs = {'name_starts_with': path}
        
        blobs = self._container_client.list_blobs(**kwargs)
        
        items = []
        count = 0
        
        for blob in blobs:
            if count >= max_items:
                break
            
            if pattern and not fnmatch.fnmatch(blob.name, pattern):
                continue
            
            if not recursive and '/' in blob.name[len(path):].lstrip('/'):
                continue
            
            items.append(StorageMetadata(
                name=blob.name.split('/')[-1],
                path=f"azure://{self.container}/{blob.name}",
                size=blob.size,
                content_type=blob.content_settings.content_type if blob.content_settings else None,
                etag=blob.etag,
                modified=blob.last_modified,
                provider="azure_blob",
            ))
            count += 1
        
        return ListResult(items=items)
    
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy blob within Azure"""
        source_blob = self._container_client.get_blob_client(source)
        dest_blob = self._container_client.get_blob_client(destination)
        
        dest_blob.start_copy_from_url(source_blob.url)
        
        return self.get_metadata(destination)
    
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move blob within Azure"""
        result = self.copy(source, destination, overwrite)
        self.delete(source)
        return result
    
    def create_directory(self, path: str) -> bool:
        """Azure Blob doesn't have real directories, create marker"""
        if not path.endswith('/'):
            path += '/'
        blob_client = self._container_client.get_blob_client(path)
        blob_client.upload_blob(b'', overwrite=True)
        return True


class SFTPStorageBackend(StorageBackend):
    """
    SFTP storage backend for secure file transfers.
    
    Enterprise features:
    - Key-based authentication
    - Host key verification
    - Bandwidth limiting
    - Resume interrupted transfers
    """
    
    def __init__(
        self,
        host: str,
        port: int = 22,
        username: str = None,
        password: str = None,
        private_key_path: str = None,
        private_key_passphrase: str = None,
        host_key: str = None,
        config: Dict[str, Any] = None,
        **kwargs
    ):
        config = config or {}
        config.update({
            "host": host,
            "port": port,
            "username": username,
        })
        
        super().__init__(
            provider_type=StorageProvider.SFTP,
            config=config,
            **kwargs
        )
        
        self.host = host
        self.port = port
        self.username = username or os.environ.get('SFTP_USERNAME')
        self.password = password or os.environ.get('SFTP_PASSWORD')
        self.private_key_path = private_key_path
        self.private_key_passphrase = private_key_passphrase
        self.host_key = host_key
        
        self._transport = None
        self._sftp = None
    
    def connect(self) -> bool:
        """Connect to SFTP server"""
        try:
            import paramiko
            
            self._transport = paramiko.Transport((self.host, self.port))
            
            if self.private_key_path:
                key = paramiko.RSAKey.from_private_key_file(
                    self.private_key_path,
                    password=self.private_key_passphrase
                )
                self._transport.connect(username=self.username, pkey=key)
            else:
                self._transport.connect(username=self.username, password=self.password)
            
            self._sftp = paramiko.SFTPClient.from_transport(self._transport)
            
            self._connected = True
            self._audit("connect", f"sftp://{self.host}:{self.port}")
            return True
            
        except ImportError:
            raise StorageError(
                "paramiko required for SFTP. Install with: pip install paramiko",
                "sftp", "connect"
            )
        except Exception as e:
            raise StorageConnectionError(str(e), "sftp", "connect")
    
    def disconnect(self) -> None:
        """Disconnect from SFTP"""
        if self._sftp:
            self._sftp.close()
        if self._transport:
            self._transport.close()
        self._connected = False
    
    @retry_with_backoff(max_retries=3)
    def read(
        self,
        path: str,
        encoding: Optional[str] = "utf-8",
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read file from SFTP"""
        try:
            with self._sftp.open(path, 'rb') as f:
                content = f.read()
            
            if progress_callback:
                progress_callback(len(content), len(content))
            
            if encoding:
                return content.decode(encoding)
            return content
            
        except FileNotFoundError:
            raise StorageNotFoundError(f"File not found: {path}", "sftp", "read")
    
    @retry_with_backoff(max_retries=3)
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Write file to SFTP"""
        if isinstance(content, str):
            content = content.encode('utf-8')
        
        # Ensure parent directory exists
        parent = '/'.join(path.split('/')[:-1])
        if parent:
            self._ensure_directory(parent)
        
        with self._sftp.open(path, 'wb') as f:
            if hasattr(content, 'read'):
                total = 0
                while True:
                    chunk = content.read(self.chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    total += len(chunk)
                    if progress_callback:
                        progress_callback(total, 0)
            else:
                f.write(content)
        
        return self.get_metadata(path)
    
    def _ensure_directory(self, path: str):
        """Recursively create directories"""
        parts = path.split('/')
        current = ''
        for part in parts:
            if not part:
                continue
            current += '/' + part
            try:
                self._sftp.stat(current)
            except FileNotFoundError:
                self._sftp.mkdir(current)
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete file/directory from SFTP"""
        try:
            stat = self._sftp.stat(path)
            import stat as stat_module
            
            if stat_module.S_ISDIR(stat.st_mode):
                if recursive:
                    self._recursive_delete(path)
                else:
                    self._sftp.rmdir(path)
            else:
                self._sftp.remove(path)
            return True
        except:
            return False
    
    def _recursive_delete(self, path: str):
        """Recursively delete directory"""
        for item in self._sftp.listdir_attr(path):
            import stat as stat_module
            item_path = f"{path}/{item.filename}"
            if stat_module.S_ISDIR(item.st_mode):
                self._recursive_delete(item_path)
            else:
                self._sftp.remove(item_path)
        self._sftp.rmdir(path)
    
    def exists(self, path: str) -> bool:
        """Check if path exists"""
        try:
            self._sftp.stat(path)
            return True
        except:
            return False
    
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get file metadata"""
        import stat as stat_module
        
        try:
            stat = self._sftp.stat(path)
            
            return StorageMetadata(
                name=path.split('/')[-1],
                path=f"sftp://{self.host}{path}",
                size=stat.st_size,
                modified=datetime.fromtimestamp(stat.st_mtime) if stat.st_mtime else None,
                is_directory=stat_module.S_ISDIR(stat.st_mode),
                provider="sftp",
            )
        except FileNotFoundError:
            raise StorageNotFoundError(f"Path not found: {path}", "sftp", "get_metadata")
    
    def list(
        self,
        path: str = ".",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List files on SFTP"""
        import fnmatch
        import stat as stat_module
        
        items = []
        
        def _list_dir(dir_path: str, remaining: int):
            if remaining <= 0:
                return
            
            try:
                for attr in self._sftp.listdir_attr(dir_path):
                    if len(items) >= max_items:
                        return
                    
                    item_path = f"{dir_path}/{attr.filename}"
                    
                    if pattern and not fnmatch.fnmatch(attr.filename, pattern):
                        continue
                    
                    items.append(StorageMetadata(
                        name=attr.filename,
                        path=f"sftp://{self.host}{item_path}",
                        size=attr.st_size,
                        modified=datetime.fromtimestamp(attr.st_mtime) if attr.st_mtime else None,
                        is_directory=stat_module.S_ISDIR(attr.st_mode),
                        provider="sftp",
                    ))
                    
                    if recursive and stat_module.S_ISDIR(attr.st_mode):
                        _list_dir(item_path, remaining - 1)
            except:
                pass
        
        _list_dir(path, max_items)
        
        return ListResult(items=items)
    
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy file on SFTP (download and re-upload)"""
        content = self.read(source, encoding=None)
        return self.write(destination, content, progress_callback=progress_callback)
    
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move/rename file on SFTP"""
        self._sftp.rename(source, destination)
        return self.get_metadata(destination)
    
    def create_directory(self, path: str) -> bool:
        """Create directory on SFTP"""
        self._ensure_directory(path)
        return True


class FTPStorageBackend(StorageBackend):
    """
    FTP/FTPS storage backend.
    
    Enterprise features:
    - TLS/SSL support (FTPS)
    - Passive mode
    - Binary/ASCII transfer modes
    - Resume support
    """
    
    def __init__(
        self,
        host: str,
        port: int = 21,
        username: str = None,
        password: str = None,
        secure: bool = True,
        passive: bool = True,
        config: Dict[str, Any] = None,
        **kwargs
    ):
        config = config or {}
        config.update({
            "host": host,
            "port": port,
            "username": username,
            "secure": secure,
        })
        
        super().__init__(
            provider_type=StorageProvider.FTP,
            config=config,
            **kwargs
        )
        
        self.host = host
        self.port = port
        self.username = username or os.environ.get('FTP_USERNAME')
        self.password = password or os.environ.get('FTP_PASSWORD')
        self.secure = secure
        self.passive = passive
        
        self._ftp = None
    
    def connect(self) -> bool:
        """Connect to FTP server"""
        try:
            from ftplib import FTP, FTP_TLS
            
            if self.secure:
                self._ftp = FTP_TLS()
                self._ftp.connect(self.host, self.port)
                self._ftp.login(self.username, self.password)
                self._ftp.prot_p()  # Enable data encryption
            else:
                self._ftp = FTP()
                self._ftp.connect(self.host, self.port)
                self._ftp.login(self.username, self.password)
            
            if self.passive:
                self._ftp.set_pasv(True)
            
            self._connected = True
            self._audit("connect", f"ftp://{self.host}:{self.port}")
            return True
            
        except Exception as e:
            raise StorageConnectionError(str(e), "ftp", "connect")
    
    def disconnect(self) -> None:
        """Disconnect from FTP"""
        if self._ftp:
            try:
                self._ftp.quit()
            except:
                pass
        self._connected = False
    
    @retry_with_backoff(max_retries=3)
    def read(
        self,
        path: str,
        encoding: Optional[str] = "utf-8",
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read file from FTP"""
        content = io.BytesIO()
        
        try:
            self._ftp.retrbinary(f'RETR {path}', content.write)
            data = content.getvalue()
            
            if progress_callback:
                progress_callback(len(data), len(data))
            
            if encoding:
                return data.decode(encoding)
            return data
            
        except Exception as e:
            if "550" in str(e):
                raise StorageNotFoundError(f"File not found: {path}", "ftp", "read")
            raise
    
    @retry_with_backoff(max_retries=3)
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Write file to FTP"""
        if isinstance(content, str):
            content = content.encode('utf-8')
        
        # Ensure parent directory exists
        parent = '/'.join(path.split('/')[:-1])
        if parent:
            self._ensure_directory(parent)
        
        if isinstance(content, bytes):
            bio = io.BytesIO(content)
            self._ftp.storbinary(f'STOR {path}', bio)
        else:
            self._ftp.storbinary(f'STOR {path}', content)
        
        return self.get_metadata(path)
    
    def _ensure_directory(self, path: str):
        """Recursively create directories"""
        parts = path.split('/')
        current = ''
        for part in parts:
            if not part:
                continue
            current += '/' + part
            try:
                self._ftp.mkd(current)
            except:
                pass  # Directory might already exist
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete file/directory from FTP"""
        try:
            try:
                self._ftp.delete(path)
            except:
                if recursive:
                    self._recursive_delete(path)
                else:
                    self._ftp.rmd(path)
            return True
        except:
            return False
    
    def _recursive_delete(self, path: str):
        """Recursively delete directory"""
        try:
            items = self._ftp.nlst(path)
            for item in items:
                if item in ['.', '..']:
                    continue
                try:
                    self._ftp.delete(item)
                except:
                    self._recursive_delete(item)
            self._ftp.rmd(path)
        except:
            pass
    
    def exists(self, path: str) -> bool:
        """Check if path exists"""
        try:
            self._ftp.size(path)
            return True
        except:
            try:
                self._ftp.cwd(path)
                self._ftp.cwd('/')
                return True
            except:
                return False
    
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get file metadata"""
        try:
            size = self._ftp.size(path)
            # Get modification time if available
            try:
                mdtm = self._ftp.sendcmd(f'MDTM {path}')
                modified = datetime.strptime(mdtm[4:], '%Y%m%d%H%M%S')
            except:
                modified = None
            
            return StorageMetadata(
                name=path.split('/')[-1],
                path=f"ftp://{self.host}{path}",
                size=size or 0,
                modified=modified,
                provider="ftp",
            )
        except Exception as e:
            raise StorageNotFoundError(f"Path not found: {path}", "ftp", "get_metadata")
    
    def list(
        self,
        path: str = "/",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List files on FTP"""
        import fnmatch
        
        items = []
        
        try:
            # Use MLSD if available (RFC 3659) for better metadata
            try:
                for name, facts in self._ftp.mlsd(path):
                    if name in ['.', '..']:
                        continue
                    if len(items) >= max_items:
                        break
                    if pattern and not fnmatch.fnmatch(name, pattern):
                        continue
                    
                    is_dir = facts.get('type') == 'dir'
                    size = int(facts.get('size', 0)) if not is_dir else 0
                    
                    items.append(StorageMetadata(
                        name=name,
                        path=f"ftp://{self.host}{path}/{name}",
                        size=size,
                        is_directory=is_dir,
                        provider="ftp",
                    ))
                    
                    if recursive and is_dir:
                        sub_result = self.list(f"{path}/{name}", pattern, True, max_items - len(items))
                        items.extend(sub_result.items)
            except:
                # Fallback to NLST
                for name in self._ftp.nlst(path):
                    if len(items) >= max_items:
                        break
                    if pattern and not fnmatch.fnmatch(name, pattern):
                        continue
                    
                    items.append(StorageMetadata(
                        name=name.split('/')[-1],
                        path=f"ftp://{self.host}{name}",
                        size=0,
                        provider="ftp",
                    ))
        except:
            pass
        
        return ListResult(items=items)
    
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy file on FTP (download and re-upload)"""
        content = self.read(source, encoding=None)
        return self.write(destination, content, progress_callback=progress_callback)
    
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move/rename file on FTP"""
        self._ftp.rename(source, destination)
        return self.get_metadata(destination)
    
    def create_directory(self, path: str) -> bool:
        """Create directory on FTP"""
        self._ensure_directory(path)
        return True


class WebDAVStorageBackend(StorageBackend):
    """
    WebDAV storage backend.
    
    Compatible with:
    - NextCloud
    - ownCloud
    - Apache mod_dav
    - Microsoft IIS WebDAV
    - Box.com
    """
    
    def __init__(
        self,
        url: str,
        username: str = None,
        password: str = None,
        auth_type: str = "basic",  # basic, digest
        verify_ssl: bool = True,
        config: Dict[str, Any] = None,
        **kwargs
    ):
        config = config or {}
        config.update({
            "url": url,
            "username": username,
            "auth_type": auth_type,
        })
        
        super().__init__(
            provider_type=StorageProvider.WEBDAV,
            config=config,
            **kwargs
        )
        
        self.url = url.rstrip('/')
        self.username = username or os.environ.get('WEBDAV_USERNAME')
        self.password = password or os.environ.get('WEBDAV_PASSWORD')
        self.auth_type = auth_type
        self.verify_ssl = verify_ssl
        
        self._session = None
    
    def connect(self) -> bool:
        """Connect to WebDAV server"""
        try:
            import requests
            from requests.auth import HTTPBasicAuth, HTTPDigestAuth
            
            self._session = requests.Session()
            self._session.verify = self.verify_ssl
            
            if self.username and self.password:
                if self.auth_type == "digest":
                    self._session.auth = HTTPDigestAuth(self.username, self.password)
                else:
                    self._session.auth = HTTPBasicAuth(self.username, self.password)
            
            # Test connection with PROPFIND
            response = self._session.request(
                'PROPFIND',
                self.url,
                headers={'Depth': '0'}
            )
            response.raise_for_status()
            
            self._connected = True
            self._audit("connect", self.url)
            return True
            
        except ImportError:
            raise StorageError(
                "requests required for WebDAV. Install with: pip install requests",
                "webdav", "connect"
            )
        except Exception as e:
            raise StorageConnectionError(str(e), "webdav", "connect")
    
    def disconnect(self) -> None:
        """Disconnect from WebDAV"""
        if self._session:
            self._session.close()
        self._connected = False
    
    def _full_url(self, path: str) -> str:
        """Build full URL for path"""
        if path.startswith('/'):
            path = path[1:]
        return f"{self.url}/{path}"
    
    @retry_with_backoff(max_retries=3)
    def read(
        self,
        path: str,
        encoding: Optional[str] = "utf-8",
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read file from WebDAV"""
        response = self._session.get(self._full_url(path))
        
        if response.status_code == 404:
            raise StorageNotFoundError(f"File not found: {path}", "webdav", "read")
        response.raise_for_status()
        
        content = response.content
        
        if progress_callback:
            progress_callback(len(content), len(content))
        
        if encoding:
            return content.decode(encoding)
        return content
    
    @retry_with_backoff(max_retries=3)
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Write file to WebDAV"""
        if isinstance(content, str):
            content = content.encode('utf-8')
        
        # Ensure parent directory exists
        parent = '/'.join(path.split('/')[:-1])
        if parent:
            self.create_directory(parent)
        
        headers = {}
        if content_type:
            headers['Content-Type'] = content_type
        
        if hasattr(content, 'read'):
            data = content.read()
        else:
            data = content
        
        response = self._session.put(
            self._full_url(path),
            data=data,
            headers=headers
        )
        response.raise_for_status()
        
        return self.get_metadata(path)
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete file/directory from WebDAV"""
        try:
            response = self._session.request('DELETE', self._full_url(path))
            return response.status_code in [200, 204, 404]
        except:
            return False
    
    def exists(self, path: str) -> bool:
        """Check if path exists"""
        try:
            response = self._session.request(
                'PROPFIND',
                self._full_url(path),
                headers={'Depth': '0'}
            )
            return response.status_code == 207
        except:
            return False
    
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get file metadata via PROPFIND"""
        import xml.etree.ElementTree as ET
        
        response = self._session.request(
            'PROPFIND',
            self._full_url(path),
            headers={'Depth': '0'}
        )
        
        if response.status_code == 404:
            raise StorageNotFoundError(f"Path not found: {path}", "webdav", "get_metadata")
        response.raise_for_status()
        
        # Parse WebDAV XML response
        try:
            root = ET.fromstring(response.content)
            ns = {'d': 'DAV:'}
            
            size = 0
            is_dir = False
            modified = None
            
            content_length = root.find('.//d:getcontentlength', ns)
            if content_length is not None and content_length.text:
                size = int(content_length.text)
            
            resource_type = root.find('.//d:resourcetype/d:collection', ns)
            is_dir = resource_type is not None
            
            last_modified = root.find('.//d:getlastmodified', ns)
            if last_modified is not None and last_modified.text:
                try:
                    from email.utils import parsedate_to_datetime
                    modified = parsedate_to_datetime(last_modified.text)
                except:
                    pass
            
            return StorageMetadata(
                name=path.split('/')[-1] or path,
                path=f"webdav://{self.url}/{path}",
                size=size,
                is_directory=is_dir,
                modified=modified,
                provider="webdav",
            )
        except Exception as e:
            return StorageMetadata(
                name=path.split('/')[-1] or path,
                path=f"webdav://{self.url}/{path}",
                size=0,
                provider="webdav",
            )
    
    def list(
        self,
        path: str = "",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List files via PROPFIND"""
        import fnmatch
        import xml.etree.ElementTree as ET
        
        response = self._session.request(
            'PROPFIND',
            self._full_url(path),
            headers={'Depth': '1' if not recursive else 'infinity'}
        )
        
        if response.status_code == 404:
            raise StorageNotFoundError(f"Path not found: {path}", "webdav", "list")
        
        items = []
        try:
            root = ET.fromstring(response.content)
            ns = {'d': 'DAV:'}
            
            for response_elem in root.findall('.//d:response', ns):
                href = response_elem.find('d:href', ns)
                if href is None:
                    continue
                
                item_path = href.text
                name = item_path.rstrip('/').split('/')[-1]
                
                if not name or item_path.rstrip('/') == path.rstrip('/'):
                    continue
                
                if len(items) >= max_items:
                    break
                
                if pattern and not fnmatch.fnmatch(name, pattern):
                    continue
                
                # Get properties
                size = 0
                is_dir = False
                modified = None
                
                content_length = response_elem.find('.//d:getcontentlength', ns)
                if content_length is not None and content_length.text:
                    size = int(content_length.text)
                
                resource_type = response_elem.find('.//d:resourcetype/d:collection', ns)
                is_dir = resource_type is not None
                
                items.append(StorageMetadata(
                    name=name,
                    path=f"webdav://{self.url}{item_path}",
                    size=size,
                    is_directory=is_dir,
                    modified=modified,
                    provider="webdav",
                ))
        except:
            pass
        
        return ListResult(items=items)
    
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy file via WebDAV COPY"""
        headers = {
            'Destination': self._full_url(destination),
            'Overwrite': 'T' if overwrite else 'F',
        }
        response = self._session.request(
            'COPY',
            self._full_url(source),
            headers=headers
        )
        response.raise_for_status()
        return self.get_metadata(destination)
    
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move file via WebDAV MOVE"""
        headers = {
            'Destination': self._full_url(destination),
            'Overwrite': 'T' if overwrite else 'F',
        }
        response = self._session.request(
            'MOVE',
            self._full_url(source),
            headers=headers
        )
        response.raise_for_status()
        return self.get_metadata(destination)
    
    def create_directory(self, path: str) -> bool:
        """Create directory via MKCOL"""
        parts = path.strip('/').split('/')
        current = ''
        for part in parts:
            current += '/' + part
            try:
                response = self._session.request('MKCOL', self._full_url(current))
                # 201 = Created, 405 = Already exists
            except:
                pass
        return True


class GoogleCloudStorageBackend(StorageBackend):
    """
    Google Cloud Storage backend.
    
    Enterprise features:
    - Service account authentication
    - Uniform bucket-level access
    - Customer-managed encryption keys
    - Object versioning
    - Signed URLs
    """
    
    def __init__(
        self,
        bucket: str,
        project: str = None,
        credentials_json: str = None,
        credentials_path: str = None,
        config: Dict[str, Any] = None,
        **kwargs
    ):
        config = config or {}
        config.update({
            "bucket": bucket,
            "project": project,
        })
        
        super().__init__(
            provider_type=StorageProvider.GCS,
            config=config,
            **kwargs
        )
        
        self.bucket_name = bucket
        self.project = project
        self.credentials_json = credentials_json
        self.credentials_path = credentials_path or os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
        
        self._client = None
        self._bucket = None
    
    def connect(self) -> bool:
        """Connect to Google Cloud Storage"""
        try:
            from google.cloud import storage
            from google.oauth2 import service_account
            
            if self.credentials_json:
                import json
                creds_dict = json.loads(self.credentials_json) if isinstance(self.credentials_json, str) else self.credentials_json
                credentials = service_account.Credentials.from_service_account_info(creds_dict)
                self._client = storage.Client(credentials=credentials, project=self.project)
            elif self.credentials_path:
                self._client = storage.Client.from_service_account_json(
                    self.credentials_path,
                    project=self.project
                )
            else:
                # Use default credentials (ADC)
                self._client = storage.Client(project=self.project)
            
            self._bucket = self._client.bucket(self.bucket_name)
            
            # Verify bucket exists
            if not self._bucket.exists():
                raise StorageError(f"Bucket does not exist: {self.bucket_name}", "gcs", "connect")
            
            self._connected = True
            self._audit("connect", f"gs://{self.bucket_name}")
            return True
            
        except ImportError:
            raise StorageError(
                "google-cloud-storage required. Install with: pip install google-cloud-storage",
                "gcs", "connect"
            )
        except Exception as e:
            raise StorageConnectionError(str(e), "gcs", "connect")
    
    def disconnect(self) -> None:
        """Disconnect from GCS"""
        self._client = None
        self._bucket = None
        self._connected = False
    
    @retry_with_backoff(max_retries=3)
    def read(
        self,
        path: str,
        encoding: Optional[str] = "utf-8",
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read object from GCS"""
        from google.cloud.exceptions import NotFound
        
        try:
            blob = self._bucket.blob(path)
            content = blob.download_as_bytes()
            
            if progress_callback:
                progress_callback(len(content), len(content))
            
            self._audit("read", f"gs://{self.bucket_name}/{path}")
            
            if encoding:
                return content.decode(encoding)
            return content
            
        except NotFound:
            raise StorageNotFoundError(f"Object not found: {path}", "gcs", "read")
    
    @retry_with_backoff(max_retries=3)
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Write object to GCS"""
        if isinstance(content, str):
            content = content.encode('utf-8')
        
        blob = self._bucket.blob(path)
        
        if metadata:
            blob.metadata = metadata
        
        if hasattr(content, 'read'):
            blob.upload_from_file(content, content_type=content_type)
        else:
            blob.upload_from_string(content, content_type=content_type)
        
        self._audit("write", f"gs://{self.bucket_name}/{path}")
        return self.get_metadata(path)
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete object(s) from GCS"""
        try:
            if recursive:
                blobs = list(self._bucket.list_blobs(prefix=path))
                self._bucket.delete_blobs(blobs)
            else:
                blob = self._bucket.blob(path)
                blob.delete()
            
            self._audit("delete", f"gs://{self.bucket_name}/{path}", {"recursive": recursive})
            return True
        except:
            return False
    
    def exists(self, path: str) -> bool:
        """Check if object exists"""
        blob = self._bucket.blob(path)
        return blob.exists()
    
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get object metadata"""
        from google.cloud.exceptions import NotFound
        
        try:
            blob = self._bucket.get_blob(path)
            if not blob:
                raise StorageNotFoundError(f"Object not found: {path}", "gcs", "get_metadata")
            
            return StorageMetadata(
                name=path.split('/')[-1],
                path=f"gs://{self.bucket_name}/{path}",
                size=blob.size or 0,
                content_type=blob.content_type,
                etag=blob.etag,
                created=blob.time_created,
                modified=blob.updated,
                checksum_md5=blob.md5_hash,
                custom_metadata=blob.metadata or {},
                provider="gcs",
                storage_class=blob.storage_class,
            )
        except NotFound:
            raise StorageNotFoundError(f"Object not found: {path}", "gcs", "get_metadata")
    
    def list(
        self,
        path: str = "",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List objects in GCS"""
        import fnmatch
        
        kwargs = {'prefix': path, 'max_results': max_items}
        
        if not recursive:
            kwargs['delimiter'] = '/'
        
        if continuation_token:
            kwargs['page_token'] = continuation_token
        
        blobs = self._bucket.list_blobs(**kwargs)
        
        items = []
        prefixes = []
        next_token = None
        
        for blob in blobs:
            if pattern and not fnmatch.fnmatch(blob.name, pattern):
                continue
            
            items.append(StorageMetadata(
                name=blob.name.split('/')[-1],
                path=f"gs://{self.bucket_name}/{blob.name}",
                size=blob.size or 0,
                content_type=blob.content_type,
                etag=blob.etag,
                modified=blob.updated,
                provider="gcs",
                storage_class=blob.storage_class,
            ))
        
        # Get prefixes (virtual directories)
        if hasattr(blobs, 'prefixes'):
            prefixes = list(blobs.prefixes or [])
        
        if hasattr(blobs, 'next_page_token'):
            next_token = blobs.next_page_token
        
        return ListResult(
            items=items,
            prefixes=prefixes,
            continuation_token=next_token,
            is_truncated=next_token is not None
        )
    
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy object within GCS"""
        source_blob = self._bucket.blob(source)
        dest_blob = self._bucket.copy_blob(source_blob, self._bucket, destination)
        
        self._audit("copy", f"gs://{self.bucket_name}/{source}", {"destination": destination})
        return self.get_metadata(destination)
    
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move object within GCS"""
        result = self.copy(source, destination, overwrite)
        self.delete(source)
        self._audit("move", f"gs://{self.bucket_name}/{source}", {"destination": destination})
        return result
    
    def create_directory(self, path: str) -> bool:
        """Create directory marker in GCS"""
        if not path.endswith('/'):
            path += '/'
        blob = self._bucket.blob(path)
        blob.upload_from_string(b'')
        return True
    
    def generate_signed_url(
        self,
        path: str,
        expiration: int = 3600,
        method: str = "GET"
    ) -> str:
        """Generate signed URL for temporary access"""
        from datetime import timedelta
        
        blob = self._bucket.blob(path)
        return blob.generate_signed_url(
            expiration=timedelta(seconds=expiration),
            method=method
        )


class SharePointStorageBackend(StorageBackend):
    """
    Microsoft SharePoint storage backend.
    
    Uses Microsoft Graph API for:
    - Document libraries
    - Site collections
    - Team sites
    """
    
    def __init__(
        self,
        site_url: str,
        tenant_id: str = None,
        client_id: str = None,
        client_secret: str = None,
        library: str = "Documents",
        config: Dict[str, Any] = None,
        **kwargs
    ):
        config = config or {}
        config.update({
            "site_url": site_url,
            "library": library,
        })
        
        super().__init__(
            provider_type=StorageProvider.SHAREPOINT,
            config=config,
            **kwargs
        )
        
        self.site_url = site_url
        self.tenant_id = tenant_id or os.environ.get('AZURE_TENANT_ID')
        self.client_id = client_id or os.environ.get('AZURE_CLIENT_ID')
        self.client_secret = client_secret or os.environ.get('AZURE_CLIENT_SECRET')
        self.library = library
        
        self._token = None
        self._site_id = None
        self._drive_id = None
        self._session = None
    
    def connect(self) -> bool:
        """Connect to SharePoint via Graph API"""
        try:
            import requests
            
            # Get OAuth token
            token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
            token_data = {
                'grant_type': 'client_credentials',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'scope': 'https://graph.microsoft.com/.default'
            }
            
            response = requests.post(token_url, data=token_data)
            response.raise_for_status()
            self._token = response.json()['access_token']
            
            self._session = requests.Session()
            self._session.headers.update({
                'Authorization': f'Bearer {self._token}',
                'Content-Type': 'application/json'
            })
            
            # Get site ID from URL
            # Parse: https://company.sharepoint.com/sites/MySite
            import urllib.parse
            parsed = urllib.parse.urlparse(self.site_url)
            hostname = parsed.netloc
            path_parts = parsed.path.strip('/').split('/')
            
            if len(path_parts) >= 2 and path_parts[0] == 'sites':
                site_path = f"/sites/{path_parts[1]}"
            else:
                site_path = parsed.path
            
            # Get site
            site_response = self._session.get(
                f"https://graph.microsoft.com/v1.0/sites/{hostname}:{site_path}"
            )
            site_response.raise_for_status()
            self._site_id = site_response.json()['id']
            
            # Get document library drive ID
            drives_response = self._session.get(
                f"https://graph.microsoft.com/v1.0/sites/{self._site_id}/drives"
            )
            drives_response.raise_for_status()
            
            for drive in drives_response.json().get('value', []):
                if drive.get('name') == self.library:
                    self._drive_id = drive['id']
                    break
            
            if not self._drive_id:
                # Use default drive
                self._drive_id = drives_response.json()['value'][0]['id']
            
            self._connected = True
            self._audit("connect", f"sharepoint://{self.site_url}/{self.library}")
            return True
            
        except ImportError:
            raise StorageError(
                "requests required for SharePoint. Install with: pip install requests",
                "sharepoint", "connect"
            )
        except Exception as e:
            raise StorageConnectionError(str(e), "sharepoint", "connect")
    
    def disconnect(self) -> None:
        """Disconnect from SharePoint"""
        if self._session:
            self._session.close()
        self._connected = False
    
    def _graph_path(self, path: str) -> str:
        """Build Graph API path for file"""
        path = path.strip('/')
        if path:
            return f"https://graph.microsoft.com/v1.0/drives/{self._drive_id}/root:/{path}"
        return f"https://graph.microsoft.com/v1.0/drives/{self._drive_id}/root"
    
    @retry_with_backoff(max_retries=3)
    def read(
        self,
        path: str,
        encoding: Optional[str] = "utf-8",
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read file from SharePoint"""
        response = self._session.get(f"{self._graph_path(path)}:/content")
        
        if response.status_code == 404:
            raise StorageNotFoundError(f"File not found: {path}", "sharepoint", "read")
        response.raise_for_status()
        
        content = response.content
        
        if progress_callback:
            progress_callback(len(content), len(content))
        
        if encoding:
            return content.decode(encoding)
        return content
    
    @retry_with_backoff(max_retries=3)
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Write file to SharePoint"""
        if isinstance(content, str):
            content = content.encode('utf-8')
        
        if hasattr(content, 'read'):
            content = content.read()
        
        headers = {'Content-Type': content_type or 'application/octet-stream'}
        
        response = self._session.put(
            f"{self._graph_path(path)}:/content",
            data=content,
            headers=headers
        )
        response.raise_for_status()
        
        return self.get_metadata(path)
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete file/folder from SharePoint"""
        try:
            response = self._session.delete(self._graph_path(path))
            return response.status_code in [200, 204, 404]
        except:
            return False
    
    def exists(self, path: str) -> bool:
        """Check if file exists"""
        try:
            response = self._session.get(self._graph_path(path))
            return response.status_code == 200
        except:
            return False
    
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get file metadata"""
        response = self._session.get(self._graph_path(path))
        
        if response.status_code == 404:
            raise StorageNotFoundError(f"Path not found: {path}", "sharepoint", "get_metadata")
        response.raise_for_status()
        
        item = response.json()
        
        return StorageMetadata(
            name=item.get('name', path.split('/')[-1]),
            path=f"sharepoint://{self.site_url}/{path}",
            size=item.get('size', 0),
            content_type=item.get('file', {}).get('mimeType'),
            etag=item.get('eTag'),
            created=datetime.fromisoformat(item['createdDateTime'].replace('Z', '+00:00')) if item.get('createdDateTime') else None,
            modified=datetime.fromisoformat(item['lastModifiedDateTime'].replace('Z', '+00:00')) if item.get('lastModifiedDateTime') else None,
            is_directory='folder' in item,
            provider="sharepoint",
        )
    
    def list(
        self,
        path: str = "",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List files in SharePoint"""
        import fnmatch
        
        url = f"{self._graph_path(path)}:/children" if path else f"https://graph.microsoft.com/v1.0/drives/{self._drive_id}/root/children"
        
        if continuation_token:
            url = continuation_token
        
        response = self._session.get(url, params={'$top': max_items})
        response.raise_for_status()
        
        data = response.json()
        items = []
        
        for item in data.get('value', []):
            name = item.get('name', '')
            
            if pattern and not fnmatch.fnmatch(name, pattern):
                continue
            
            items.append(StorageMetadata(
                name=name,
                path=f"sharepoint://{self.site_url}/{path}/{name}".replace('//', '/'),
                size=item.get('size', 0),
                content_type=item.get('file', {}).get('mimeType'),
                modified=datetime.fromisoformat(item['lastModifiedDateTime'].replace('Z', '+00:00')) if item.get('lastModifiedDateTime') else None,
                is_directory='folder' in item,
                provider="sharepoint",
            ))
        
        next_link = data.get('@odata.nextLink')
        
        return ListResult(
            items=items,
            continuation_token=next_link,
            is_truncated=next_link is not None
        )
    
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy file in SharePoint"""
        dest_folder = '/'.join(destination.split('/')[:-1]) or '/'
        dest_name = destination.split('/')[-1]
        
        # Get destination folder ID
        folder_response = self._session.get(self._graph_path(dest_folder))
        folder_id = folder_response.json().get('id')
        
        copy_data = {
            'parentReference': {'driveId': self._drive_id, 'id': folder_id},
            'name': dest_name
        }
        
        response = self._session.post(
            f"{self._graph_path(source)}:/copy",
            json=copy_data
        )
        
        # Copy is async, wait for completion
        if response.status_code == 202:
            import time
            monitor_url = response.headers.get('Location')
            while monitor_url:
                time.sleep(1)
                status = self._session.get(monitor_url)
                if status.json().get('status') == 'completed':
                    break
        
        return self.get_metadata(destination)
    
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move file in SharePoint"""
        dest_folder = '/'.join(destination.split('/')[:-1]) or '/'
        dest_name = destination.split('/')[-1]
        
        folder_response = self._session.get(self._graph_path(dest_folder))
        folder_id = folder_response.json().get('id')
        
        move_data = {
            'parentReference': {'id': folder_id},
            'name': dest_name
        }
        
        response = self._session.patch(
            self._graph_path(source),
            json=move_data
        )
        response.raise_for_status()
        
        return self.get_metadata(destination)
    
    def create_directory(self, path: str) -> bool:
        """Create folder in SharePoint"""
        parts = path.strip('/').split('/')
        current = ''
        
        for part in parts:
            parent = current or 'root'
            current = f"{current}/{part}" if current else part
            
            try:
                folder_data = {
                    'name': part,
                    'folder': {},
                    '@microsoft.graph.conflictBehavior': 'fail'
                }
                
                if parent == 'root':
                    url = f"https://graph.microsoft.com/v1.0/drives/{self._drive_id}/root/children"
                else:
                    url = f"{self._graph_path(parent.lstrip('/'))}:/children"
                
                self._session.post(url, json=folder_data)
            except:
                pass  # Folder might exist
        
        return True


class OneDriveStorageBackend(StorageBackend):
    """
    Microsoft OneDrive storage backend.
    
    Uses Microsoft Graph API for:
    - Personal OneDrive
    - OneDrive for Business
    """
    
    def __init__(
        self,
        tenant_id: str = None,
        client_id: str = None,
        client_secret: str = None,
        user_email: str = None,
        config: Dict[str, Any] = None,
        **kwargs
    ):
        config = config or {}
        config.update({
            "user_email": user_email,
        })
        
        super().__init__(
            provider_type=StorageProvider.ONEDRIVE,
            config=config,
            **kwargs
        )
        
        self.tenant_id = tenant_id or os.environ.get('AZURE_TENANT_ID')
        self.client_id = client_id or os.environ.get('AZURE_CLIENT_ID')
        self.client_secret = client_secret or os.environ.get('AZURE_CLIENT_SECRET')
        self.user_email = user_email
        
        self._token = None
        self._drive_id = None
        self._session = None
    
    def connect(self) -> bool:
        """Connect to OneDrive via Graph API"""
        try:
            import requests
            
            # Get OAuth token
            token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
            token_data = {
                'grant_type': 'client_credentials',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'scope': 'https://graph.microsoft.com/.default'
            }
            
            response = requests.post(token_url, data=token_data)
            response.raise_for_status()
            self._token = response.json()['access_token']
            
            self._session = requests.Session()
            self._session.headers.update({
                'Authorization': f'Bearer {self._token}',
                'Content-Type': 'application/json'
            })
            
            # Get user's drive
            if self.user_email:
                drive_response = self._session.get(
                    f"https://graph.microsoft.com/v1.0/users/{self.user_email}/drive"
                )
            else:
                drive_response = self._session.get(
                    "https://graph.microsoft.com/v1.0/me/drive"
                )
            
            drive_response.raise_for_status()
            self._drive_id = drive_response.json()['id']
            
            self._connected = True
            self._audit("connect", f"onedrive://{self.user_email or 'me'}")
            return True
            
        except Exception as e:
            raise StorageConnectionError(str(e), "onedrive", "connect")
    
    def disconnect(self) -> None:
        """Disconnect from OneDrive"""
        if self._session:
            self._session.close()
        self._connected = False
    
    def _graph_path(self, path: str) -> str:
        """Build Graph API path"""
        path = path.strip('/')
        if path:
            return f"https://graph.microsoft.com/v1.0/drives/{self._drive_id}/root:/{path}"
        return f"https://graph.microsoft.com/v1.0/drives/{self._drive_id}/root"
    
    # Reuse SharePoint implementation - same Graph API
    @retry_with_backoff(max_retries=3)
    def read(self, path: str, encoding: Optional[str] = "utf-8", progress_callback: Optional[ProgressCallback] = None) -> Union[bytes, str]:
        response = self._session.get(f"{self._graph_path(path)}:/content")
        if response.status_code == 404:
            raise StorageNotFoundError(f"File not found: {path}", "onedrive", "read")
        response.raise_for_status()
        content = response.content
        if progress_callback:
            progress_callback(len(content), len(content))
        if encoding:
            return content.decode(encoding)
        return content
    
    @retry_with_backoff(max_retries=3)
    def write(self, path: str, content: Union[bytes, str, BinaryIO], content_type: Optional[str] = None, metadata: Optional[Dict[str, str]] = None, progress_callback: Optional[ProgressCallback] = None) -> StorageMetadata:
        if isinstance(content, str):
            content = content.encode('utf-8')
        if hasattr(content, 'read'):
            content = content.read()
        headers = {'Content-Type': content_type or 'application/octet-stream'}
        response = self._session.put(f"{self._graph_path(path)}:/content", data=content, headers=headers)
        response.raise_for_status()
        return self.get_metadata(path)
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        try:
            response = self._session.delete(self._graph_path(path))
            return response.status_code in [200, 204, 404]
        except:
            return False
    
    def exists(self, path: str) -> bool:
        try:
            response = self._session.get(self._graph_path(path))
            return response.status_code == 200
        except:
            return False
    
    def get_metadata(self, path: str) -> StorageMetadata:
        response = self._session.get(self._graph_path(path))
        if response.status_code == 404:
            raise StorageNotFoundError(f"Path not found: {path}", "onedrive", "get_metadata")
        response.raise_for_status()
        item = response.json()
        return StorageMetadata(
            name=item.get('name', path.split('/')[-1]),
            path=f"onedrive://{path}",
            size=item.get('size', 0),
            content_type=item.get('file', {}).get('mimeType'),
            etag=item.get('eTag'),
            created=datetime.fromisoformat(item['createdDateTime'].replace('Z', '+00:00')) if item.get('createdDateTime') else None,
            modified=datetime.fromisoformat(item['lastModifiedDateTime'].replace('Z', '+00:00')) if item.get('lastModifiedDateTime') else None,
            is_directory='folder' in item,
            provider="onedrive",
        )
    
    def list(self, path: str = "", pattern: Optional[str] = None, recursive: bool = False, max_items: int = 1000, continuation_token: Optional[str] = None) -> ListResult:
        import fnmatch
        url = f"{self._graph_path(path)}:/children" if path else f"https://graph.microsoft.com/v1.0/drives/{self._drive_id}/root/children"
        if continuation_token:
            url = continuation_token
        response = self._session.get(url, params={'$top': max_items})
        response.raise_for_status()
        data = response.json()
        items = []
        for item in data.get('value', []):
            name = item.get('name', '')
            if pattern and not fnmatch.fnmatch(name, pattern):
                continue
            items.append(StorageMetadata(
                name=name,
                path=f"onedrive://{path}/{name}".replace('//', '/'),
                size=item.get('size', 0),
                modified=datetime.fromisoformat(item['lastModifiedDateTime'].replace('Z', '+00:00')) if item.get('lastModifiedDateTime') else None,
                is_directory='folder' in item,
                provider="onedrive",
            ))
        next_link = data.get('@odata.nextLink')
        return ListResult(items=items, continuation_token=next_link, is_truncated=next_link is not None)
    
    def copy(self, source: str, destination: str, overwrite: bool = True, progress_callback: Optional[ProgressCallback] = None) -> StorageMetadata:
        content = self.read(source, encoding=None)
        return self.write(destination, content, progress_callback=progress_callback)
    
    def move(self, source: str, destination: str, overwrite: bool = True) -> StorageMetadata:
        dest_folder = '/'.join(destination.split('/')[:-1]) or '/'
        dest_name = destination.split('/')[-1]
        folder_response = self._session.get(self._graph_path(dest_folder))
        folder_id = folder_response.json().get('id')
        move_data = {'parentReference': {'id': folder_id}, 'name': dest_name}
        response = self._session.patch(self._graph_path(source), json=move_data)
        response.raise_for_status()
        return self.get_metadata(destination)
    
    def create_directory(self, path: str) -> bool:
        parts = path.strip('/').split('/')
        current = ''
        for part in parts:
            parent = current or 'root'
            current = f"{current}/{part}" if current else part
            try:
                folder_data = {'name': part, 'folder': {}, '@microsoft.graph.conflictBehavior': 'fail'}
                if parent == 'root':
                    url = f"https://graph.microsoft.com/v1.0/drives/{self._drive_id}/root/children"
                else:
                    url = f"{self._graph_path(parent.lstrip('/'))}:/children"
                self._session.post(url, json=folder_data)
            except:
                pass
        return True


class GoogleDriveStorageBackend(StorageBackend):
    """
    Google Drive storage backend.
    
    Uses Google Drive API v3 for:
    - Personal Drive
    - Shared Drives (Team Drives)
    - Service account access
    """
    
    def __init__(
        self,
        credentials_json: str = None,
        credentials_path: str = None,
        folder_id: str = None,  # Root folder ID (optional)
        shared_drive_id: str = None,  # For Team Drives
        config: Dict[str, Any] = None,
        **kwargs
    ):
        config = config or {}
        config.update({
            "folder_id": folder_id,
            "shared_drive_id": shared_drive_id,
        })
        
        super().__init__(
            provider_type=StorageProvider.GOOGLE_DRIVE,
            config=config,
            **kwargs
        )
        
        self.credentials_json = credentials_json
        self.credentials_path = credentials_path or os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
        self.folder_id = folder_id or 'root'
        self.shared_drive_id = shared_drive_id
        
        self._service = None
        self._path_cache: Dict[str, str] = {}  # path -> file_id
    
    def connect(self) -> bool:
        """Connect to Google Drive"""
        try:
            from googleapiclient.discovery import build
            from google.oauth2 import service_account
            
            SCOPES = ['https://www.googleapis.com/auth/drive']
            
            if self.credentials_json:
                import json
                creds_dict = json.loads(self.credentials_json) if isinstance(self.credentials_json, str) else self.credentials_json
                credentials = service_account.Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
            elif self.credentials_path:
                credentials = service_account.Credentials.from_service_account_file(self.credentials_path, scopes=SCOPES)
            else:
                raise StorageError("Google Drive requires credentials", "google_drive", "connect")
            
            self._service = build('drive', 'v3', credentials=credentials)
            
            # Verify access
            self._service.files().get(fileId=self.folder_id).execute()
            
            self._connected = True
            self._audit("connect", f"gdrive://{self.folder_id}")
            return True
            
        except ImportError:
            raise StorageError(
                "google-api-python-client required. Install with: pip install google-api-python-client google-auth",
                "google_drive", "connect"
            )
        except Exception as e:
            raise StorageConnectionError(str(e), "google_drive", "connect")
    
    def disconnect(self) -> None:
        """Disconnect from Google Drive"""
        self._service = None
        self._connected = False
    
    def _get_file_id(self, path: str) -> str:
        """Resolve path to file ID"""
        if not path or path == '/':
            return self.folder_id
        
        if path in self._path_cache:
            return self._path_cache[path]
        
        parts = path.strip('/').split('/')
        parent_id = self.folder_id
        
        for part in parts:
            query = f"name='{part}' and '{parent_id}' in parents and trashed=false"
            
            results = self._service.files().list(
                q=query,
                spaces='drive',
                fields='files(id, name)',
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()
            
            files = results.get('files', [])
            if not files:
                raise StorageNotFoundError(f"Path not found: {path}", "google_drive", "_get_file_id")
            
            parent_id = files[0]['id']
        
        self._path_cache[path] = parent_id
        return parent_id
    
    @retry_with_backoff(max_retries=3)
    def read(
        self,
        path: str,
        encoding: Optional[str] = "utf-8",
        progress_callback: Optional[ProgressCallback] = None
    ) -> Union[bytes, str]:
        """Read file from Google Drive"""
        from googleapiclient.http import MediaIoBaseDownload
        
        file_id = self._get_file_id(path)
        
        request = self._service.files().get_media(fileId=file_id)
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
            if progress_callback and status:
                progress_callback(
                    int(status.progress() * status.total_size),
                    status.total_size
                )
        
        content = buffer.getvalue()
        
        if encoding:
            return content.decode(encoding)
        return content
    
    @retry_with_backoff(max_retries=3)
    def write(
        self,
        path: str,
        content: Union[bytes, str, BinaryIO],
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Write file to Google Drive"""
        from googleapiclient.http import MediaIoBaseUpload
        
        if isinstance(content, str):
            content = content.encode('utf-8')
        
        if hasattr(content, 'read'):
            buffer = io.BytesIO(content.read())
        else:
            buffer = io.BytesIO(content)
        
        # Get parent folder
        parent_path = '/'.join(path.strip('/').split('/')[:-1])
        file_name = path.strip('/').split('/')[-1]
        
        parent_id = self._get_file_id(parent_path) if parent_path else self.folder_id
        
        file_metadata = {
            'name': file_name,
            'parents': [parent_id]
        }
        
        media = MediaIoBaseUpload(
            buffer,
            mimetype=content_type or 'application/octet-stream',
            resumable=True
        )
        
        # Check if file exists
        try:
            file_id = self._get_file_id(path)
            # Update existing file
            file = self._service.files().update(
                fileId=file_id,
                media_body=media,
                supportsAllDrives=True
            ).execute()
        except StorageNotFoundError:
            # Create new file
            file = self._service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, name, size, mimeType, createdTime, modifiedTime',
                supportsAllDrives=True
            ).execute()
        
        # Update cache
        self._path_cache[path] = file['id']
        
        return self.get_metadata(path)
    
    def delete(self, path: str, recursive: bool = False) -> bool:
        """Delete file/folder from Google Drive"""
        try:
            file_id = self._get_file_id(path)
            self._service.files().delete(fileId=file_id, supportsAllDrives=True).execute()
            
            # Clear from cache
            if path in self._path_cache:
                del self._path_cache[path]
            
            return True
        except:
            return False
    
    def exists(self, path: str) -> bool:
        """Check if file exists"""
        try:
            self._get_file_id(path)
            return True
        except StorageNotFoundError:
            return False
    
    def get_metadata(self, path: str) -> StorageMetadata:
        """Get file metadata"""
        file_id = self._get_file_id(path)
        
        file = self._service.files().get(
            fileId=file_id,
            fields='id, name, size, mimeType, createdTime, modifiedTime, md5Checksum',
            supportsAllDrives=True
        ).execute()
        
        return StorageMetadata(
            name=file.get('name', path.split('/')[-1]),
            path=f"gdrive://{path}",
            size=int(file.get('size', 0)),
            content_type=file.get('mimeType'),
            created=datetime.fromisoformat(file['createdTime'].replace('Z', '+00:00')) if file.get('createdTime') else None,
            modified=datetime.fromisoformat(file['modifiedTime'].replace('Z', '+00:00')) if file.get('modifiedTime') else None,
            checksum_md5=file.get('md5Checksum'),
            is_directory=file.get('mimeType') == 'application/vnd.google-apps.folder',
            provider="google_drive",
        )
    
    def list(
        self,
        path: str = "",
        pattern: Optional[str] = None,
        recursive: bool = False,
        max_items: int = 1000,
        continuation_token: Optional[str] = None
    ) -> ListResult:
        """List files in Google Drive"""
        import fnmatch
        
        folder_id = self._get_file_id(path) if path else self.folder_id
        
        query = f"'{folder_id}' in parents and trashed=false"
        
        kwargs = {
            'q': query,
            'spaces': 'drive',
            'fields': 'nextPageToken, files(id, name, size, mimeType, createdTime, modifiedTime)',
            'pageSize': min(max_items, 100),
            'supportsAllDrives': True,
            'includeItemsFromAllDrives': True
        }
        
        if continuation_token:
            kwargs['pageToken'] = continuation_token
        
        results = self._service.files().list(**kwargs).execute()
        
        items = []
        for file in results.get('files', []):
            name = file.get('name', '')
            
            if pattern and not fnmatch.fnmatch(name, pattern):
                continue
            
            is_folder = file.get('mimeType') == 'application/vnd.google-apps.folder'
            
            items.append(StorageMetadata(
                name=name,
                path=f"gdrive://{path}/{name}".replace('//', '/'),
                size=int(file.get('size', 0)),
                content_type=file.get('mimeType'),
                modified=datetime.fromisoformat(file['modifiedTime'].replace('Z', '+00:00')) if file.get('modifiedTime') else None,
                is_directory=is_folder,
                provider="google_drive",
            ))
            
            # Cache the ID
            self._path_cache[f"{path}/{name}".strip('/')] = file['id']
        
        next_token = results.get('nextPageToken')
        
        return ListResult(
            items=items,
            continuation_token=next_token,
            is_truncated=next_token is not None
        )
    
    def copy(
        self,
        source: str,
        destination: str,
        overwrite: bool = True,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Copy file in Google Drive"""
        source_id = self._get_file_id(source)
        
        dest_path = '/'.join(destination.strip('/').split('/')[:-1])
        dest_name = destination.strip('/').split('/')[-1]
        dest_parent_id = self._get_file_id(dest_path) if dest_path else self.folder_id
        
        copy_metadata = {
            'name': dest_name,
            'parents': [dest_parent_id]
        }
        
        file = self._service.files().copy(
            fileId=source_id,
            body=copy_metadata,
            supportsAllDrives=True
        ).execute()
        
        self._path_cache[destination] = file['id']
        
        return self.get_metadata(destination)
    
    def move(
        self,
        source: str,
        destination: str,
        overwrite: bool = True
    ) -> StorageMetadata:
        """Move file in Google Drive"""
        source_id = self._get_file_id(source)
        
        # Get current parent
        file = self._service.files().get(
            fileId=source_id,
            fields='parents',
            supportsAllDrives=True
        ).execute()
        
        previous_parents = ",".join(file.get('parents', []))
        
        dest_path = '/'.join(destination.strip('/').split('/')[:-1])
        dest_name = destination.strip('/').split('/')[-1]
        dest_parent_id = self._get_file_id(dest_path) if dest_path else self.folder_id
        
        # Move file
        self._service.files().update(
            fileId=source_id,
            addParents=dest_parent_id,
            removeParents=previous_parents,
            body={'name': dest_name},
            fields='id, parents',
            supportsAllDrives=True
        ).execute()
        
        # Update cache
        if source in self._path_cache:
            del self._path_cache[source]
        self._path_cache[destination] = source_id
        
        return self.get_metadata(destination)
    
    def create_directory(self, path: str) -> bool:
        """Create folder in Google Drive"""
        parts = path.strip('/').split('/')
        current_path = ''
        
        for part in parts:
            parent_id = self._get_file_id(current_path) if current_path else self.folder_id
            current_path = f"{current_path}/{part}" if current_path else part
            
            try:
                # Check if folder exists
                self._get_file_id(current_path)
            except StorageNotFoundError:
                # Create folder
                folder_metadata = {
                    'name': part,
                    'mimeType': 'application/vnd.google-apps.folder',
                    'parents': [parent_id]
                }
                
                folder = self._service.files().create(
                    body=folder_metadata,
                    fields='id',
                    supportsAllDrives=True
                ).execute()
                
                self._path_cache[current_path] = folder['id']
        
        return True


# =============================================================================
# STORAGE PROVIDER FACTORY
# =============================================================================

class StorageFactory:
    """
    Factory for creating storage backends.
    
    Usage:
        storage = StorageFactory.create("s3", bucket="my-bucket", region="us-east-1")
        storage = StorageFactory.create("local", local_path="/data")
        storage = StorageFactory.create("azure_blob", container="mycontainer")
    """
    
    _backends = {
        StorageProvider.LOCAL: LocalStorageBackend,
        StorageProvider.S3: S3StorageBackend,
        StorageProvider.MINIO: S3StorageBackend,  # S3-compatible
        StorageProvider.AZURE_BLOB: AzureBlobStorageBackend,
        StorageProvider.GCS: GoogleCloudStorageBackend,
        StorageProvider.SFTP: SFTPStorageBackend,
        StorageProvider.FTP: FTPStorageBackend,
        StorageProvider.WEBDAV: WebDAVStorageBackend,
        StorageProvider.SHAREPOINT: SharePointStorageBackend,
        StorageProvider.ONEDRIVE: OneDriveStorageBackend,
        StorageProvider.GOOGLE_DRIVE: GoogleDriveStorageBackend,
    }
    
    @classmethod
    def register(cls, provider: StorageProvider, backend_class: type):
        """Register a custom storage backend"""
        cls._backends[provider] = backend_class
    
    @classmethod
    def create(
        cls,
        provider: Union[str, StorageProvider],
        **kwargs
    ) -> StorageBackend:
        """Create a storage backend instance"""
        if isinstance(provider, str):
            provider = StorageProvider(provider)
        
        backend_class = cls._backends.get(provider)
        if not backend_class:
            raise StorageError(f"Unknown storage provider: {provider}")
        
        return backend_class(**kwargs)
    
    @classmethod
    def from_config(cls, config: Dict[str, Any]) -> StorageBackend:
        """Create backend from configuration dictionary"""
        provider = config.pop('provider', 'local')
        return cls.create(provider, **config)


# =============================================================================
# CROSS-PROVIDER OPERATIONS
# =============================================================================

class CrossProviderTransfer:
    """
    Utility for transferring files between different storage providers.
    
    Enterprise features:
    - Parallel transfers
    - Checksum verification
    - Resume interrupted transfers
    - Progress tracking
    """
    
    def __init__(
        self,
        source: StorageBackend,
        destination: StorageBackend,
        workers: int = 4,
        verify_checksum: bool = True
    ):
        self.source = source
        self.destination = destination
        self.workers = workers
        self.verify_checksum = verify_checksum
    
    def transfer_file(
        self,
        source_path: str,
        dest_path: str,
        progress_callback: Optional[ProgressCallback] = None
    ) -> StorageMetadata:
        """Transfer single file between providers"""
        # Read from source
        content = self.source.read(source_path, encoding=None)
        
        # Compute checksum before transfer
        if self.verify_checksum:
            source_hash = hashlib.sha256(content).hexdigest()
        
        # Get metadata from source
        source_meta = self.source.get_metadata(source_path)
        
        # Write to destination
        result = self.destination.write(
            dest_path,
            content,
            content_type=source_meta.content_type,
            metadata=source_meta.custom_metadata,
            progress_callback=progress_callback
        )
        
        # Verify checksum after transfer
        if self.verify_checksum:
            dest_content = self.destination.read(dest_path, encoding=None)
            dest_hash = hashlib.sha256(dest_content).hexdigest()
            
            if source_hash != dest_hash:
                raise StorageIntegrityError(
                    f"Checksum mismatch: {source_path} -> {dest_path}",
                    "cross_provider", "transfer"
                )
        
        return result
    
    def sync_directory(
        self,
        source_path: str,
        dest_path: str,
        delete_extra: bool = False,
        progress_callback: Optional[Callable[[str, int, int], None]] = None
    ) -> Dict[str, Any]:
        """
        Sync directory between providers.
        
        Returns statistics about the sync operation.
        """
        stats = {
            "transferred": 0,
            "skipped": 0,
            "deleted": 0,
            "errors": []
        }
        
        # List source files
        source_files = self.source.list(source_path, recursive=True)
        
        # Get existing destination files
        try:
            dest_files = {
                m.name: m for m in 
                self.destination.list(dest_path, recursive=True).items
            }
        except:
            dest_files = {}
        
        # Transfer files in parallel
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = {}
            
            for item in source_files.items:
                if item.is_directory:
                    continue
                
                relative_path = item.name
                dest_item_path = f"{dest_path}/{relative_path}"
                
                # Check if file needs transfer (by size/modified time)
                dest_item = dest_files.get(relative_path)
                if dest_item and dest_item.size == item.size:
                    stats["skipped"] += 1
                    continue
                
                future = executor.submit(
                    self.transfer_file,
                    item.path.split('://')[-1].split('/', 1)[-1],  # Remove provider prefix
                    dest_item_path
                )
                futures[future] = relative_path
            
            for future in as_completed(futures):
                path = futures[future]
                try:
                    future.result()
                    stats["transferred"] += 1
                    if progress_callback:
                        progress_callback(
                            path,
                            stats["transferred"],
                            len(source_files.items)
                        )
                except Exception as e:
                    stats["errors"].append({"path": path, "error": str(e)})
        
        # Delete extra files if requested
        if delete_extra:
            source_names = {item.name for item in source_files.items}
            for name, item in dest_files.items():
                if name not in source_names:
                    try:
                        dest_path_full = f"{dest_path}/{name}"
                        self.destination.delete(dest_path_full)
                        stats["deleted"] += 1
                    except Exception as e:
                        stats["errors"].append({"path": name, "error": str(e)})
        
        return stats


# =============================================================================
# ROBOT FRAMEWORK LIBRARY
# =============================================================================

@library(scope='GLOBAL', auto_keywords=True)
class SkuldStorage:
    """
    Robot Framework library for multi-provider storage operations.
    
    Example:
        | Configure Storage Provider | local | local_path=/data |
        | ${content}= | Read File | /path/to/file.txt |
        | Write File | /path/to/output.txt | ${content} |
        
        | Configure Storage Provider | s3 | bucket=my-bucket | region=us-east-1 |
        | ${files}= | List Files | prefix/path/ |
    """
    
    ROBOT_LIBRARY_SCOPE = 'GLOBAL'
    
    def __init__(self):
        self._providers: Dict[str, StorageBackend] = {}
        self._current_provider: Optional[str] = None
    
    @keyword("Configure Storage Provider")
    def configure_provider(
        self,
        provider: str,
        name: str = "default",
        **kwargs
    ) -> None:
        """
        Configure a storage provider.
        
        Args:
            provider: Provider type (local, s3, azure_blob, sftp, etc.)
            name: Unique name for this provider instance
            **kwargs: Provider-specific configuration
        """
        backend = StorageFactory.create(provider, **kwargs)
        backend.connect()
        
        self._providers[name] = backend
        self._current_provider = name
        
        robot_logger.info(f"Configured storage provider '{name}' ({provider})")
    
    @keyword("Use Storage Provider")
    def use_provider(self, name: str) -> None:
        """Switch to a different configured provider"""
        if name not in self._providers:
            raise StorageError(f"Provider not configured: {name}")
        self._current_provider = name
    
    @keyword("Close Storage Provider")
    def close_provider(self, name: str = None) -> None:
        """Close and remove a provider"""
        name = name or self._current_provider
        if name in self._providers:
            self._providers[name].disconnect()
            del self._providers[name]
            if self._current_provider == name:
                self._current_provider = None
    
    def _get_provider(self) -> StorageBackend:
        """Get current storage provider"""
        if not self._current_provider:
            raise StorageError("No storage provider configured")
        return self._providers[self._current_provider]
    
    @keyword("Storage Read File")
    def storage_read_file(
        self,
        path: str,
        encoding: str = "utf-8",
        provider: str = None
    ) -> Union[bytes, str]:
        """Read file from storage provider"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        content = backend.read(path, encoding=encoding if encoding != "binary" else None)
        robot_logger.info(f"Read {len(content)} bytes from {path}")
        return content
    
    @keyword("Storage Write File")
    def storage_write_file(
        self,
        path: str,
        content: Union[bytes, str],
        content_type: str = None,
        provider: str = None
    ) -> Dict[str, Any]:
        """Write file to storage provider"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        result = backend.write(path, content, content_type=content_type)
        robot_logger.info(f"Wrote {result.size} bytes to {path}")
        return result.to_dict()
    
    @keyword("Storage Delete File")
    def storage_delete_file(
        self,
        path: str,
        recursive: bool = False,
        provider: str = None
    ) -> bool:
        """Delete file from storage provider"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        result = backend.delete(path, recursive=recursive)
        robot_logger.info(f"Deleted {path}: {result}")
        return result
    
    @keyword("Storage File Exists")
    def storage_file_exists(
        self,
        path: str,
        provider: str = None
    ) -> bool:
        """Check if file exists in storage provider"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        return backend.exists(path)
    
    @keyword("Storage List Files")
    def storage_list_files(
        self,
        path: str = "",
        pattern: str = None,
        recursive: bool = False,
        provider: str = None
    ) -> List[Dict[str, Any]]:
        """List files in storage provider"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        result = backend.list(path, pattern=pattern, recursive=recursive)
        robot_logger.info(f"Listed {len(result.items)} files in {path}")
        return [item.to_dict() for item in result.items]
    
    @keyword("Storage Copy File")
    def storage_copy_file(
        self,
        source: str,
        destination: str,
        provider: str = None
    ) -> Dict[str, Any]:
        """Copy file within storage provider"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        result = backend.copy(source, destination)
        robot_logger.info(f"Copied {source} to {destination}")
        return result.to_dict()
    
    @keyword("Storage Move File")
    def storage_move_file(
        self,
        source: str,
        destination: str,
        provider: str = None
    ) -> Dict[str, Any]:
        """Move file within storage provider"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        result = backend.move(source, destination)
        robot_logger.info(f"Moved {source} to {destination}")
        return result.to_dict()
    
    @keyword("Storage Create Directory")
    def storage_create_directory(
        self,
        path: str,
        provider: str = None
    ) -> bool:
        """Create directory in storage provider"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        result = backend.create_directory(path)
        robot_logger.info(f"Created directory {path}")
        return result
    
    @keyword("Storage Get File Info")
    def storage_get_file_info(
        self,
        path: str,
        provider: str = None
    ) -> Dict[str, Any]:
        """Get file metadata from storage provider"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        result = backend.get_metadata(path)
        return result.to_dict()
    
    @keyword("Transfer Between Providers")
    def transfer_between_providers(
        self,
        source_provider: str,
        source_path: str,
        dest_provider: str,
        dest_path: str,
        verify_checksum: bool = True
    ) -> Dict[str, Any]:
        """Transfer file between different storage providers"""
        source = self._providers.get(source_provider)
        dest = self._providers.get(dest_provider)
        
        if not source or not dest:
            raise StorageError("Both providers must be configured")
        
        transfer = CrossProviderTransfer(source, dest, verify_checksum=verify_checksum)
        result = transfer.transfer_file(source_path, dest_path)
        
        robot_logger.info(f"Transferred {source_path} ({source_provider}) -> {dest_path} ({dest_provider})")
        return result.to_dict()
    
    @keyword("Sync Directories Between Providers")
    def sync_directories(
        self,
        source_provider: str,
        source_path: str,
        dest_provider: str,
        dest_path: str,
        delete_extra: bool = False
    ) -> Dict[str, Any]:
        """Sync directories between different storage providers"""
        source = self._providers.get(source_provider)
        dest = self._providers.get(dest_provider)
        
        if not source or not dest:
            raise StorageError("Both providers must be configured")
        
        transfer = CrossProviderTransfer(source, dest)
        stats = transfer.sync_directory(source_path, dest_path, delete_extra=delete_extra)
        
        robot_logger.info(
            f"Sync complete: {stats['transferred']} transferred, "
            f"{stats['skipped']} skipped, {stats['deleted']} deleted"
        )
        return stats
    
    @keyword("Generate Presigned URL")
    def generate_presigned_url(
        self,
        path: str,
        expiration: int = 3600,
        provider: str = None
    ) -> str:
        """Generate presigned URL for temporary access (S3 only)"""
        backend = self._providers.get(provider) if provider else self._get_provider()
        
        if not isinstance(backend, S3StorageBackend):
            raise StorageError("Presigned URLs only supported for S3")
        
        return backend.generate_presigned_url(path, expiration)
    
    @keyword("Create Zip Archive")
    def create_zip_archive(
        self,
        source_path: str,
        destination_path: str,
        compression: str = "default",
        provider: str = None
    ) -> Dict[str, Any]:
        """
        Create a ZIP archive from files in storage provider.
        
        Args:
            source_path: Path to file or directory to compress
            destination_path: Path for the output ZIP file
            compression: Compression level (store, default, best)
            provider: Storage provider name
        
        Returns:
            Dictionary with path, size, and files_count
            
        Example:
            | ${result}= | Create Zip Archive | /data/files | /backups/archive.zip |
            | ${result}= | Create Zip Archive | /reports | /archives/reports.zip | compression=best |
        """
        import zipfile
        import tempfile
        import os
        
        backend = self._providers.get(provider) if provider else self._get_provider()
        if not backend:
            raise StorageError("No storage provider configured")
        
        # Map compression levels
        compression_map = {
            "store": zipfile.ZIP_STORED,
            "default": zipfile.ZIP_DEFLATED,
            "best": zipfile.ZIP_DEFLATED,  # Best uses max compression level
        }
        zip_compression = compression_map.get(compression, zipfile.ZIP_DEFLATED)
        compress_level = 9 if compression == "best" else 6
        
        # Create temp directory for working
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_zip_path = os.path.join(temp_dir, "archive.zip")
            files_count = 0
            
            # Check if source is a directory or file
            try:
                files = backend.list_files(source_path)
                is_directory = True
            except:
                is_directory = False
            
            with zipfile.ZipFile(temp_zip_path, 'w', zip_compression, compresslevel=compress_level) as zf:
                if is_directory:
                    # Compress directory contents
                    for file_info in files:
                        file_path = file_info.get('path', file_info.get('name', ''))
                        if file_path:
                            # Download file content
                            content = backend.read(file_path)
                            # Add to zip with relative path
                            arcname = os.path.relpath(file_path, source_path)
                            zf.writestr(arcname, content)
                            files_count += 1
                else:
                    # Single file
                    content = backend.read(source_path)
                    arcname = os.path.basename(source_path)
                    zf.writestr(arcname, content)
                    files_count = 1
            
            # Get zip size
            zip_size = os.path.getsize(temp_zip_path)
            
            # Upload zip to destination
            with open(temp_zip_path, 'rb') as f:
                zip_content = f.read()
            
            backend.write(destination_path, zip_content)
            
            robot_logger.info(f"Created ZIP archive: {destination_path} ({files_count} files, {zip_size} bytes)")
            
            return {
                "path": destination_path,
                "size": zip_size,
                "files_count": files_count,
                "compression": compression,
            }
    
    @keyword("Extract Zip Archive")
    def extract_zip_archive(
        self,
        source_path: str,
        destination_path: str,
        provider: str = None
    ) -> Dict[str, Any]:
        """
        Extract a ZIP archive to storage provider.
        
        Args:
            source_path: Path to the ZIP file
            destination_path: Directory to extract files to
            provider: Storage provider name
        
        Returns:
            Dictionary with path, files list, and files_count
            
        Example:
            | ${result}= | Extract Zip Archive | /archives/data.zip | /extracted/ |
        """
        import zipfile
        import tempfile
        import os
        
        backend = self._providers.get(provider) if provider else self._get_provider()
        if not backend:
            raise StorageError("No storage provider configured")
        
        # Download zip to temp
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_zip_path = os.path.join(temp_dir, "archive.zip")
            
            # Download zip file
            zip_content = backend.read(source_path)
            with open(temp_zip_path, 'wb') as f:
                f.write(zip_content if isinstance(zip_content, bytes) else zip_content.encode())
            
            # Extract and upload each file
            extracted_files = []
            with zipfile.ZipFile(temp_zip_path, 'r') as zf:
                for name in zf.namelist():
                    # Skip directories
                    if name.endswith('/'):
                        continue
                    
                    # Extract file content
                    content = zf.read(name)
                    
                    # Upload to destination
                    dest_file_path = os.path.join(destination_path, name).replace('\\', '/')
                    backend.write(dest_file_path, content)
                    extracted_files.append(dest_file_path)
            
            robot_logger.info(f"Extracted {len(extracted_files)} files to {destination_path}")
            
            return {
                "path": destination_path,
                "files": extracted_files,
                "files_count": len(extracted_files),
            }
    
    @keyword("Watch For File Changes")
    def watch_for_file_changes(
        self,
        path: str,
        pattern: str = "*.*",
        timeout: int = 60,
        provider: str = None
    ) -> Dict[str, Any]:
        """
        Watch a folder for file changes (local filesystem only).
        
        Args:
            path: Directory path to watch
            pattern: File pattern to watch (e.g., "*.csv", "*.*")
            timeout: Maximum time to wait for changes (seconds)
            provider: Storage provider name (must be 'local')
        
        Returns:
            Dictionary with changed_file, event, and timestamp
            
        Example:
            | ${result}= | Watch For File Changes | /data/inbox | pattern=*.csv | timeout=30 |
            | Log | File ${result.changed_file} was ${result.event} |
        """
        import glob
        import os
        import time as time_module
        from datetime import datetime
        
        backend = self._providers.get(provider) if provider else self._get_provider()
        if not backend:
            raise StorageError("No storage provider configured")
        
        # Verify it's a local provider
        if not isinstance(backend, LocalStorageBackend):
            raise StorageError("File watching only works with local storage provider")
        
        # Resolve path through the provider
        watch_path = backend._resolve_path(path)
        search_pattern = os.path.join(str(watch_path), pattern)
        
        # Get initial state
        initial_state = {}
        for f in glob.glob(search_pattern):
            try:
                initial_state[f] = os.path.getmtime(f)
            except:
                pass
        
        start_time = time_module.time()
        changed_file = None
        event = "none"
        
        while time_module.time() - start_time < timeout:
            time_module.sleep(0.5)  # Poll every 500ms
            
            current_state = {}
            for f in glob.glob(search_pattern):
                try:
                    current_state[f] = os.path.getmtime(f)
                except:
                    pass
            
            # Check for new files
            for f, mtime in current_state.items():
                if f not in initial_state:
                    changed_file = f
                    event = "created"
                    break
                elif mtime > initial_state[f]:
                    changed_file = f
                    event = "modified"
                    break
            
            # Check for deleted files
            if not changed_file:
                for f in initial_state:
                    if f not in current_state:
                        changed_file = f
                        event = "deleted"
                        break
            
            if changed_file:
                break
            
            initial_state = current_state
        
        result = {
            "changed_file": changed_file or "",
            "event": event,
            "timestamp": datetime.now().isoformat(),
            "timeout_reached": changed_file is None,
        }
        
        if changed_file:
            robot_logger.info(f"File change detected: {event} - {changed_file}")
        else:
            robot_logger.info(f"No file changes detected within {timeout}s timeout")
        
        return result


    # =========================================================================
    # FILE RESOLUTION — Bridge between storage providers and local-only nodes
    # =========================================================================

    @keyword("Storage Resolve To Local")
    def resolve_to_local(
        self,
        remote_path: str,
        mode: str = "read",
        provider: str = None,
    ) -> str:
        """
        Resolve a storage path to a local temporary file.

        For local provider: returns the full local path directly (no copy).
        For cloud providers: downloads the file to a temp directory first.

        Use this before calling nodes that only accept local paths
        (Excel, PDF, OCR, etc.).

        Args:
            remote_path: Path relative to the storage provider root
            mode: "read" (download if cloud), "write" (prepare temp path only)
            provider: Storage provider name (uses current if not specified)

        Returns:
            Absolute local file path ready for use

        Example:
            | ${local}= | Storage Resolve To Local | reports/q1.xlsx | mode=read |
            | Open Workbook | ${local} |
            | # ... work with the workbook locally ... |
            | Storage Sync Back | ${local} | reports/q1.xlsx |
        """
        backend = self._providers.get(provider) if provider else self._get_provider()

        # Local provider: resolve directly, no temp files needed
        if hasattr(backend, 'root_path'):
            full_path = os.path.join(backend.root_path, remote_path)
            robot_logger.info(f"Resolved to local path: {full_path}")
            return full_path

        # Cloud provider: use temp directory
        temp_dir = os.path.join(tempfile.gettempdir(), "skuld_storage", str(uuid.uuid4()))
        os.makedirs(temp_dir, exist_ok=True)
        local_path = os.path.join(temp_dir, os.path.basename(remote_path))

        if mode == "read":
            content = backend.read(remote_path)
            if isinstance(content, str):
                content = content.encode("utf-8")
            with open(local_path, "wb") as f:
                f.write(content)
            robot_logger.info(
                f"Downloaded {remote_path} to {local_path} ({len(content)} bytes)"
            )
        else:
            robot_logger.info(f"Prepared local write path: {local_path}")

        return local_path

    @keyword("Storage Sync Back")
    def sync_back(
        self,
        local_path: str,
        remote_path: str,
        content_type: str = None,
        provider: str = None,
        cleanup: bool = True,
    ) -> Dict[str, Any]:
        """
        Upload a local file back to the storage provider.

        For local provider: no-op if the file is already in place.
        For cloud providers: uploads and optionally cleans up the temp file.

        Args:
            local_path: Absolute local file path
            remote_path: Destination path in the storage provider
            content_type: MIME type (auto-detected if not specified)
            provider: Storage provider name (uses current if not specified)
            cleanup: Remove the local temp file after upload (default: True)

        Returns:
            Dictionary with path, size, and provider info

        Example:
            | Storage Sync Back | /tmp/skuld_storage/.../q1.xlsx | reports/q1.xlsx |
        """
        backend = self._providers.get(provider) if provider else self._get_provider()

        # Local provider: if the file is already at the right place, nothing to do
        if hasattr(backend, 'root_path'):
            expected = os.path.join(backend.root_path, remote_path)
            if os.path.abspath(local_path) == os.path.abspath(expected):
                size = os.path.getsize(local_path)
                robot_logger.info(f"Local provider, file already in place: {expected}")
                return {"path": remote_path, "size": size, "provider": "local", "synced": False}

            # Local provider but file is in a temp location — copy it
            os.makedirs(os.path.dirname(expected), exist_ok=True)
            shutil.copy2(local_path, expected)
            size = os.path.getsize(expected)
            robot_logger.info(f"Copied {local_path} to {expected}")

            if cleanup and local_path.startswith(tempfile.gettempdir()):
                self._cleanup_temp(local_path)

            return {"path": remote_path, "size": size, "provider": "local", "synced": True}

        # Cloud provider: upload
        with open(local_path, "rb") as f:
            content = f.read()

        if not content_type:
            import mimetypes
            content_type = mimetypes.guess_type(local_path)[0] or "application/octet-stream"

        backend.write(remote_path, content, content_type=content_type)
        size = len(content)
        provider_name = getattr(backend, 'provider_type', 'cloud')

        robot_logger.info(
            f"Uploaded {local_path} to {remote_path} ({size} bytes, {provider_name})"
        )

        if cleanup and local_path.startswith(tempfile.gettempdir()):
            self._cleanup_temp(local_path)

        return {"path": remote_path, "size": size, "provider": str(provider_name), "synced": True}

    @keyword("Storage Has Provider")
    def has_provider(self, name: str = None) -> bool:
        """
        Check if a storage provider is configured.

        Args:
            name: Provider name (checks current provider if not specified)

        Returns:
            True if provider is configured and connected

        Example:
            | ${has}= | Storage Has Provider |
            | Run Keyword If | not ${has} | Log | No storage provider, using local | WARN |
        """
        if name:
            return name in self._providers
        return self._current_provider is not None and self._current_provider in self._providers

    def _cleanup_temp(self, local_path: str) -> None:
        """Remove temp file and its parent directory if empty."""
        try:
            os.remove(local_path)
            parent = os.path.dirname(local_path)
            if parent.startswith(os.path.join(tempfile.gettempdir(), "skuld_storage")):
                if not os.listdir(parent):
                    os.rmdir(parent)
        except OSError:
            pass
