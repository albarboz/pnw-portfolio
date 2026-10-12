/**
 * Ambient wind: looped brown noise through a low-pass filter, with two slow LFOs for gusts.
 * No audio files needed. To use a recording instead, drop it in public/audio and swap the source.
 */
export function createWind(button: HTMLButtonElement, label: HTMLElement) {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;

  const build = () => {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    ctx = new Ctx();

    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.2;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 520;
    lowpass.Q.value = 0.6;

    const gust = ctx.createGain();
    gust.gain.value = 0.55;

    const gustLfo = ctx.createOscillator();
    gustLfo.frequency.value = 0.07;
    const gustAmount = ctx.createGain();
    gustAmount.gain.value = 0.35;
    gustLfo.connect(gustAmount).connect(gust.gain);

    const toneLfo = ctx.createOscillator();
    toneLfo.frequency.value = 0.11;
    const toneAmount = ctx.createGain();
    toneAmount.gain.value = 260;
    toneLfo.connect(toneAmount).connect(lowpass.frequency);

    master = ctx.createGain();
    master.gain.value = 0;
    source.connect(lowpass).connect(gust).connect(master).connect(ctx.destination);
    source.start();
    gustLfo.start();
    toneLfo.start();
    return true;
  };

  button.addEventListener('click', async () => {
    const turnOn = button.getAttribute('aria-pressed') !== 'true';
    if (turnOn && !ctx && !build()) {
      label.textContent = 'Audio unavailable';
      return;
    }
    if (!ctx || !master) return;
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(turnOn ? 0.5 : 0, now + 1.2);
    button.setAttribute('aria-pressed', String(turnOn));
    label.textContent = turnOn ? 'Wind on' : 'Wind off';
  });
}
