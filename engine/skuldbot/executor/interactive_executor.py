"""
Interactive Executor for Debug Mode with Breakpoints

This executor allows step-by-step execution of bots with breakpoint support.
It maintains state between steps and communicates via JSON commands.
"""

import json
import sys
import time
from enum import Enum
from pathlib import Path
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field, asdict
from datetime import datetime


class DebugState(Enum):
    """Debug execution state"""
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    COMPLETED = "completed"
    ERROR = "error"


class NodeStatus(Enum):
    """Status of a node during execution"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"
    SKIPPED = "skipped"


@dataclass
class NodeExecution:
    """Information about a node's execution"""
    node_id: str
    node_type: str
    label: str
    status: NodeStatus
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    variables: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DebugSession:
    """State of a debug session"""
    session_id: str
    state: DebugState
    current_node_id: Optional[str]
    breakpoints: Set[str]
    execution_order: List[str]  # Order of nodes to execute
    node_executions: Dict[str, NodeExecution]
    global_variables: Dict[str, Any]
    start_time: float
    paused_at_breakpoint: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict"""
        return {
            "sessionId": self.session_id,
            "state": self.state.value,
            "currentNodeId": self.current_node_id,
            "breakpoints": list(self.breakpoints),
            "executionOrder": self.execution_order,
            "nodeExecutions": {
                k: {
                    "nodeId": v.node_id,
                    "nodeType": v.node_type,
                    "label": v.label,
                    "status": v.status.value,
                    "startTime": v.start_time,
                    "endTime": v.end_time,
                    "output": v.output,
                    "error": v.error,
                    "variables": v.variables,
                }
                for k, v in self.node_executions.items()
            },
            "globalVariables": self.global_variables,
            "startTime": self.start_time,
            "pausedAtBreakpoint": self.paused_at_breakpoint,
        }


class InteractiveExecutor:
    """
    Executor that runs bots step by step with breakpoint support.

    Communication is done via stdin/stdout JSON messages:

    Commands (stdin):
    - {"command": "start", "dsl": {...}, "breakpoints": ["node-1", "node-2"]}
    - {"command": "step"}  # Execute one node
    - {"command": "continue"}  # Continue until next breakpoint or end
    - {"command": "stop"}  # Stop execution
    - {"command": "set_breakpoint", "nodeId": "node-1"}
    - {"command": "remove_breakpoint", "nodeId": "node-1"}
    - {"command": "get_variables", "nodeId": "node-1"}  # Get node's variables

    Responses (stdout):
    - {"type": "state", "session": {...}}
    - {"type": "node_started", "nodeId": "...", "nodeType": "..."}
    - {"type": "node_completed", "nodeId": "...", "status": "success|error", ...}
    - {"type": "paused", "nodeId": "...", "reason": "breakpoint|step"}
    - {"type": "completed", "success": true|false}
    - {"type": "error", "message": "..."}
    """

    def __init__(self):
        self.session: Optional[DebugSession] = None
        self.dsl: Optional[Dict[str, Any]] = None
        self.compiled_path: Optional[Path] = None
        self._node_map: Dict[str, Dict[str, Any]] = {}  # node_id -> node definition
        self._step_mode: bool = False  # If true, pause after each node

    def _emit(self, message: Dict[str, Any]):
        """Emit a JSON message to stdout"""
        print(json.dumps(message), flush=True)

    def _emit_state(self):
        """Emit current session state"""
        if self.session:
            self._emit({"type": "state", "session": self.session.to_dict()})

    def _emit_error(self, message: str):
        """Emit an error message"""
        self._emit({"type": "error", "message": message})

    def _build_execution_order(self) -> List[str]:
        """Build the order of nodes to execute based on flow connections"""
        if not self.dsl:
            return []

        nodes = self.dsl.get("nodes", [])
        start_node = self.dsl.get("start_node")

        # Build node map
        self._node_map = {node["id"]: node for node in nodes}

        # If no start_node specified, use first trigger or first node
        if not start_node:
            for node in nodes:
                if node.get("type", "").startswith("trigger."):
                    start_node = node["id"]
                    break
            if not start_node and nodes:
                start_node = nodes[0]["id"]

        if not start_node:
            return []

        # BFS to build execution order following success paths
        order = []
        visited = set()
        queue = [start_node]

        while queue:
            node_id = queue.pop(0)
            if node_id in visited or node_id not in self._node_map:
                continue

            visited.add(node_id)
            order.append(node_id)

            node = self._node_map[node_id]
            outputs = node.get("outputs", {})

            # Follow success path for normal execution order
            success_next = outputs.get("success")
            if success_next and success_next not in visited:
                queue.append(success_next)

        return order

    def _execute_node(self, node_id: str) -> bool:
        """
        Execute a single node and update session state.

        Returns True if execution should continue, False if paused/stopped.
        """
        if not self.session or node_id not in self._node_map:
            return False

        node = self._node_map[node_id]
        node_type = node.get("type", "unknown")
        label = node.get("label", node_id)
        config = node.get("config", {})

        # Create/update node execution
        node_exec = NodeExecution(
            node_id=node_id,
            node_type=node_type,
            label=label,
            status=NodeStatus.RUNNING,
            start_time=time.time(),
        )
        self.session.node_executions[node_id] = node_exec
        self.session.current_node_id = node_id

        # Emit node started
        self._emit({
            "type": "node_started",
            "nodeId": node_id,
            "nodeType": node_type,
            "label": label,
        })

        # Simulate node execution based on type
        # In a real implementation, this would call the actual node handlers
        try:
            output, error = self._simulate_node_execution(node_type, config)

            if error:
                node_exec.status = NodeStatus.ERROR
                node_exec.error = error
            else:
                node_exec.status = NodeStatus.SUCCESS
                node_exec.output = output

            node_exec.end_time = time.time()

            # Update variables for this node
            node_exec.variables = {
                "output": output,
                "status": node_exec.status.value,
                "error": error,
            }

            # Update global variables
            self.session.global_variables[f"NODE_{node_id}"] = node_exec.variables

            # Emit node completed
            self._emit({
                "type": "node_completed",
                "nodeId": node_id,
                "nodeType": node_type,
                "label": label,
                "status": node_exec.status.value,
                "output": output,
                "error": error,
                "duration": node_exec.end_time - node_exec.start_time,
            })

            return node_exec.status == NodeStatus.SUCCESS

        except Exception as e:
            node_exec.status = NodeStatus.ERROR
            node_exec.error = str(e)
            node_exec.end_time = time.time()

            self._emit({
                "type": "node_completed",
                "nodeId": node_id,
                "nodeType": node_type,
                "label": label,
                "status": "error",
                "error": str(e),
            })

            return False

    def _simulate_node_execution(
        self,
        node_type: str,
        config: Dict[str, Any]
    ) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
        """
        Simulate node execution for debug mode.

        In production, this would actually execute the node using Robot Framework
        or the native Python implementation.

        Returns (output, error) tuple.
        """
        # Add a small delay to simulate execution
        time.sleep(0.1)

        # Simulate based on node type
        category, action = node_type.split(".", 1) if "." in node_type else (node_type, "")

        if category == "trigger":
            return {"triggered": True, "timestamp": time.time()}, None

        elif category == "logging":
            message = config.get("message", "Log message")
            level = config.get("level", "INFO")
            return {"logged": True, "message": message, "level": level}, None

        elif category == "control":
            if action == "if_else":
                condition = config.get("condition", "true")
                result = condition.lower() in ("true", "1", "yes")
                return {"condition": condition, "result": result}, None
            elif action == "for_each":
                return {"iteration": 0, "total": 0}, None
            elif action == "delay":
                delay_ms = config.get("delay_ms", 1000)
                # Don't actually wait the full delay in debug mode
                time.sleep(min(delay_ms / 1000, 0.5))
                return {"delayed_ms": delay_ms}, None

        elif category == "variables":
            if action == "set":
                name = config.get("name", "var")
                value = config.get("value", "")
                return {"name": name, "value": value}, None

        elif category == "browser":
            url = config.get("url", "")
            return {"url": url, "loaded": True}, None

        elif category == "excel":
            file_path = config.get("file_path", "")
            return {"file": file_path, "rows_read": 0}, None

        elif category == "http":
            url = config.get("url", "")
            return {"url": url, "status": 200, "body": {}}, None

        elif category == "notification":
            return {"sent": True}, None

        # Default: simulate success
        return {"executed": True, "type": node_type}, None

    def start(self, dsl: Dict[str, Any], breakpoints: List[str] = None):
        """Start a new debug session"""
        import uuid

        self.dsl = dsl
        execution_order = self._build_execution_order()

        self.session = DebugSession(
            session_id=str(uuid.uuid4()),
            state=DebugState.PAUSED,  # Start paused
            current_node_id=execution_order[0] if execution_order else None,
            breakpoints=set(breakpoints or []),
            execution_order=execution_order,
            node_executions={},
            global_variables={},
            start_time=time.time(),
        )

        # Initialize all nodes as pending
        for node_id in execution_order:
            node = self._node_map.get(node_id, {})
            self.session.node_executions[node_id] = NodeExecution(
                node_id=node_id,
                node_type=node.get("type", "unknown"),
                label=node.get("label", node_id),
                status=NodeStatus.PENDING,
            )

        self._emit({
            "type": "started",
            "sessionId": self.session.session_id,
            "totalNodes": len(execution_order),
        })
        self._emit_state()

    def step(self):
        """Execute the next node and pause"""
        if not self.session:
            self._emit_error("No active session")
            return

        if self.session.state == DebugState.COMPLETED:
            self._emit_error("Execution already completed")
            return

        self._step_mode = True
        self.session.state = DebugState.RUNNING

        # Find next node to execute
        current_idx = -1
        if self.session.current_node_id:
            try:
                current_idx = self.session.execution_order.index(self.session.current_node_id)
            except ValueError:
                pass

        # Check if current node needs execution or if we move to next
        current_node = self.session.node_executions.get(self.session.current_node_id)
        if current_node and current_node.status == NodeStatus.PENDING:
            # Execute current node
            success = self._execute_node(self.session.current_node_id)

            # After execution, pause
            self.session.state = DebugState.PAUSED

            # If success, move to next node
            if success and current_idx + 1 < len(self.session.execution_order):
                self.session.current_node_id = self.session.execution_order[current_idx + 1]
            elif not success:
                # On error, follow error path if available
                node = self._node_map.get(current_node.node_id, {})
                error_next = node.get("outputs", {}).get("error")
                if error_next and error_next in self._node_map:
                    self.session.current_node_id = error_next

            self._emit({
                "type": "paused",
                "nodeId": self.session.current_node_id,
                "reason": "step",
            })
        elif current_idx + 1 < len(self.session.execution_order):
            # Move to next and execute
            self.session.current_node_id = self.session.execution_order[current_idx + 1]
            success = self._execute_node(self.session.current_node_id)

            self.session.state = DebugState.PAUSED

            # Prepare next node
            if success and current_idx + 2 < len(self.session.execution_order):
                self.session.current_node_id = self.session.execution_order[current_idx + 2]

            self._emit({
                "type": "paused",
                "nodeId": self.session.current_node_id,
                "reason": "step",
            })
        else:
            # No more nodes
            self.session.state = DebugState.COMPLETED
            self._emit({
                "type": "completed",
                "success": True,
                "duration": time.time() - self.session.start_time,
            })

        self._emit_state()

    def continue_execution(self):
        """Continue execution until next breakpoint or completion"""
        if not self.session:
            self._emit_error("No active session")
            return

        if self.session.state == DebugState.COMPLETED:
            self._emit_error("Execution already completed")
            return

        self._step_mode = False
        self.session.state = DebugState.RUNNING
        self.session.paused_at_breakpoint = False

        # Find starting point
        current_idx = 0
        if self.session.current_node_id:
            try:
                current_idx = self.session.execution_order.index(self.session.current_node_id)
            except ValueError:
                pass

        # Execute nodes until breakpoint or end
        while current_idx < len(self.session.execution_order):
            node_id = self.session.execution_order[current_idx]
            node_exec = self.session.node_executions.get(node_id)

            # Skip already executed nodes
            if node_exec and node_exec.status not in (NodeStatus.PENDING,):
                current_idx += 1
                continue

            # Check for breakpoint (except for first node if we just started)
            if node_id in self.session.breakpoints and current_idx > 0:
                self.session.state = DebugState.PAUSED
                self.session.current_node_id = node_id
                self.session.paused_at_breakpoint = True
                self._emit({
                    "type": "paused",
                    "nodeId": node_id,
                    "reason": "breakpoint",
                })
                self._emit_state()
                return

            # Execute node
            self.session.current_node_id = node_id
            success = self._execute_node(node_id)

            if not success:
                # On error, try to follow error path
                node = self._node_map.get(node_id, {})
                error_next = node.get("outputs", {}).get("error")

                if error_next and error_next in self._node_map:
                    # Add error node to execution if not already there
                    if error_next not in self.session.execution_order:
                        self.session.execution_order.insert(current_idx + 1, error_next)
                        self.session.node_executions[error_next] = NodeExecution(
                            node_id=error_next,
                            node_type=self._node_map[error_next].get("type", "unknown"),
                            label=self._node_map[error_next].get("label", error_next),
                            status=NodeStatus.PENDING,
                        )
                else:
                    # No error handler, stop execution
                    self.session.state = DebugState.ERROR
                    self._emit({
                        "type": "error",
                        "nodeId": node_id,
                        "message": f"Node {node_id} failed with no error handler",
                    })
                    self._emit_state()
                    return

            current_idx += 1

        # All nodes executed
        self.session.state = DebugState.COMPLETED
        self._emit({
            "type": "completed",
            "success": True,
            "duration": time.time() - self.session.start_time,
        })
        self._emit_state()

    def stop(self):
        """Stop the current execution"""
        if self.session:
            self.session.state = DebugState.STOPPED
            self._emit({
                "type": "stopped",
                "sessionId": self.session.session_id,
            })
            self._emit_state()

    def set_breakpoint(self, node_id: str):
        """Add a breakpoint"""
        if self.session:
            self.session.breakpoints.add(node_id)
            self._emit({
                "type": "breakpoint_set",
                "nodeId": node_id,
            })

    def remove_breakpoint(self, node_id: str):
        """Remove a breakpoint"""
        if self.session:
            self.session.breakpoints.discard(node_id)
            self._emit({
                "type": "breakpoint_removed",
                "nodeId": node_id,
            })

    def get_variables(self, node_id: Optional[str] = None) -> Dict[str, Any]:
        """Get variables for a node or global variables"""
        if not self.session:
            return {}

        if node_id:
            node_exec = self.session.node_executions.get(node_id)
            if node_exec:
                return node_exec.variables
            return {}

        return self.session.global_variables

    def run_interactive(self):
        """Run in interactive mode, reading commands from stdin"""
        self._emit({"type": "ready", "message": "Interactive executor ready"})

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                cmd = json.loads(line)
                command = cmd.get("command")

                if command == "start":
                    dsl = cmd.get("dsl", {})
                    breakpoints = cmd.get("breakpoints", [])
                    self.start(dsl, breakpoints)

                elif command == "step":
                    self.step()

                elif command == "continue":
                    self.continue_execution()

                elif command == "stop":
                    self.stop()

                elif command == "set_breakpoint":
                    node_id = cmd.get("nodeId")
                    if node_id:
                        self.set_breakpoint(node_id)

                elif command == "remove_breakpoint":
                    node_id = cmd.get("nodeId")
                    if node_id:
                        self.remove_breakpoint(node_id)

                elif command == "get_variables":
                    node_id = cmd.get("nodeId")
                    variables = self.get_variables(node_id)
                    self._emit({
                        "type": "variables",
                        "nodeId": node_id,
                        "variables": variables,
                    })

                elif command == "get_state":
                    self._emit_state()

                elif command == "exit":
                    self._emit({"type": "exit", "message": "Goodbye"})
                    break

                else:
                    self._emit_error(f"Unknown command: {command}")

            except json.JSONDecodeError as e:
                self._emit_error(f"Invalid JSON: {e}")
            except Exception as e:
                self._emit_error(f"Error: {e}")


def main():
    """Main entry point for interactive executor"""
    executor = InteractiveExecutor()
    executor.run_interactive()


if __name__ == "__main__":
    main()
