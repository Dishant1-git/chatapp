// 🎤 Voice messages and 📹 video notes, recorded in the browser with MediaRecorder.
// The recording is encrypted like a photo before it's uploaded (see lib/e2ee.js).

export const MAX_VOICE_SECONDS = 5 * 60;
export const MAX_VIDEO_SECONDS = 60;
export const WAVEFORM_BARS = 40;

// First format the browser can record, best first (Safari only does MP4)
const TYPES = {
  audio: ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'],
  video: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm'],
};

export function canRecord() {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && Boolean(navigator.mediaDevices?.getUserMedia);
}

function pickType(kind) {
  return TYPES[kind].find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

// A friendly message for a getUserMedia() failure
export function deviceError(err, kind) {
  const device = kind === 'video' ? 'camera and microphone' : 'microphone';
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
    return `Access to your ${device} was blocked. Allow it in your browser's site settings.`;
  }
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return `No ${device} found.`;
  if (err?.name === 'NotReadableError') return `Your ${device} is being used by another app.`;
  return `Could not start the ${device}.`;
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// Squeezes the loudness samples into a fixed number of bars from 0 to 31
function toWaveform(levels) {
  if (!levels.length) return [];
  const bars = [];
  const perBar = levels.length / WAVEFORM_BARS;
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    const slice = levels.slice(Math.floor(i * perBar), Math.max(Math.floor((i + 1) * perBar), Math.floor(i * perBar) + 1));
    bars.push(slice.length ? Math.max(...slice) : 0);
  }
  const loudest = Math.max(...bars) || 1;
  return bars.map((v) => Math.round((v / loudest) * 31));
}

// Starts recording a stream from getUserMedia(). onLevel(0..1) is called about
// 10 times a second with the current loudness, for a live meter.
// Returns { stop, cancel }: stop() resolves to { blob, duration, waveform }.
export function startRecording(stream, { kind, onLevel } = {}) {
  const mimeType = pickType(kind);
  const recorder = new MediaRecorder(stream, {
    ...(mimeType && { mimeType }),
    // Low bitrates keep files small: voice ≈ 240 KB/min, video ≈ 7 MB/min
    audioBitsPerSecond: kind === 'audio' ? 32000 : 64000,
    ...(kind === 'video' && { videoBitsPerSecond: 850000 }),
  });
  const chunks = [];
  recorder.ondataavailable = (event) => event.data?.size && chunks.push(event.data);

  // Loudness meter, which also becomes the voice message's waveform
  const levels = [];
  let audioContext = null;
  let meter = null;
  try {
    audioContext = new AudioContext();
    audioContext.resume?.();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    meter = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += ((s - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 3);
      levels.push(level);
      onLevel?.(level);
    }, 100);
  } catch {
    // No meter (very old browser); the recording still works
  }

  const startedAt = performance.now();
  recorder.start(250);

  function cleanUp() {
    clearInterval(meter);
    audioContext?.close().catch(() => {});
    stopStream(stream);
  }

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        const duration = Math.round((performance.now() - startedAt) / 100) / 10;
        recorder.onstop = () => {
          cleanUp();
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || `${kind}/webm` });
          if (!blob.size) return reject(new Error('Nothing was recorded.'));
          resolve({ blob, duration, waveform: toWaveform(levels) });
        };
        if (recorder.state === 'inactive') recorder.onstop();
        else recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      cleanUp();
    },
  };
}
