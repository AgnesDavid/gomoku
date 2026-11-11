const SOUND_KEY = "gomoku.sound.v1";

let enabled = true;
let context = null;
let noiseBuffer = null;
let button = null;

function getNoiseBuffer(audio) {
  if (noiseBuffer && noiseBuffer.sampleRate === audio.sampleRate) return noiseBuffer;
  const length = Math.floor(audio.sampleRate * 0.08);
  noiseBuffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  return noiseBuffer;
}

function readEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveEnabled() {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // 忽略存储失败。
  }
}

function updateButton() {
  if (!button) return;
  button.textContent = enabled ? "音效" : "静音";
  button.setAttribute("aria-label", enabled ? "关闭落子音效" : "开启落子音效");
  button.setAttribute("aria-pressed", String(enabled));
}

function ensureContext() {
  if (!enabled) return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!context) context = new AudioCtor();
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }
  return context;
}

export function playStoneSound() {
  if (!enabled) return;
  const audio = ensureContext();
  if (!audio) return;

  const now = audio.currentTime;
  const pitch = 1 + (Math.random() * 2 - 1) * 0.045;
  const master = audio.createGain();
  master.gain.value = 0.42;
  master.connect(audio.destination);

  // 短促的木质敲击：带通噪声 + 两个快速衰减的共振体。
  const noise = audio.createBufferSource();
  noise.buffer = getNoiseBuffer(audio);
  const bandpass = audio.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1650 * pitch;
  bandpass.Q.value = 0.75;
  const highpass = audio.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 520;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.62, now + 0.002);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
  noise.connect(bandpass);
  bandpass.connect(highpass);
  highpass.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + 0.06);

  const body = audio.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(470 * pitch, now);
  body.frequency.exponentialRampToValueAtTime(285 * pitch, now + 0.055);
  const bodyGain = audio.createGain();
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.2, now + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
  body.connect(bodyGain);
  bodyGain.connect(master);
  body.start(now);
  body.stop(now + 0.085);

  const tick = audio.createOscillator();
  tick.type = "sine";
  tick.frequency.setValueAtTime(1180 * pitch, now);
  tick.frequency.exponentialRampToValueAtTime(760 * pitch, now + 0.025);
  const tickGain = audio.createGain();
  tickGain.gain.setValueAtTime(0.0001, now);
  tickGain.gain.exponentialRampToValueAtTime(0.075, now + 0.002);
  tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
  tick.connect(tickGain);
  tickGain.connect(master);
  tick.start(now);
  tick.stop(now + 0.04);
}

export function initSound() {
  enabled = readEnabled();
  button = document.querySelector("#sound");
  updateButton();

  if (button) {
    button.addEventListener("click", () => {
      enabled = !enabled;
      saveEnabled();
      updateButton();
      if (enabled) {
        ensureContext();
        playStoneSound();
      }
    });
  }

  document.addEventListener(
    "pointerdown",
    () => {
      if (enabled) ensureContext();
    },
    { capture: true, once: true },
  );
}
