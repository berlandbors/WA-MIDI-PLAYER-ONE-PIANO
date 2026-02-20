// ===== PIANO SYNTHESIS USING TONE.JS =====
import { createAdvancedOscillator as createBufferOscillator } from './audio-synth.js';

// Early release offset in seconds: triggers release slightly before the scheduled stop
const RELEASE_OFFSET = 0.1;

// Sustain pedal state and sustained notes
let sustainPedalDown = false;
const sustainedNotes = new Set();

// Module-level instruments and effects (lazy-initialized)
let piano = null;
let polySynth = null;
let samplerLoaded = false;

// Exposed effect nodes for UI control
export let pianoReverb = null;
export let pianoEQ = null;

// Build the effects chain: compressor -> EQ -> reverb -> destination
function buildEffectsChain() {
    pianoReverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.01, wet: 0.2 }).toDestination();
    pianoEQ = new Tone.EQ3({ low: 2, mid: 0, high: -3, lowFrequency: 200, highFrequency: 3000 }).connect(pianoReverb);
    const compressor = new Tone.Compressor({ threshold: -20, ratio: 4, attack: 0.003, release: 0.1 }).connect(pianoEQ);
    return compressor;
}

// FM fallback synth (used when sampler samples are not yet loaded)
function createFMSynth(chain) {
    return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01,
        modulationIndex: 14,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0.1, release: 1.5 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 }
    }).connect(chain);
}

// Initialize sampler and FM fallback
function initInstruments() {
    if (piano !== null) return; // already initialized
    const chain = buildEffectsChain();

    // FM fallback polyphonic synth
    polySynth = createFMSynth(chain);

    // Salamander Grand Piano sampler
    piano = new Tone.Sampler({
        urls: {
            A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
            A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
            A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
            A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
            A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
            A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
            A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
            A7: 'A7.mp3', C8: 'C8.mp3'
        },
        release: 1,
        baseUrl: 'https://tonejs.github.io/audio/salamander/',
        onload: () => { samplerLoaded = true; }
    }).connect(chain);
}

// Choose the active synth instrument
function getActiveSynth() {
    return samplerLoaded ? piano : polySynth;
}

// Convert Hz frequency to a note name understood by Tone.Sampler / PolySynth
function freqToNote(frequency) {
    return Tone.Frequency(frequency, 'hz').toNote();
}

// Velocity-sensitive gain: maps MIDI 0-127 to 0.2-1.0
function velocityToGain(velocity) {
    return (velocity / 127) * 0.8 + 0.2;
}

// Sustain pedal control
export function setPedalDown(isDown) {
    sustainPedalDown = isDown;
    if (!isDown) {
        const synth = getActiveSynth();
        if (synth) {
            sustainedNotes.forEach(note => { synth.triggerRelease(note); });
        }
        sustainedNotes.clear();
    }
}

// Exported function compatible with current API
export function createAdvancedOscillator(audioContext, frequency, type, time, velocity = 127) {
    // For offline rendering (WAV export), fall back to buffer-based approach
    if (audioContext instanceof OfflineAudioContext) {
        return createBufferOscillator(audioContext, frequency, type, time, velocity);
    }
    initInstruments();
    return createTonePiano(frequency, time, velocity);
}

// Release all currently playing Tone.js notes
export function releaseAll() {
    if (piano) {
        piano.releaseAll();
        polySynth.releaseAll();
    }
    sustainedNotes.clear();
}

// Main synthesis function using Tone.js
function createTonePiano(frequency, time, velocity) {
    const noteName = freqToNote(frequency);
    const gain = velocityToGain(velocity);
    let startSynth = null; // captured at start() to ensure start/stop use the same instance

    const oscillator = {
        start: (startTime) => {
            startSynth = getActiveSynth();
            startSynth.triggerAttack(noteName, startTime, gain);
            if (sustainPedalDown) {
                sustainedNotes.add(noteName);
            }
        },
        stop: (stopTime) => {
            if (sustainPedalDown) {
                sustainedNotes.add(noteName); // track so pedal release will stop this note
                return;
            }
            const synth = startSynth || getActiveSynth();
            synth.triggerRelease(noteName, Math.max(stopTime - RELEASE_OFFSET, Tone.now()));
        }
    };

    // gainNode is null: Tone.js handles routing to Tone.Destination internally
    return { oscillator, gainNode: null, extras: [], duration: 0 };
}
