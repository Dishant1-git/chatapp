// Notification and call sounds made with the Web Audio API, so no sound files are needed
let audioContext = null;

export function unlockAudio() {
  // Browsers only allow sound after the user has interacted with the page
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch {
    audioContext = null;
  }
}

function tone(frequencies, start, length, volume) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  frequencies.forEach(([frequency, at]) => oscillator.frequency.setValueAtTime(frequency, start + at));
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + length - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.02);
}

function canPlay() {
  return audioContext && audioContext.state === 'running';
}

// A short two-tone "ping" for new messages
export function playNotificationSound() {
  if (!canPlay()) return;
  const now = audioContext.currentTime;
  tone([[880, 0], [1320, 0.09]], now, 0.3, 0.12);
}

// Repeats a pattern until the returned stop() is called
function loop(play, everyMs) {
  if (!canPlay()) return () => {};
  play(audioContext.currentTime);
  const timer = setInterval(() => canPlay() && play(audioContext.currentTime), everyMs);
  return () => clearInterval(timer);
}

// Incoming call: a bright double ring
export function startRingtone() {
  return loop((now) => {
    tone([[1046, 0], [1318, 0.12]], now, 0.4, 0.18);
    tone([[1046, 0], [1318, 0.12]], now + 0.55, 0.4, 0.18);
  }, 2500);
}

// Outgoing call: the soft "ringing" tone you hear while waiting
export function startRingback() {
  return loop((now) => tone([[440, 0]], now, 1.2, 0.06), 3500);
}

export function playHangupSound() {
  if (!canPlay()) return;
  const now = audioContext.currentTime;
  tone([[480, 0], [360, 0.15]], now, 0.35, 0.1);
}
