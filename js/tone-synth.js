// ===== PIANO SYNTHESIS USING TONE.JS =====
import { createAdvancedOscillator as createBufferOscillator } from './audio-synth.js';

// Early release offset in seconds: triggers release slightly before the scheduled stop
const RELEASE_OFFSET = 0.1;

// Module-level polyphonic synth (lazy-initialized)
let polySynth = null;

function getToneSynth() {
    if (!polySynth) {
        const reverb = new Tone.Reverb({ decay: 2, wet: 0.3 }).toDestination();
        polySynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: {
                attack: 0.005,
                decay: 0.1,
                sustain: 0.6,
                release: 1.5
            }
        }).connect(reverb);
    }
    return polySynth;
}

// Exported function compatible with current API
export function createAdvancedOscillator(audioContext, frequency, type, time, velocity = 127) {
    // For offline rendering (WAV export), fall back to buffer-based approach
    if (audioContext instanceof OfflineAudioContext) {
        return createBufferOscillator(audioContext, frequency, type, time, velocity);
    }
    return createTonePiano(frequency, time, velocity);
}

// Release all currently playing Tone.js notes
export function releaseAll() {
    if (polySynth) {
        polySynth.releaseAll();
    }
}

// Main synthesis function using Tone.js
function createTonePiano(frequency, time, velocity) {
    const synth = getToneSynth();
    const velocityNormalized = velocity / 127;

    // Return a compatible oscillator-like object with start/stop
    const oscillator = {
        start: (startTime) => {
            synth.triggerAttack(frequency, startTime, velocityNormalized);
        },
        stop: (stopTime) => {
            // Release slightly before the scheduled stop time
            synth.triggerRelease(frequency, Math.max(stopTime - RELEASE_OFFSET, Tone.now()));
        }
    };

    // gainNode is null: Tone.js handles routing to Tone.Destination internally
    return { oscillator, gainNode: null, extras: [], duration: 0 };
}
