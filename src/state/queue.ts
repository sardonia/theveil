export class AsyncQueue {
  private chain: Promise<void> = Promise.resolve();

  enqueue(task: () => Promise<void>) {
    this.chain = this.chain.then(task).catch(() => undefined);
    return this.chain;
  }
}
