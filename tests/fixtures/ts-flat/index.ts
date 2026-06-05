export interface Task {
  id: number
  title: string
  done: boolean
}

const tasks: Task[] = []

export function listTasks(): Task[] {
  return tasks
}

export function createTask(title: string): Task {
  const task: Task = { id: tasks.length + 1, title, done: false }
  tasks.push(task)
  return task
}

export function completeTask(id: number): Task | undefined {
  const task = tasks.find(t => t.id === id)
  if (task) task.done = true
  return task
}
