const DEFAULT_CAPACITY = 100;

export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];

  constructor(private capacity: number = DEFAULT_CAPACITY) {}

  push(state: T): void {
    this.undoStack.push(state);
    if (this.undoStack.length > this.capacity) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Pop the last undo entry. The CURRENT state (after mutation) is provided
   * by the caller so it can be pushed onto the redo stack.
   */
  undo(currentState: T): T | null {
    const last = this.undoStack.pop();
    if (last === undefined) return null;
    this.redoStack.push(currentState);
    return last;
  }

  /**
   * Pop the last redo entry. The CURRENT state is provided so it can be
   * pushed back onto the undo stack.
   */
  redo(currentState: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(currentState);
    return next;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
