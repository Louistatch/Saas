/** No unbounded promise queue when Auth/PostgREST is overloaded. */
export class WorkGate {
  active = 0
  refused = 0
  constructor(private capacity: number) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.capacity) {
      this.refused++
      throw new Error('capacity')
    }
    this.active++
    try {
      return await work()
    } finally {
      this.active--
    }
  }
}
