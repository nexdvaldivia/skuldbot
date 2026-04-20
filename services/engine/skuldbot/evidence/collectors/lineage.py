"""
Data Lineage Collector

Tracks data flow through the bot WITHOUT storing actual values.
Only records references, classifications, and transformations.

This is critical for compliance - we need to prove:
1. Where data came from
2. How it was classified
3. What transformations were applied
4. Where it went
5. What controls were applied

But we NEVER store the actual PII/PHI values.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
import uuid


@dataclass
class LineageNode:
    """Represents a node in the data lineage graph"""
    node_id: str
    node_type: str
    fields: Dict[str, str] = field(default_factory=dict)  # field_name -> classification


@dataclass
class LineageEdge:
    """Represents data flow between nodes"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    source_node_id: str = ""
    source_field: str = ""

    dest_node_id: str = ""
    dest_field: str = ""

    classification: str = "UNCLASSIFIED"
    transformations: List[str] = field(default_factory=list)
    policy_rule: Optional[str] = None
    controls: List[str] = field(default_factory=list)


class LineageCollector:
    """
    Collects data lineage information during bot execution.

    Tracks:
    - Data flow between nodes (source -> destination)
    - Classifications at each step
    - Transformations applied (redact, mask, encrypt)
    - Policy rules that were triggered
    - Controls that were applied

    NEVER stores actual data values.
    """

    def __init__(self):
        self._nodes: Dict[str, LineageNode] = {}
        self._edges: List[LineageEdge] = []
        self._classifications_seen: Set[str] = set()

    def register_node(self, node_id: str, node_type: str) -> LineageNode:
        """
        Register a node in the lineage graph.

        Args:
            node_id: Unique node identifier
            node_type: Node type (e.g., "excel.read_range")

        Returns:
            LineageNode
        """
        if node_id not in self._nodes:
            self._nodes[node_id] = LineageNode(
                node_id=node_id,
                node_type=node_type,
            )
        return self._nodes[node_id]

    def record_field_classification(
        self,
        node_id: str,
        field_name: str,
        classification: str,
    ):
        """
        Record that a field has a specific classification.

        Args:
            node_id: Node containing the field
            field_name: Name of the field
            classification: Classification (PII, PHI, PCI, etc.)
        """
        if node_id in self._nodes:
            self._nodes[node_id].fields[field_name] = classification
            self._classifications_seen.add(classification)

    def record_data_flow(
        self,
        source_node_id: str,
        source_field: str,
        dest_node_id: str,
        dest_field: str,
        classification: str = "UNCLASSIFIED",
        transformations: Optional[List[str]] = None,
        policy_rule: Optional[str] = None,
        controls: Optional[List[str]] = None,
    ) -> LineageEdge:
        """
        Record data flowing from one node to another.

        IMPORTANT: Only records the REFERENCE (node_id, field_name),
        never the actual data value.

        Args:
            source_node_id: Source node ID
            source_field: Source field name
            dest_node_id: Destination node ID
            dest_field: Destination field name
            classification: Data classification
            transformations: Transformations applied during flow
            policy_rule: Policy rule that was triggered
            controls: Controls that were applied

        Returns:
            LineageEdge
        """
        edge = LineageEdge(
            source_node_id=source_node_id,
            source_field=source_field,
            dest_node_id=dest_node_id,
            dest_field=dest_field,
            classification=classification,
            transformations=transformations or [],
            policy_rule=policy_rule,
            controls=controls or [],
        )

        self._edges.append(edge)
        self._classifications_seen.add(classification)

        return edge

    def record_transformation(
        self,
        node_id: str,
        field_name: str,
        transformation: str,
        from_classification: str,
        to_classification: str,
    ):
        """
        Record that a transformation was applied to data.

        Example: PHI was redacted, so classification changed
        from PHI to UNCLASSIFIED.

        Args:
            node_id: Node where transformation occurred
            field_name: Field that was transformed
            transformation: Type of transformation (redact, mask, hash, etc.)
            from_classification: Original classification
            to_classification: New classification after transformation
        """
        edge = LineageEdge(
            source_node_id=node_id,
            source_field=field_name,
            dest_node_id=node_id,
            dest_field=field_name,
            classification=to_classification,
            transformations=[transformation],
        )
        self._edges.append(edge)

    def get_lineage_for_node(self, node_id: str) -> Dict[str, Any]:
        """
        Get all lineage information for a specific node.

        Args:
            node_id: Node to get lineage for

        Returns:
            Dictionary with incoming and outgoing edges
        """
        incoming = [e for e in self._edges if e.dest_node_id == node_id]
        outgoing = [e for e in self._edges if e.source_node_id == node_id]

        return {
            "nodeId": node_id,
            "nodeType": self._nodes.get(node_id, LineageNode(node_id, "unknown")).node_type,
            "fields": self._nodes.get(node_id, LineageNode(node_id, "unknown")).fields,
            "incoming": [self._edge_to_dict(e) for e in incoming],
            "outgoing": [self._edge_to_dict(e) for e in outgoing],
        }

    def get_all_lineage(self) -> List[Dict[str, Any]]:
        """
        Get all lineage edges.

        Returns:
            List of lineage entries
        """
        return [self._edge_to_dict(e) for e in self._edges]

    def get_classifications_detected(self) -> List[str]:
        """Get all classifications that were detected"""
        return list(self._classifications_seen)

    def get_sensitive_data_paths(self) -> List[Dict[str, Any]]:
        """
        Get paths where sensitive data (PII, PHI, PCI) flowed.

        Returns:
            List of sensitive data flow paths
        """
        sensitive = ["PII", "PHI", "PCI", "CREDENTIALS"]
        return [
            self._edge_to_dict(e)
            for e in self._edges
            if e.classification in sensitive
        ]

    def _edge_to_dict(self, edge: LineageEdge) -> Dict[str, Any]:
        """Convert edge to dictionary"""
        return {
            "id": edge.id,
            "timestamp": edge.timestamp,
            "source": {
                "nodeId": edge.source_node_id,
                "field": edge.source_field,
            },
            "destination": {
                "nodeId": edge.dest_node_id,
                "field": edge.dest_field,
            },
            "classification": edge.classification,
            "transformations": edge.transformations,
            "policyRule": edge.policy_rule,
            "controls": edge.controls,
        }

    def to_graph(self) -> Dict[str, Any]:
        """
        Export lineage as a graph structure.

        Returns:
            Graph with nodes and edges
        """
        return {
            "nodes": [
                {
                    "id": n.node_id,
                    "type": n.node_type,
                    "fields": n.fields,
                }
                for n in self._nodes.values()
            ],
            "edges": [self._edge_to_dict(e) for e in self._edges],
            "classificationsDetected": list(self._classifications_seen),
        }
