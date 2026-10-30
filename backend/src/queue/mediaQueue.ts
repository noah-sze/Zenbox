export interface QueueTask<T> {
  id: string;
  run: () => Promise<T>;
  retriesLeft: number;
}

export class MediaQueue {
  private queue: QueueTask<unknown>[] = [];
  private activeCount = 0;
  private readonly maxConcurrency: number;

  constructor(maxConcurrency = 2) {
    this.maxConcurrency = maxConcurrency;
  }

  public enqueue<T>(id: string, run: () => Promise<T>, maxRetries = 2): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: QueueTask<T> = {
        id,
        run: async () => {
          try {
            const res = await run();
            resolve(res);
            return res;
          } catch (err) {
            if (task.retriesLeft > 0) {
              task.retriesLeft--;
              console.warn(`[Queue] Task ${id} failed. Retrying... (${task.retriesLeft} retries left)`);
              this.queue.push(task as QueueTask<unknown>);
            } else {
              reject(err);
            }
            throw err;
          }
        },
        retriesLeft: maxRetries
      };

      this.queue.push(task as QueueTask<unknown>);
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;
    try {
      await task.run();
    } catch {
      // Errors handled in enqueue promise wrapper
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public get runningCount(): number {
    return this.activeCount;
  }
}

export const globalMediaQueue = new MediaQueue(2);
