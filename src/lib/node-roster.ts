export interface TrollyNode {
  id: string;
  name: string;
  projects: string[];
  localOrigin?: string;
}

export function listNodes(nodes: TrollyNode[]): TrollyNode[] {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    projects: [...new Set(node.projects)].sort(),
    ...(node.localOrigin ? { localOrigin: new URL(node.localOrigin).origin } : {}),
  }));
}
