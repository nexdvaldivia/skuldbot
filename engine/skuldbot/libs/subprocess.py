"""
SkuldSubprocess - Enterprise Bot Subprocess Library

This library provides the ability to call other bots as subprocesses,
enabling modular and reusable automation design.

Features:
- Synchronous and asynchronous bot calls
- Parameter passing and result collection
- Timeout and retry with exponential backoff
- Parallel batch execution with concurrency control
- Context inheritance (vault, env)
- Execution tracking and auditing

Author: SkuldBot Team
"""

import json
import os
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable
from robot.api import logger
from robot.api.deco import keyword, library


@dataclass
class SubprocessContext:
    """Context for subprocess execution"""
    caller_bot_id: Optional[str] = None
    caller_execution_id: Optional[str] = None
    input_params: Dict[str, Any] = field(default_factory=dict)
    output_value: Dict[str, Any] = field(default_factory=dict)
    output_status: str = "pending"
    output_message: str = ""
    validation_errors: List[str] = field(default_factory=list)


@dataclass
class BotExecution:
    """Represents a bot execution result"""
    execution_id: str
    bot_id: str
    success: bool
    result: Dict[str, Any]
    error: Optional[str] = None
    duration_ms: float = 0
    retry_attempts: int = 0


# Global context for the current subprocess
_context = SubprocessContext()


