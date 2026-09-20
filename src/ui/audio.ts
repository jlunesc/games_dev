import type { GameEvent } from '../game/state';

export interface Sound {
  /** Browsers only allow sound after a user gesture; call this from a tap or button press. */
  unlock(): void;
  play(events: readonly GameEvent[]): void;
}

/** Simple beeps generated in code (no sound files, so nothing extra to load). */
export function createSound(): Sound {
  let context: AudioContext | null = null;

  const beep = (frequency: number, milliseconds: number, type: OscillatorType, volume: number): void => {
    if (context === null || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + milliseconds / 1000);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + milliseconds / 1000);
  };

  return {
    unlock(): void {
      try {
        context ??= new AudioContext();
        // Without a user gesture the browser rejects this; that must not surface as an unhandled rejection.
        void context.resume().catch(() => {});
      } catch {
        context = null;
      }
    },
    play(events): void {
      for (const event of events) {
        if (event === 'bossHit') beep(220, 90, 'square', 0.15);
        if (event === 'playerHit') beep(110, 200, 'sawtooth', 0.2);
        if (event === 'dash') beep(660, 70, 'triangle', 0.1);
        if (event === 'bossWindupGold') beep(440, 120, 'sine', 0.12);
        if (event === 'bossWindupRed') beep(440, 120, 'sine', 0.12);
        if (event === 'playerDefeated') beep(80, 500, 'sawtooth', 0.2);
      }
    },
  };
}
