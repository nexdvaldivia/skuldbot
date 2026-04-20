import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Merkle Tree result from tree building
 */
export interface MerkleTreeResult {
  root: string;
  depth: number;
  leaves: string[];
  tree: string[][];
}

/**
 * Merkle inclusion proof
 */
export interface MerkleProof {
  leaf: string;
  leafIndex: number;
  proof: Array<{ hash: string; position: 'left' | 'right' }>;
  root: string;
}

/**
 * Integrity Service - Merkle Tree Verification
 *
 * Provides cryptographic integrity verification for evidence packs using
 * Merkle trees. This allows:
 * - Tamper detection on any file
 * - Efficient inclusion proofs (O(log n))
 * - Verifiable partial downloads
 *
 * Algorithm: SHA-256 for all hashing operations
 */
@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);
  private readonly algorithm = 'sha256';

  /**
   * Build a Merkle tree from file hashes.
   */
  buildMerkleTree(fileHashes: Record<string, string>): MerkleTreeResult {
    // Sort files for deterministic ordering
    const sortedFiles = Object.keys(fileHashes).sort();
    const leaves = sortedFiles.map((file) => fileHashes[file]);

    if (leaves.length === 0) {
      return {
        root: this.hashEmpty(),
        depth: 0,
        leaves: [],
        tree: [[]],
      };
    }

    // Build tree level by level
    const tree: string[][] = [leaves];
    let currentLevel = leaves;

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(this.hashPair(left, right));
      }

      tree.push(nextLevel);
      currentLevel = nextLevel;
    }

    return {
      root: currentLevel[0],
      depth: tree.length,
      leaves,
      tree,
    };
  }

  /**
   * Generate a Merkle inclusion proof for a specific file.
   */
  generateProof(
    fileHashes: Record<string, string>,
    targetFile: string,
  ): MerkleProof | null {
    const sortedFiles = Object.keys(fileHashes).sort();
    const fileIndex = sortedFiles.indexOf(targetFile);

    if (fileIndex === -1) {
      return null;
    }

    const tree = this.buildMerkleTree(fileHashes);
    const proof: Array<{ hash: string; position: 'left' | 'right' }> = [];

    let index = fileIndex;

    for (let level = 0; level < tree.tree.length - 1; level++) {
      const currentLevel = tree.tree[level];
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;

      if (siblingIndex < currentLevel.length) {
        proof.push({
          hash: currentLevel[siblingIndex],
          position: isRightNode ? 'left' : 'right',
        });
      } else {
        // Duplicate leaf case
        proof.push({
          hash: currentLevel[index],
          position: isRightNode ? 'left' : 'right',
        });
      }

      index = Math.floor(index / 2);
    }

    return {
      leaf: fileHashes[targetFile],
      leafIndex: fileIndex,
      proof,
      root: tree.root,
    };
  }

  /**
   * Verify a Merkle inclusion proof.
   */
  verifyProof(proof: MerkleProof): boolean {
    let hash = proof.leaf;

    for (const step of proof.proof) {
      if (step.position === 'left') {
        hash = this.hashPair(step.hash, hash);
      } else {
        hash = this.hashPair(hash, step.hash);
      }
    }

    return hash === proof.root;
  }

  /**
   * Verify that a file hash matches and is part of the tree.
   */
  verifyFileInclusion(
    fileHashes: Record<string, string>,
    targetFile: string,
    expectedHash: string,
    merkleRoot: string,
  ): { valid: boolean; hashMatch: boolean; inclusionValid: boolean } {
    const actualHash = fileHashes[targetFile];
    const hashMatch = actualHash === expectedHash;

    const proof = this.generateProof(fileHashes, targetFile);
    const inclusionValid = proof ? this.verifyProof(proof) && proof.root === merkleRoot : false;

    return {
      valid: hashMatch && inclusionValid,
      hashMatch,
      inclusionValid,
    };
  }

  /**
   * Hash two nodes together.
   */
  private hashPair(left: string, right: string): string {
    // Concatenate in sorted order for consistency
    const combined = left < right ? `${left}${right}` : `${right}${left}`;
    return crypto.createHash(this.algorithm).update(combined).digest('hex');
  }

  /**
   * Hash for empty tree.
   */
  private hashEmpty(): string {
    return crypto.createHash(this.algorithm).update('empty').digest('hex');
  }

  /**
   * Hash a buffer.
   */
  hashBuffer(buffer: Buffer): string {
    return crypto.createHash(this.algorithm).update(buffer).digest('hex');
  }

  /**
   * Hash a string.
   */
  hashString(str: string): string {
    return crypto.createHash(this.algorithm).update(str).digest('hex');
  }

  /**
   * Verify entire tree consistency.
   */
  verifyTreeConsistency(tree: MerkleTreeResult): boolean {
    if (tree.leaves.length === 0) {
      return tree.root === this.hashEmpty();
    }

    const rebuilt = this.rebuildFromLeaves(tree.leaves);
    return rebuilt.root === tree.root;
  }

  /**
   * Rebuild tree from leaves for verification.
   */
  private rebuildFromLeaves(leaves: string[]): { root: string; tree: string[][] } {
    if (leaves.length === 0) {
      return { root: this.hashEmpty(), tree: [[]] };
    }

    const tree: string[][] = [leaves];
    let currentLevel = leaves;

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(this.hashPair(left, right));
      }

      tree.push(nextLevel);
      currentLevel = nextLevel;
    }

    return { root: currentLevel[0], tree };
  }
}
