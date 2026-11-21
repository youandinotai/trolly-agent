import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type WorkspaceTaskStatus = 'open' | 'in-progress' | 'done';

export interface WorkspaceTask {
  id: string;
  title: string;
  description: string;
  status: WorkspaceTaskStatus;
  createdAt: string;
  updatedAt: string;
}

function isStatus(value: unknown): value is WorkspaceTaskStatus {
  return value === 'open' || value === 'in-progress' || value === 'done';
}

function isTask(value: unknown): value is WorkspaceTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<WorkspaceTask>;
  return typeof task.id === 'string'
    && typeof task.title === 'string'
    && typeof task.description === 'string'
    && isStatus(task.status)
    && typeof task.createdAt === 'string'
    && typeof task.updatedAt === 'string';
}

export class WorkspaceStore {
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'tasks.json');
  }

  list(): WorkspaceTask[] {
    if (!fs.existsSync(this.file)) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      throw new Error(`Could not read workspace tasks at ${this.file}: ${String(error)}`);
    }
    if (!Array.isArray(parsed)) throw new Error(`Workspace task file must contain an array: ${this.file}`);
    if (!parsed.every(isTask)) throw new Error(`Workspace task file contains invalid records: ${this.file}`);
    return parsed;
  }

  create(input: { title: string; description?: string }): WorkspaceTask {
    const title = String(input.title ?? '').trim();
    const description = String(input.description ?? '').trim();
    if (!title) throw new Error('A task title is required.');
    if (title.length > 160 || description.length > 20_000) throw new Error('Task text is too long.');
    const tasks = this.list();
    const now = new Date().toISOString();
    const task: WorkspaceTask = {
      id: randomUUID(),
      title,
      description,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    tasks.unshift(task);
    this.write(tasks);
    return task;
  }

  setStatus(id: string, status: WorkspaceTaskStatus): WorkspaceTask {
    if (!isStatus(status)) throw new Error('Unknown workspace task status.');
    const tasks = this.list();
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error('Workspace task not found.');
    const task = { ...tasks[index], status, updatedAt: new Date().toISOString() };
    tasks[index] = task;
    this.write(tasks);
    return task;
  }

  delete(id: string): void {
    const tasks = this.list();
    this.write(tasks.filter((task) => task.id !== id));
  }

  private write(tasks: WorkspaceTask[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(tasks, null, 2), 'utf8');
  }
}
