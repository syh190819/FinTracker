import type { Todo } from '../types/api';

export interface TodoNode extends Todo {
  children: TodoNode[];
  depth: number;
}

/** 由扁平待办列表组装树（parent_id 为空或父节点不在列表内的为根） */
export function buildTodoTree(todos: Todo[]): TodoNode[] {
  const map = new Map<number, TodoNode>();
  todos.forEach((t) => map.set(t.id, { ...t, children: [], depth: 0 }));

  const roots: TodoNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const assignDepth = (nodes: TodoNode[], d: number) => {
    nodes.forEach((n) => {
      n.depth = d;
      assignDepth(n.children, d + 1);
    });
  };
  assignDepth(roots, 1);
  return roots;
}

/** 按条件裁剪树：保留命中节点，以及仍含可见后代的父节点 */
export function filterTree(nodes: TodoNode[], keep: (n: TodoNode) => boolean): TodoNode[] {
  const result: TodoNode[] = [];
  nodes.forEach((n) => {
    const children = filterTree(n.children, keep);
    if (keep(n) || children.length > 0) {
      result.push({ ...n, children });
    }
  });
  return result;
}

/** 展平树为列表 */
export function flattenTree(nodes: TodoNode[]): TodoNode[] {
  const out: TodoNode[] = [];
  nodes.forEach((n) => {
    out.push(n);
    out.push(...flattenTree(n.children));
  });
  return out;
}
