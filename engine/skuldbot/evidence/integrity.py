"""
Integrity Verification - Merkle Trees and Tamper Detection

Enterprise-grade tamper detection for evidence packs.
Uses Merkle trees to efficiently verify integrity of any file.

Why Merkle Trees?
1. Detect tampering of ANY file in O(log n) comparisons
2. Prove a specific file was part of original pack
3. Generate "inclusion proofs" for auditors
4. Industry standard (used by Git, Bitcoin, certificate transparency)

Structure:
           Root Hash
          /        \
       Hash01    Hash23
       /    \    /    \
    Hash0  Hash1 Hash2 Hash3
      |      |     |     |
    File0  File1 File2 File3
"""

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path


@dataclass
class MerkleNode:
    """Node in Merkle tree"""
    hash: str
    left: Optional["MerkleNode"] = None
    right: Optional["MerkleNode"] = None
    file_path: Optional[str] = None  # Only for leaf nodes


@dataclass
class MerkleProof:
    """Proof that a file is part of the Merkle tree"""
    file_path: str
    file_hash: str
    proof_hashes: List[Tuple[str, str]]  # List of (hash, position: "left" or "right")
    root_hash: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "filePath": self.file_path,
            "fileHash": self.file_hash,
            "proofHashes": [
                {"hash": h, "position": p}
                for h, p in self.proof_hashes
            ],
            "rootHash": self.root_hash,
        }


@dataclass
class IntegrityMetadata:
    """Integrity metadata for manifest"""
    merkle_root: str = ""
    merkle_algorithm: str = "SHA-256"
    total_files: int = 0
    tree_depth: int = 0
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    file_hashes: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "merkleRoot": self.merkle_root,
            "merkleAlgorithm": self.merkle_algorithm,
            "totalFiles": self.total_files,
            "treeDepth": self.tree_depth,
            "createdAt": self.created_at,
            "fileHashes": self.file_hashes,
        }


@dataclass
class TamperCheckResult:
    """Result of tamper detection check"""
    is_tampered: bool = False
    valid_files: List[str] = field(default_factory=list)
    tampered_files: List[str] = field(default_factory=list)
    missing_files: List[str] = field(default_factory=list)
    new_files: List[str] = field(default_factory=list)
    root_hash_valid: bool = True
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "isTampered": self.is_tampered,
            "summary": {
                "validFiles": len(self.valid_files),
                "tamperedFiles": len(self.tampered_files),
                "missingFiles": len(self.missing_files),
                "newFiles": len(self.new_files),
            },
            "details": {
                "validFiles": self.valid_files,
                "tamperedFiles": self.tampered_files,
                "missingFiles": self.missing_files,
                "newFiles": self.new_files,
            },
            "rootHashValid": self.root_hash_valid,
            "errors": self.errors,
        }


