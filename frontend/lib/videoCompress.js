// 📹 Shrinking a video before it's sent.
//
// Phone cameras record huge files (a minute can be 100 MB+), so a picked video
// is re-encoded in the browser: smaller picture, lower bitrate, same length.
// It's done by playing the video into a canvas and recording that, which takes
// about as long as the video lasts — hence the progress callback.

import { videoMimeType } from './recording';

export const MAX_VIDEO_SECONDS = 60;
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-matroska'];
// After compressing, a minute lands around 5 MB — well under the server's limit
const MAX_WIDTH = 640;
const VIDEO_BITRATE = 700_000;
const AUDIO_BITRATE = 64_000;
const FPS = 30;

export function isVideoFile(file) {
  return Boolean(file) && (VIDEO_TYPES.includes(file.type) || file.type.startsWith('video/'));
}

// Videos recorded in a browser don't say how long they are until they've been
// read to the end. Jumping far ahead makes the browser work it out.
function waitForDuration(video) {
  return new Promise((resolve, reject) => {
    const known = () => Number.isFinite(video.duration) && video.duration > 0;
    if (known()) return resolve(video.duration);
    const onChange = () => {
      if (!known()) return;
      video.removeEventListener('durationchange', onChange);
      video.currentTime = 0;
      resolve(video.duration);
    };
    video.addEventListener('durationchange', onChange);
    video.currentTime = 1e101;
    setTimeout(() => reject(new Error("This video couldn't be read.")), 8000);
  });
}

// Loads a video's length and size without playing it
export function readVideoInfo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const url = URL.createObjectURL(file);
    const done = (fn, value) => {
      URL.revokeObjectURL(url);
      fn(value);
    };
    video.onloadedmetadata = () => {
      if (!video.videoWidth) return done(reject, new Error("This video couldn't be read."));
      waitForDuration(video).then(
        (duration) => done(resolve, { duration, width: video.videoWidth, height: video.videoHeight }),
        (err) => done(reject, err)
      );
    };
    video.onerror = () => done(reject, new Error("This video couldn't be read."));
    video.src = url;
  });
}

function canCompress() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    typeof (window.AudioContext || window.webkitAudioContext) === 'function'
  );
}

// Re-encodes the video smaller. onProgress(0..1) is called as it goes.
// Returns { blob, duration, mirrored: false }.
export async function compressVideo(file, { onProgress } = {}) {
  const info = await readVideoInfo(file);
  if (info.duration > MAX_VIDEO_SECONDS + 0.5) {
    throw new Error(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds. This one is ${Math.round(info.duration)}s.`);
  }
  if (!canCompress()) return { blob: file, duration: info.duration, mirrored: false };

  const scale = Math.min(1, MAX_WIDTH / Math.max(info.width, info.height));
  const width = Math.round(info.width * scale / 2) * 2; // even numbers encode better
  const height = Math.round(info.height * scale / 2) * 2;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.volume = 0; // the sound is taken from the audio graph, not the speakers

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  let audioContext = null;
  let recorder = null;
  let drawing = 0;

  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error("This video couldn't be read."));
    });

    const tracks = [canvas.captureStream(FPS).getVideoTracks()[0]];

    // The video's sound, routed into the recording without playing out loud
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaElementSource(video).connect(destination);
      const audioTrack = destination.stream.getAudioTracks()[0];
      if (audioTrack) tracks.push(audioTrack);
    } catch {
      // No sound (e.g. a silent video) — the picture is still re-encoded
    }

    const mimeType = videoMimeType();
    recorder = new MediaRecorder(new MediaStream(tracks), {
      ...(mimeType && { mimeType }),
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: AUDIO_BITRATE,
    });
    const chunks = [];
    recorder.ondataavailable = (event) => event.data?.size && chunks.push(event.data);

    const done = new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
        blob.size ? resolve(blob) : reject(new Error('The video could not be prepared.'));
      };
      recorder.onerror = () => reject(new Error('The video could not be prepared.'));
      // Something stalled: don't leave the user waiting forever
      setTimeout(() => reject(new Error('The video took too long to prepare.')), (info.duration + 20) * 1000);
    });

    // One canvas frame per video frame, for as long as it plays
    const draw = () => {
      ctx.drawImage(video, 0, 0, width, height);
      onProgress?.(Math.min(1, video.currentTime / info.duration));
      drawing = requestAnimationFrame(draw);
    };

    recorder.start(250);
    await video.play();
    draw();
    await new Promise((resolve) => {
      video.onended = resolve;
    });
    cancelAnimationFrame(drawing);
    if (recorder.state !== 'inactive') recorder.stop();

    const blob = await done;
    onProgress?.(1);
    // If re-encoding somehow made it bigger, keep the original
    return { blob: blob.size < file.size ? blob : file, duration: info.duration, mirrored: false };
  } finally {
    cancelAnimationFrame(drawing);
    video.pause();
    video.src = '';
    URL.revokeObjectURL(url);
    audioContext?.close().catch(() => {});
  }
}
