import type { FileTreeNode, TorrentFile } from '@/types/torrent';

/**
 * Parses a flat array of torrent files into a hierarchical tree structure.
 *
 * @param files - Array of TorrentFile objects from qBittorrent API
 * @returns Array of FileTreeNode representing the root level of the tree
 *
 * @example
 * const files = [
 *   { index: 0, name: 'album/track01.mp3', size: 1000, progress: 0.5, priority: 1 },
 *   { index: 1, name: 'album/track02.mp3', size: 2000, progress: 1, priority: 1 },
 *   { index: 2, name: 'cover.jpg', size: 500, progress: 1, priority: 1 },
 * ];
 * const tree = buildFileTree(files);
 * // Returns:
 * // [
 * //   { name: 'album', isFolder: true, children: [...], size: 3000, progress: 0.833 },
 * //   { name: 'cover.jpg', isFolder: false, size: 500, progress: 1 },
 * // ]
 */
export function buildFileTree(files: Array<TorrentFile>): Array<FileTreeNode> {
  if (files.length === 0) {
    return [];
  }

  // Map to hold folder nodes by their full path
  const folderMap = new Map<string, FileTreeNode>();

  // Root level nodes (files and folders at the top level)
  const rootNodes: Array<FileTreeNode> = [];

  for (const file of files) {
    const pathParts = file.name.split('/');
    const fileName = pathParts[pathParts.length - 1];

    // Create the file node
    const fileNode: FileTreeNode = {
      name: fileName,
      path: file.name,
      isFolder: false,
      size: file.size,
      progress: file.progress,
      priority: file.priority,
      fileIndex: file.index,
      file: file,
    };

    // If no folder structure, add directly to root
    if (pathParts.length === 1) {
      rootNodes.push(fileNode);
      continue;
    }

    // Build folder hierarchy
    let currentPath = '';
    let parentChildren: Array<FileTreeNode> = rootNodes;

    for (let i = 0; i < pathParts.length - 1; i++) {
      const folderName = pathParts[i];
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

      let folderNode = folderMap.get(currentPath);

      if (!folderNode) {
        folderNode = {
          name: folderName,
          path: currentPath,
          isFolder: true,
          size: 0,
          progress: 0,
          children: [],
        };
        folderMap.set(currentPath, folderNode);
        parentChildren.push(folderNode);
      }

      parentChildren = folderNode.children!;
    }

    // Add file to its parent folder
    parentChildren.push(fileNode);
  }

  // Calculate folder sizes and progress (bottom-up)
  calculateFolderStats(rootNodes);

  // Sort nodes: folders first, then alphabetically by name
  sortNodes(rootNodes);

  return rootNodes;
}

/**
 * Recursively calculates size and progress for folder nodes.
 * Size is the sum of all children sizes.
 * Progress is the weighted average by size.
 */
function calculateFolderStats(nodes: Array<FileTreeNode>): void {
  for (const node of nodes) {
    if (node.isFolder && node.children) {
      // First, calculate stats for all nested children
      calculateFolderStats(node.children);

      // Calculate total size and weighted progress
      let totalSize = 0;
      let weightedProgress = 0;

      for (const child of node.children) {
        totalSize += child.size;
        weightedProgress += child.size * child.progress;
      }

      node.size = totalSize;
      node.progress = totalSize > 0 ? weightedProgress / totalSize : 0;
    }
  }
}

/**
 * Recursively sorts nodes: folders first, then alphabetically by name (case-insensitive).
 */
function sortNodes(nodes: Array<FileTreeNode>): void {
  nodes.sort((a, b) => {
    // Folders come first
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    // Then sort alphabetically (case-insensitive)
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  // Recursively sort children
  for (const node of nodes) {
    if (node.isFolder && node.children) {
      sortNodes(node.children);
    }
  }
}

/**
 * Flattens a file tree into an array of files, optionally filtering by folder path.
 * Useful for getting all file indices within a folder for bulk priority changes.
 *
 * @param nodes - Array of FileTreeNode to flatten
 * @param folderPath - Optional folder path to filter by (only files under this path)
 * @returns Array of TorrentFile objects
 */
export function flattenFileTree(
  nodes: Array<FileTreeNode>,
  folderPath?: string
): Array<TorrentFile> {
  const files: Array<TorrentFile> = [];

  function traverse(nodeList: Array<FileTreeNode>): void {
    for (const node of nodeList) {
      if (node.isFolder && node.children) {
        traverse(node.children);
      } else if (node.file) {
        if (!folderPath || node.path.startsWith(folderPath + '/') || node.path === folderPath) {
          files.push(node.file);
        }
      }
    }
  }

  traverse(nodes);
  return files;
}

/**
 * Gets all file indices from a folder node (for bulk priority operations).
 *
 * @param node - The folder node to get file indices from
 * @returns Array of file indices
 */
export function getFileIndicesFromFolder(node: FileTreeNode): Array<number> {
  const indices: Array<number> = [];

  function traverse(currentNode: FileTreeNode): void {
    if (currentNode.isFolder && currentNode.children) {
      for (const child of currentNode.children) {
        traverse(child);
      }
    } else if (currentNode.fileIndex !== undefined) {
      indices.push(currentNode.fileIndex);
    }
  }

  traverse(node);
  return indices;
}

/**
 * Finds a node in the tree by its path.
 *
 * @param nodes - The root nodes to search in
 * @param path - The full path of the node to find
 * @returns The FileTreeNode if found, undefined otherwise
 */
export function findNodeByPath(
  nodes: Array<FileTreeNode>,
  path: string
): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    if (node.isFolder && node.children && path.startsWith(node.path + '/')) {
      const found = findNodeByPath(node.children, path);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Counts the total number of files in a tree or subtree.
 *
 * @param nodes - Array of FileTreeNode to count files in
 * @returns Total number of files (excluding folders)
 */
export function countFiles(nodes: Array<FileTreeNode>): number {
  let count = 0;

  for (const node of nodes) {
    if (node.isFolder && node.children) {
      count += countFiles(node.children);
    } else {
      count += 1;
    }
  }

  return count;
}

/**
 * Gets the depth of a node based on its path.
 *
 * @param path - The file/folder path
 * @returns The depth level (0 for root level items)
 */
export function getNodeDepth(path: string): number {
  if (!path) return 0;
  return path.split('/').length - 1;
}