class MerkleTree:
    """
    Merkle tree implementation for evidence pack integrity.

    Builds a binary hash tree where:
    - Leaf nodes are SHA-256 hashes of individual files
    - Internal nodes are SHA-256(left_child || right_child)
    - Root hash represents entire evidence pack
    """

    def __init__(self, hash_algorithm: str = "sha256"):
        """
        Initialize Merkle tree.

        Args:
            hash_algorithm: Hash algorithm (sha256, sha384, sha512)
        """
        self.hash_algorithm = hash_algorithm
        self._root: Optional[MerkleNode] = None
        self._leaves: Dict[str, MerkleNode] = {}  # file_path -> leaf node
        self._file_hashes: Dict[str, str] = {}

    def _hash(self, data: bytes) -> str:
        """Compute hash of data"""
        if self.hash_algorithm == "sha384":
            return hashlib.sha384(data).hexdigest()
        elif self.hash_algorithm == "sha512":
            return hashlib.sha512(data).hexdigest()
        else:
            return hashlib.sha256(data).hexdigest()

    def _combine_hashes(self, left: str, right: str) -> str:
        """Combine two hashes into parent hash"""
        combined = (left + right).encode()
        return self._hash(combined)

    def build_from_files(self, files: Dict[str, bytes]) -> str:
        """
        Build Merkle tree from file contents.

        Args:
            files: Dictionary of {file_path: file_content}

        Returns:
            Root hash of the tree
        """
        if not files:
            return ""

        # Create leaf nodes (sorted for deterministic ordering)
        leaves = []
        for file_path in sorted(files.keys()):
            content = files[file_path]
            file_hash = self._hash(content)

            leaf = MerkleNode(
                hash=file_hash,
                file_path=file_path,
            )
            leaves.append(leaf)
            self._leaves[file_path] = leaf
            self._file_hashes[file_path] = file_hash

        # Build tree bottom-up
        self._root = self._build_tree(leaves)

        return self._root.hash

    def build_from_directory(self, directory: str, exclude: Optional[List[str]] = None) -> str:
        """
        Build Merkle tree from directory contents.

        Args:
            directory: Path to directory
            exclude: File patterns to exclude

        Returns:
            Root hash
        """
        exclude = exclude or ["checksums.json", "manifest.json"]
        files = {}

        dir_path = Path(directory)
        for file_path in dir_path.rglob("*"):
            if file_path.is_file():
                relative_path = str(file_path.relative_to(dir_path))

                # Skip excluded files
                if any(ex in relative_path for ex in exclude):
                    continue

                with open(file_path, "rb") as f:
                    files[relative_path] = f.read()

        return self.build_from_files(files)

    def _build_tree(self, nodes: List[MerkleNode]) -> MerkleNode:
        """Recursively build tree from list of nodes"""
        if len(nodes) == 1:
            return nodes[0]

        # If odd number of nodes, duplicate last one
        if len(nodes) % 2 == 1:
            nodes.append(nodes[-1])

        # Build parent level
        parents = []
        for i in range(0, len(nodes), 2):
            left = nodes[i]
            right = nodes[i + 1]

            parent = MerkleNode(
                hash=self._combine_hashes(left.hash, right.hash),
                left=left,
                right=right,
            )
            parents.append(parent)

        return self._build_tree(parents)

    def get_root_hash(self) -> str:
        """Get root hash of the tree"""
        return self._root.hash if self._root else ""

    def get_file_hash(self, file_path: str) -> Optional[str]:
        """Get hash of a specific file"""
        return self._file_hashes.get(file_path)

    def get_proof(self, file_path: str) -> Optional[MerkleProof]:
        """
        Generate inclusion proof for a file.

        This proof allows verification that a file was part of
        the original evidence pack without needing all other files.

        Args:
            file_path: Path to file to prove

        Returns:
            MerkleProof or None if file not in tree
        """
        if file_path not in self._leaves:
            return None

        proof_hashes = []
        current = self._leaves[file_path]

        # Walk up the tree collecting sibling hashes
        def find_proof(node: MerkleNode, target_hash: str, proof: List[Tuple[str, str]]) -> bool:
            if node.file_path is not None:  # Leaf node
                return node.hash == target_hash

            if node.left and find_proof(node.left, target_hash, proof):
                if node.right:
                    proof.append((node.right.hash, "right"))
                return True

            if node.right and find_proof(node.right, target_hash, proof):
                if node.left:
                    proof.append((node.left.hash, "left"))
                return True

            return False

        find_proof(self._root, current.hash, proof_hashes)

        return MerkleProof(
            file_path=file_path,
            file_hash=current.hash,
            proof_hashes=proof_hashes,
            root_hash=self._root.hash,
        )

    def verify_proof(self, proof: MerkleProof) -> bool:
        """
        Verify an inclusion proof.

        Args:
            proof: MerkleProof to verify

        Returns:
            True if proof is valid
        """
        current_hash = proof.file_hash

        for sibling_hash, position in proof.proof_hashes:
            if position == "left":
                current_hash = self._combine_hashes(sibling_hash, current_hash)
            else:
                current_hash = self._combine_hashes(current_hash, sibling_hash)

        return current_hash == proof.root_hash

    def get_metadata(self) -> IntegrityMetadata:
        """Get integrity metadata for manifest"""
        depth = 0
        if self._root:
            # Calculate depth
            node = self._root
            while node.left:
                depth += 1
                node = node.left

        return IntegrityMetadata(
            merkle_root=self.get_root_hash(),
            merkle_algorithm=f"SHA-{self.hash_algorithm[3:].upper()}" if self.hash_algorithm.startswith("sha") else self.hash_algorithm.upper(),
            total_files=len(self._file_hashes),
            tree_depth=depth,
            file_hashes=self._file_hashes.copy(),
        )


