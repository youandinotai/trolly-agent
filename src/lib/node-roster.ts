export interface TrollyNode {
  id: string;
  name: string;
  projects: string[];
}

export function listNodes(nodes: TrollyNode[]): TrollyNode[] {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    projects: [...new Set(node.projects)].sort(),
  }));
}
