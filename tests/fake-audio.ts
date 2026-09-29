/** A stand-in for the browser's audio classes: it records what was built and connected, and plays nothing. */
export class FakeParam {
  value = 0;
  calls: Array<{ op: 'set' | 'linear' | 'exp' | 'cancel'; value: number; time: number }> = [];
  setValueAtTime(value: number, time: number): FakeParam {
    this.calls.push({ op: 'set', value, time });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): FakeParam {
    this.calls.push({ op: 'linear', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): FakeParam {
    this.calls.push({ op: 'exp', value, time });
    return this;
  }
  cancelScheduledValues(time: number): FakeParam {
    this.calls.push({ op: 'cancel', value: 0, time });
    return this;
  }
}

export class FakeNode {
  connections: FakeNode[] = [];
  disconnected = false;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  type = '';
  buffer: unknown = null;
  loop = false;
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  pan = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  constructor(readonly kind: string) {}
  connect(to: FakeNode): FakeNode {
    this.connections.push(to);
    return to;
  }
  disconnect(): void {
    this.disconnected = true;
  }
  start(time = 0): void {
    this.startedAt = time;
  }
  stop(time = 0): void {
    this.stoppedAt = time;
  }
}

export class FakeContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  sampleRate = 8000;
  destination = new FakeNode('destination');
  nodes: FakeNode[] = [];
  resumeCalls = 0;
  rejectResume = false;
  private make(kind: string): FakeNode {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
  createGain = (): FakeNode => this.make('gain');
  createOscillator = (): FakeNode => this.make('oscillator');
  createBufferSource = (): FakeNode => this.make('source');
  createBiquadFilter = (): FakeNode => this.make('filter');
  createStereoPanner = (): FakeNode => this.make('panner');
  createDynamicsCompressor = (): FakeNode => this.make('compressor');
  createBuffer = (_channels: number, length: number): { length: number; getChannelData: () => Float32Array } => ({
    length,
    getChannelData: () => new Float32Array(length),
  });
  resume(): Promise<void> {
    this.resumeCalls += 1;
    return this.rejectResume ? Promise.reject(new Error('no user gesture')) : Promise.resolve();
  }
  ofKind(kind: string): FakeNode[] {
    return this.nodes.filter((node) => node.kind === kind);
  }
}

export const asContext = (fake: FakeContext): AudioContext => fake as unknown as AudioContext;
export const asNode = <T>(node: FakeNode): T => node as unknown as T;