class IntegrityVerifier:
    """
    Verifies integrity of evidence packs.

    Detects:
    - Modified files (hash mismatch)
    - Deleted files (missing from pack)
    - Added files (not in original tree)
    - Corrupted files
    """

    def __init__(self, hash_algorithm: str = "sha256"):
        """
        Initialize verifier.

        Args:
            hash_algorithm: Hash algorithm used for tree
        """
        self.hash_algorithm = hash_algorithm

    def _hash(self, data: bytes) -> str:
        """Compute hash of data"""
        if self.hash_algorithm == "sha384":
            return hashlib.sha384(data).hexdigest()
        elif self.hash_algorithm == "sha512":
            return hashlib.sha512(data).hexdigest()
        else:
            return hashlib.sha256(data).hexdigest()

    def verify_pack(
        self,
        directory: str,
        integrity_metadata: IntegrityMetadata,
    ) -> TamperCheckResult:
        """
        Verify integrity of evidence pack.

        Args:
            directory: Path to evidence pack directory
            integrity_metadata: Original integrity metadata from manifest

        Returns:
            TamperCheckResult with detailed findings
        """
        result = TamperCheckResult()

        try:
            dir_path = Path(directory)

            # Get current file hashes
            current_files = {}
            for file_path in dir_path.rglob("*"):
                if file_path.is_file():
                    relative_path = str(file_path.relative_to(dir_path))

                    # Skip integrity/manifest files
                    if relative_path in ["checksums.json", "manifest.json"]:
                        continue

                    with open(file_path, "rb") as f:
                        current_files[relative_path] = self._hash(f.read())

            # Compare with original hashes
            original_files = integrity_metadata.file_hashes

            # Check for modified files
            for file_path, original_hash in original_files.items():
                if file_path not in current_files:
                    result.missing_files.append(file_path)
                elif current_files[file_path] != original_hash:
                    result.tampered_files.append(file_path)
                else:
                    result.valid_files.append(file_path)

            # Check for new files
            for file_path in current_files:
                if file_path not in original_files:
                    result.new_files.append(file_path)

            # Rebuild Merkle tree and compare root
            tree = MerkleTree(self.hash_algorithm)

            # Read current files for tree building
            files_content = {}
            for file_path in sorted(original_files.keys()):
                full_path = dir_path / file_path
                if full_path.exists():
                    with open(full_path, "rb") as f:
                        files_content[file_path] = f.read()
                else:
                    # Use placeholder for missing files to maintain tree structure
                    files_content[file_path] = b""

            current_root = tree.build_from_files(files_content)
            result.root_hash_valid = (current_root == integrity_metadata.merkle_root)

            # Determine if tampered
            result.is_tampered = (
                len(result.tampered_files) > 0 or
                len(result.missing_files) > 0 or
                not result.root_hash_valid
            )

        except Exception as e:
            result.is_tampered = True
            result.errors.append(f"Verification error: {e}")

        return result

    def verify_single_file(
        self,
        file_path: str,
        file_content: bytes,
        proof: MerkleProof,
    ) -> bool:
        """
        Verify a single file using its Merkle proof.

        This allows verification without accessing other files.

        Args:
            file_path: Path of the file
            file_content: Content of the file
            proof: Merkle proof for the file

        Returns:
            True if file is authentic
        """
        # Verify file hash matches proof
        computed_hash = self._hash(file_content)
        if computed_hash != proof.file_hash:
            return False

        # Verify proof leads to root
        current_hash = proof.file_hash

        for sibling_hash, position in proof.proof_hashes:
            if position == "left":
                combined = (sibling_hash + current_hash).encode()
            else:
                combined = (current_hash + sibling_hash).encode()
            current_hash = self._hash(combined)

        return current_hash == proof.root_hash

    def generate_tamper_report(
        self,
        result: TamperCheckResult,
    ) -> str:
        """
        Generate human-readable tamper detection report.

        Args:
            result: TamperCheckResult from verify_pack

        Returns:
            Formatted report string
        """
        report = []
        report.append("=" * 60)
        report.append("EVIDENCE PACK INTEGRITY VERIFICATION REPORT")
        report.append("=" * 60)
        report.append("")

        if result.is_tampered:
            report.append("⚠️  TAMPERING DETECTED")
            report.append("")
        else:
            report.append("✅ INTEGRITY VERIFIED - NO TAMPERING DETECTED")
            report.append("")

        report.append(f"Total files verified: {len(result.valid_files)}")
        report.append(f"Tampered files: {len(result.tampered_files)}")
        report.append(f"Missing files: {len(result.missing_files)}")
        report.append(f"Unauthorized files: {len(result.new_files)}")
        report.append(f"Merkle root valid: {'Yes' if result.root_hash_valid else 'No'}")
        report.append("")

        if result.tampered_files:
            report.append("TAMPERED FILES:")
            for f in result.tampered_files:
                report.append(f"  - {f}")
            report.append("")

        if result.missing_files:
            report.append("MISSING FILES:")
            for f in result.missing_files:
                report.append(f"  - {f}")
            report.append("")

        if result.new_files:
            report.append("UNAUTHORIZED FILES:")
            for f in result.new_files:
                report.append(f"  - {f}")
            report.append("")

        if result.errors:
            report.append("ERRORS:")
            for e in result.errors:
                report.append(f"  - {e}")
            report.append("")

        report.append("=" * 60)

        return "\n".join(report)


def compute_file_checksums(
    directory: str,
    algorithm: str = "sha256",
) -> Dict[str, str]:
    """
    Compute checksums for all files in a directory.

    Utility function for simple checksum generation.

    Args:
        directory: Path to directory
        algorithm: Hash algorithm

    Returns:
        Dictionary of {file_path: hash}
    """
    checksums = {}
    dir_path = Path(directory)

    for file_path in dir_path.rglob("*"):
        if file_path.is_file():
            relative_path = str(file_path.relative_to(dir_path))

            with open(file_path, "rb") as f:
                content = f.read()

            if algorithm == "sha384":
                checksums[relative_path] = hashlib.sha384(content).hexdigest()
            elif algorithm == "sha512":
                checksums[relative_path] = hashlib.sha512(content).hexdigest()
            else:
                checksums[relative_path] = hashlib.sha256(content).hexdigest()

    return checksums