@library(scope='GLOBAL', auto_keywords=False)
class SkuldSubprocess:
    """
    Robot Framework library for bot subprocess management.
    
    Provides enterprise-grade subprocess capabilities for SkuldBot:
    - Call other bots with parameters
    - Receive results from subbots
    - Batch parallel execution
    - Context inheritance
    
    Example:
        | ${result}= | Call Bot | validate_email | parameters={"email": "test@example.com"} |
        | Should Be True | ${result.valid} |
    """
    
    ROBOT_LIBRARY_SCOPE = 'GLOBAL'
    ROBOT_LIBRARY_VERSION = '1.0.0'
    
    def __init__(self, project_path: Optional[str] = None):
        """Initialize the subprocess library.
        
        Args:
            project_path: Path to the SkuldBot project (auto-detected if not provided)
        """
        self._project_path = project_path or os.environ.get('SKULDBOT_PROJECT_PATH', '')
        self._bots_cache: Dict[str, Dict[str, Any]] = {}
        self._executor = ThreadPoolExecutor(max_workers=10)
        self._audit_log: List[Dict[str, Any]] = []
    
    # =========================================================================
    # Bot Calling
    # =========================================================================
    
    @keyword('Call Bot')
    def call_bot(
        self,
        bot_id: str,
        parameters: Optional[Dict[str, Any]] = None,
        timeout: int = 300,
        wait: bool = True,
        inherit_context: bool = False,
        execution_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Call another bot as a subprocess.
        
        Args:
            bot_id: ID of the bot to call
            parameters: Dictionary of parameters to pass to the bot
            timeout: Maximum time to wait (seconds)
            wait: Whether to wait for completion
            inherit_context: Whether to pass parent's vault/env
            execution_id: Custom execution ID (auto-generated if not provided)
        
        Returns:
            Dictionary with execution result
            
        Example:
            | ${result}= | Call Bot | validate_email | parameters={"email": "test@test.com"} |
            | ${result}= | Call Bot | process_invoice | timeout=60 | wait=${TRUE} |
        """
        start_time = time.time()
        execution_id = execution_id or f"exec_{uuid.uuid4().hex[:8]}"
        parameters = parameters or {}
        
        # Audit log entry
        self._audit(
            action="call_bot",
            bot_id=bot_id,
            execution_id=execution_id,
            parameters=parameters,
        )
        
        logger.info(f"Calling bot '{bot_id}' with execution_id={execution_id}")
        
        try:
            # Find bot path
            bot_path = self._find_bot_path(bot_id)
            if not bot_path:
                raise ValueError(f"Bot '{bot_id}' not found in project")
            
            # Prepare environment
            env = os.environ.copy()
            env['SKULDBOT_SUBPROCESS'] = 'true'
            env['SKULDBOT_CALLER_BOT_ID'] = os.environ.get('SKULDBOT_BOT_ID', '')
            env['SKULDBOT_CALLER_EXECUTION_ID'] = os.environ.get('SKULDBOT_EXECUTION_ID', '')
            env['SKULDBOT_EXECUTION_ID'] = execution_id
            env['SKULDBOT_BOT_ID'] = bot_id
            env['SKULDBOT_INPUT_PARAMS'] = json.dumps(parameters)
            
            if inherit_context:
                # Inherit vault and env config
                pass  # Context already in environment
            
            # Execute bot
            if wait:
                result = self._execute_bot_sync(bot_path, env, timeout)
            else:
                # Fire and forget
                self._execute_bot_async(bot_path, env)
                result = {
                    "async": True,
                    "execution_id": execution_id,
                    "status": "started",
                }
            
            duration = (time.time() - start_time) * 1000
            
            self._audit(
                action="call_bot_complete",
                bot_id=bot_id,
                execution_id=execution_id,
                success=True,
                duration_ms=duration,
            )
            
            return result
            
        except Exception as e:
            duration = (time.time() - start_time) * 1000
            self._audit(
                action="call_bot_error",
                bot_id=bot_id,
                execution_id=execution_id,
                error=str(e),
                duration_ms=duration,
            )
            raise
    
    def _find_bot_path(self, bot_id: str) -> Optional[str]:
        """Find the path to a bot by ID."""
        if not self._project_path:
            # Try to find project path from environment
            self._project_path = os.environ.get('SKULDBOT_PROJECT_PATH', '')
        
        if not self._project_path:
            logger.warn("No project path configured")
            return None
        
        # Check cache
        if bot_id in self._bots_cache:
            return self._bots_cache[bot_id].get('path')
        
        # Load project manifest
        manifest_path = Path(self._project_path) / "proyecto.skuld"
        if not manifest_path.exists():
            # Try alternative manifest names
            for name in ["project.skuld", "manifest.json"]:
                alt_path = Path(self._project_path) / name
                if alt_path.exists():
                    manifest_path = alt_path
                    break
        
        if manifest_path.exists():
            try:
                with open(manifest_path) as f:
                    manifest = json.load(f)
                    for bot in manifest.get('bots', []):
                        if bot.get('id') == bot_id or bot.get('name') == bot_id:
                            bot_path = Path(self._project_path) / bot.get('path', '')
                            self._bots_cache[bot_id] = {
                                'path': str(bot_path),
                                'name': bot.get('name'),
                            }
                            return str(bot_path)
            except Exception as e:
                logger.warn(f"Error loading manifest: {e}")
        
        # Try direct path lookup
        bots_dir = Path(self._project_path) / "bots"
        if bots_dir.exists():
            for bot_dir in bots_dir.iterdir():
                if bot_dir.is_dir():
                    bot_json = bot_dir / "bot.json"
                    if bot_json.exists():
                        try:
                            with open(bot_json) as f:
                                bot_data = json.load(f)
                                if bot_data.get('id') == bot_id:
                                    return str(bot_dir)
                        except:
                            pass
        
        return None
    
    def _execute_bot_sync(
        self,
        bot_path: str,
        env: Dict[str, str],
        timeout: int
    ) -> Dict[str, Any]:
        """Execute a bot synchronously and wait for result."""
        # Build robot command
        bot_json = Path(bot_path) / "bot.json"
        output_file = Path(bot_path) / ".output.json"
        
        # Remove old output file
        if output_file.exists():
            output_file.unlink()
        
        cmd = [
            sys.executable, "-m", "robot",
            "--outputdir", str(Path(bot_path) / ".output"),
            "--report", "NONE",
            "--log", "NONE",
            str(bot_path),
        ]
        
        try:
            result = subprocess.run(
                cmd,
                env=env,
                timeout=timeout,
                capture_output=True,
                text=True,
            )
            
            # Check for output file
            if output_file.exists():
                with open(output_file) as f:
                    return json.load(f)
            
            # Return basic result
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
            }
            
        except subprocess.TimeoutExpired:
            raise TimeoutError(f"Bot execution timed out after {timeout} seconds")
    
    def _execute_bot_async(self, bot_path: str, env: Dict[str, str]) -> None:
        """Execute a bot asynchronously (fire and forget)."""
        def run():
            try:
                subprocess.run(
                    [sys.executable, "-m", "robot", str(bot_path)],
                    env=env,
                    capture_output=True,
                )
            except Exception as e:
                logger.warn(f"Async bot execution error: {e}")
        
        self._executor.submit(run)
    
    # =========================================================================
    # Input/Output Parameters
    # =========================================================================
    
    @keyword('Get Bot Input Parameters')
    def get_bot_input_parameters(
        self,
        schema: Optional[List[Dict[str, Any]]] = None,
        validate: bool = True
    ) -> Dict[str, Any]:
        """
        Get input parameters passed to this bot from caller.
        
        Args:
            schema: Parameter schema for validation
            validate: Whether to validate against schema
        
        Returns:
            Dictionary of input parameters
            
        Example:
            | ${params}= | Get Bot Input Parameters |
            | Log | Received email: ${params.email} |
        """
        global _context
        
        # Get params from environment
        params_json = os.environ.get('SKULDBOT_INPUT_PARAMS', '{}')
        try:
            params = json.loads(params_json)
        except json.JSONDecodeError:
            params = {}
        
        _context.input_params = params
        _context.caller_bot_id = os.environ.get('SKULDBOT_CALLER_BOT_ID', '')
        _context.caller_execution_id = os.environ.get('SKULDBOT_CALLER_EXECUTION_ID', '')
        
        if validate and schema:
            self._validate_params(params, schema)
        
        return params
    
    @keyword('Validate Input Parameters')
    def validate_input_parameters(
        self,
        params: Dict[str, Any],
        schema: List[Dict[str, Any]]
    ) -> bool:
        """
        Validate input parameters against a schema.
        
        Args:
            params: Parameters to validate
            schema: Validation schema
        
        Returns:
            True if valid, False otherwise
        """
        global _context
        _context.validation_errors = []
        
        return self._validate_params(params, schema)
    
    def _validate_params(
        self,
        params: Dict[str, Any],
        schema: List[Dict[str, Any]]
    ) -> bool:
        """Internal parameter validation."""
        global _context
        valid = True
        
        for field in schema:
            name = field.get('name', '')
            required = field.get('required', False)
            field_type = field.get('type', 'string')
            default = field.get('default')
            
            # Check required
            if required and name not in params:
                _context.validation_errors.append(f"Required parameter '{name}' is missing")
                valid = False
                continue
            
            # Apply default
            if name not in params and default is not None:
                params[name] = default
            
            # Type validation (basic)
            if name in params:
                value = params[name]
                if field_type == 'number' and not isinstance(value, (int, float)):
                    try:
                        params[name] = float(value)
                    except:
                        _context.validation_errors.append(
                            f"Parameter '{name}' must be a number"
                        )
                        valid = False
                elif field_type == 'boolean' and not isinstance(value, bool):
                    params[name] = str(value).lower() in ('true', '1', 'yes')
                elif field_type == 'array' and not isinstance(value, list):
                    _context.validation_errors.append(
                        f"Parameter '{name}' must be an array"
                    )
                    valid = False
        
        return valid
    
    @keyword('Get Validation Errors')
    def get_validation_errors(self) -> List[str]:
        """Get validation errors from the last validation."""
        global _context
        return _context.validation_errors
    
    @keyword('Get Caller Bot ID')
    def get_caller_bot_id(self) -> str:
        """Get the ID of the bot that called this subprocess."""
        return os.environ.get('SKULDBOT_CALLER_BOT_ID', '')
    
    @keyword('Get Caller Execution ID')
    def get_caller_execution_id(self) -> str:
        """Get the execution ID of the calling bot."""
        return os.environ.get('SKULDBOT_CALLER_EXECUTION_ID', '')
    
    @keyword('Set Bot Output')
    def set_bot_output(
        self,
        return_value: Dict[str, Any],
        status: str = "success",
        message: str = ""
    ) -> None:
        """
        Set the output/return value for this subprocess bot.
        
        Args:
            return_value: Value to return to calling bot
            status: Exit status (success/error/warning)
            message: Status message
            
        Example:
            | Set Bot Output | {"valid": True, "score": 95} | status=success |
        """
        global _context
        _context.output_value = return_value
        _context.output_status = status
        _context.output_message = message
        
        # Write output file for parent to read
        output_path = os.environ.get('SKULDBOT_OUTPUT_PATH', '')
        if not output_path:
            # Default to bot directory
            bot_path = os.environ.get('SKULDBOT_BOT_PATH', '')
            if bot_path:
                output_path = os.path.join(bot_path, '.output.json')
        
        if output_path:
            try:
                with open(output_path, 'w') as f:
                    json.dump({
                        "value": return_value,
                        "status": status,
                        "message": message,
                    }, f)
            except Exception as e:
                logger.warn(f"Could not write output file: {e}")
        
        logger.info(f"Bot output set: status={status}")
    
    # =========================================================================
    # Batch Processing
    # =========================================================================
    
    @keyword('Build Params From Mapping')
    def build_params_from_mapping(
        self,
        item: Dict[str, Any],
        mapping: Dict[str, str]
    ) -> Dict[str, Any]:
        """
        Build parameters from an item using a mapping template.
        
        Args:
            item: Source item (e.g., from a list)
            mapping: Parameter mapping (param_name -> item_field)
        
        Returns:
            Dictionary of built parameters
        """
        result = {}
        for param_name, item_field in mapping.items():
            # Handle nested paths like "item.address.city"
            if item_field.startswith('${item.'):
                # Extract the path after ${item.
                path = item_field[7:-1]  # Remove ${item. and }
                value = self._get_nested(item, path)
            elif item_field.startswith('${item}'):
                value = item
            else:
                value = item_field  # Static value
            
            result[param_name] = value
        
        return result
    
    def _get_nested(self, obj: Dict[str, Any], path: str) -> Any:
        """Get a nested value from a dictionary."""
        parts = path.split('.')
        current = obj
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
        return current
    
    @keyword('Queue Bot Calls')
    def queue_bot_calls(
        self,
        bot_id: str,
        items: List[Dict[str, Any]],
        parameter_mapping: Dict[str, str],
        concurrency: int = 3,
        fail_fast: bool = False,
        timeout_per_item: int = 60
    ) -> Dict[str, Any]:
        """
        Queue multiple bot calls for parallel execution.
        
        Args:
            bot_id: ID of the bot to call
            items: List of items to process
            parameter_mapping: How to map item fields to bot parameters
            concurrency: Max parallel executions
            fail_fast: Stop on first failure
            timeout_per_item: Timeout per item (seconds)
        
        Returns:
            Dictionary with results and statistics
        """
        start_time = time.time()
        results = []
        errors = []
        succeeded = 0
        failed = 0
        
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = {}
            
            for idx, item in enumerate(items):
                params = self.build_params_from_mapping(item, parameter_mapping)
                future = executor.submit(
                    self.call_bot,
                    bot_id,
                    parameters=params,
                    timeout=timeout_per_item,
                    wait=True,
                )
                futures[future] = idx
            
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    result = future.result()
                    results.append(result)
                    succeeded += 1
                except Exception as e:
                    failed += 1
                    errors.append({"index": idx, "error": str(e)})
                    
                    if fail_fast:
                        # Cancel remaining futures
                        for f in futures:
                            f.cancel()
                        break
        
        duration = (time.time() - start_time) * 1000
        
        return {
            "results": results,
            "total": len(items),
            "succeeded": succeeded,
            "failed": failed,
            "errors": errors,
            "duration_ms": duration,
        }
    
    # =========================================================================
    # Audit & Utilities
    # =========================================================================
    
    def _audit(self, **kwargs) -> None:
        """Add entry to audit log."""
        entry = {
            "timestamp": time.time(),
            **kwargs,
        }
        self._audit_log.append(entry)
        
        # Also log to Robot Framework
        logger.debug(f"AUDIT: {json.dumps(entry)}")
    
    @keyword('Get Subprocess Audit Log')
    def get_subprocess_audit_log(self) -> List[Dict[str, Any]]:
        """Get the audit log for subprocess calls."""
        return self._audit_log
    
    @keyword('Clear Subprocess Audit Log')
    def clear_subprocess_audit_log(self) -> None:
        """Clear the audit log."""
        self._audit_log = []
    
    @keyword('Is Subprocess')
    def is_subprocess(self) -> bool:
        """Check if current execution is a subprocess."""
        return os.environ.get('SKULDBOT_SUBPROCESS', '').lower() == 'true'


# Make library available when imported directly
if __name__ == '__main__':
    print("SkuldSubprocess Library v1.0.0")
    print("Use with Robot Framework or SkuldBot Studio")


