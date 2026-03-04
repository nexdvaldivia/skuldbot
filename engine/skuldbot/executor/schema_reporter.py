"""
Schema Reporter Module

Discovers and reports output schemas from bot executions to the Orchestrator,
which then syncs them to the Control Plane for product improvement.
"""

import json
import os
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

logger = logging.getLogger(__name__)


@dataclass
class SchemaField:
    """Represents a field in a discovered schema"""
    name: str
    type: str  # 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
    items: Optional[List['SchemaField']] = None
    fields: Optional[List['SchemaField']] = None
    
    def to_dict(self) -> Dict:
        result = {'name': self.name, 'type': self.type}
        if self.items:
            result['items'] = [f.to_dict() for f in self.items]
        if self.fields:
            result['fields'] = [f.to_dict() for f in self.fields]
        return result


@dataclass
class DiscoveredSchema:
    """Represents a discovered schema for a node type"""
    node_type: str
    fields: List[SchemaField]
    sample_count: int = 1
    discovered_at: str = None
    
    def __post_init__(self):
        if self.discovered_at is None:
            self.discovered_at = datetime.utcnow().isoformat()
    
    def to_dict(self) -> Dict:
        return {
            'nodeType': self.node_type,
            'fields': [f.to_dict() for f in self.fields],
            'sampleCount': self.sample_count,
            'discoveredAt': self.discovered_at,
        }


class SchemaReporter:
    """
    Reports discovered schemas to the Orchestrator.
    
    Usage:
        reporter = SchemaReporter(orchestrator_url="http://localhost:3001")
        
        # After node execution
        reporter.report_output(node_type="ms365.email_list", output={...})
        
        # At end of bot execution
        reporter.flush()
    """
    
    def __init__(
        self,
        orchestrator_url: Optional[str] = None,
        enabled: bool = True,
        max_depth: int = 4,
    ):
        self.orchestrator_url = orchestrator_url or os.getenv('ORCHESTRATOR_URL')
        self.enabled = enabled and HAS_REQUESTS and bool(self.orchestrator_url)
        self.max_depth = max_depth
        self.pending_schemas: Dict[str, DiscoveredSchema] = {}
        
        if not HAS_REQUESTS:
            logger.debug("requests library not available - schema reporting disabled")
        elif not self.orchestrator_url:
            logger.debug("No ORCHESTRATOR_URL configured - schema reporting disabled")
    
    def report_output(self, node_type: str, output: Any) -> None:
        """
        Report a node's output for schema discovery.
        
        Args:
            node_type: The type of node (e.g., 'ms365.email_list')
            output: The output data from the node execution
        """
        if not self.enabled or output is None:
            return
        
        try:
            fields = self._infer_schema(output, depth=0)
            if not fields:
                return
            
            if node_type in self.pending_schemas:
                # Merge with existing schema
                existing = self.pending_schemas[node_type]
                existing.fields = self._merge_fields(existing.fields, fields)
                existing.sample_count += 1
            else:
                self.pending_schemas[node_type] = DiscoveredSchema(
                    node_type=node_type,
                    fields=fields,
                )
            
            logger.debug(f"Discovered schema for {node_type}: {len(fields)} fields")
            
        except Exception as e:
            logger.warning(f"Failed to discover schema for {node_type}: {e}")
    
    def flush(self) -> bool:
        """
        Send all pending schemas to the Orchestrator.
        
        Returns:
            True if successful, False otherwise
        """
        if not self.enabled or not self.pending_schemas:
            return True
        
        try:
            url = f"{self.orchestrator_url}/api/schemas/discovered"
            payload = {
                'schemas': [s.to_dict() for s in self.pending_schemas.values()],
            }
            
            response = requests.post(
                url,
                json=payload,
                timeout=10,
                headers={'Content-Type': 'application/json'},
            )
            
            if response.ok:
                logger.info(f"Reported {len(self.pending_schemas)} schemas to Orchestrator")
                self.pending_schemas.clear()
                return True
            else:
                logger.warning(f"Failed to report schemas: {response.status_code}")
                return False
                
        except Exception as e:
            logger.warning(f"Failed to report schemas to Orchestrator: {e}")
            return False
    
    def _infer_schema(self, data: Any, depth: int = 0) -> List[SchemaField]:
        """Infer schema fields from data"""
        if depth > self.max_depth:
            return []
        
        if data is None:
            return []
        
        if isinstance(data, list):
            if not data:
                return []
            
            # Sample first few items to infer common schema
            sample_size = min(len(data), 5)
            item_schemas: Dict[str, SchemaField] = {}
            
            for i in range(sample_size):
                item = data[i]
                if isinstance(item, dict):
                    item_fields = self._infer_schema(item, depth + 1)
                    for field in item_fields:
                        if field.name not in item_schemas:
                            item_schemas[field.name] = field
            
            return list(item_schemas.values())
        
        if isinstance(data, dict):
            fields = []
            for key, value in data.items():
                field_type = self._get_type(value)
                field = SchemaField(name=key, type=field_type)
                
                if depth < self.max_depth:
                    if isinstance(value, list) and value:
                        field.items = self._infer_schema(value, depth + 1)
                    elif isinstance(value, dict):
                        field.fields = self._infer_schema(value, depth + 1)
                
                fields.append(field)
            
            return fields
        
        return []
    
    def _get_type(self, value: Any) -> str:
        """Get the type string for a value"""
        if value is None:
            return 'null'
        if isinstance(value, bool):
            return 'boolean'
        if isinstance(value, (int, float)):
            return 'number'
        if isinstance(value, str):
            return 'string'
        if isinstance(value, list):
            return 'array'
        if isinstance(value, dict):
            return 'object'
        return 'string'
    
    def _merge_fields(
        self,
        existing: List[SchemaField],
        incoming: List[SchemaField],
    ) -> List[SchemaField]:
        """Merge two lists of schema fields"""
        merged = {f.name: f for f in existing}
        
        for field in incoming:
            if field.name in merged:
                existing_field = merged[field.name]
                # Merge nested fields
                if existing_field.items and field.items:
                    existing_field.items = self._merge_fields(
                        existing_field.items, field.items
                    )
                if existing_field.fields and field.fields:
                    existing_field.fields = self._merge_fields(
                        existing_field.fields, field.fields
                    )
                # Add nested if not present
                if not existing_field.items and field.items:
                    existing_field.items = field.items
                if not existing_field.fields and field.fields:
                    existing_field.fields = field.fields
            else:
                merged[field.name] = field
        
        return list(merged.values())


# Global instance for easy access
_reporter: Optional[SchemaReporter] = None


def get_schema_reporter() -> SchemaReporter:
    """Get the global schema reporter instance"""
    global _reporter
    if _reporter is None:
        _reporter = SchemaReporter()
    return _reporter


def report_node_output(node_type: str, output: Any) -> None:
    """Convenience function to report a node's output"""
    get_schema_reporter().report_output(node_type, output)


def flush_schemas() -> bool:
    """Convenience function to flush pending schemas"""
    return get_schema_reporter().flush()



