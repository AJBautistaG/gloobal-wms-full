type VentanaConAudio = Window & { webkitAudioContext?: typeof AudioContext };

let contexto: AudioContext | null = null;

/** Vibración corta y tono de confirmación, como el lector de un PDA real. */
export function pitido() {
  try {
    navigator.vibrate?.(35);
    const Ctor = window.AudioContext ?? (window as VentanaConAudio).webkitAudioContext;
    if (!Ctor) return;
    contexto ??= new Ctor();
    const oscilador = contexto.createOscillator();
    const ganancia = contexto.createGain();
    oscilador.frequency.value = 1320;
    ganancia.gain.value = 0.06;
    oscilador.connect(ganancia).connect(contexto.destination);
    oscilador.start();
    oscilador.stop(contexto.currentTime + 0.08);
  } catch {
    // Sin audio o vibración disponibles: la confirmación visual basta.
  }
}
