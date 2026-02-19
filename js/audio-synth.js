// ===== ГЕНЕРАЦИЯ ЗВУКА ПИАНИНО ЧЕРЕЗ ООП (ПОЛНАЯ ВЕРСИЯ) =====

// Кэш семплов: Map<cacheKey, AudioBuffer>
const sampleCache = new Map();
const baseSampleCache = new Map(); // Базовые семплы без эффектов педали/реверба

// Глобальные настройки
let globalPedalDown = false;
let globalReverbAmount = 0.15;
let convolverBuffer = null; // Буфер для convolution reverb
let isPreGenerating = false;

// Экспортируемая функция для создания осциллятора
export function createAdvancedOscillator(audioContext, frequency, type, time, velocity = 127) {
    return createPiano(audioContext, frequency, time, velocity);
}

// Управление педалью (вызывать из UI)
export function setPedalDown(isDown) {
    const wasDown = globalPedalDown;
    globalPedalDown = isDown;
    if (wasDown !== isDown) {
        invalidatePedalCache();
    }
}

// Управление реверберацией (0.0 - 1.0)
export function setReverbAmount(amount) {
    globalReverbAmount = Math.max(0, Math.min(1, amount));
}

// Предварительная генерация базовых семплов
export async function preGenerateSamples(ctx, velocities = [64, 96, 127]) {
    if (isPreGenerating) return;
    isPreGenerating = true;
    
    const midiNotes = [21, 28, 36, 45, 52, 60, 69, 76, 84, 93, 100, 108];
    const variants = ['standard'];
    
    for (const midi of midiNotes) {
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        for (const vel of velocities) {
            for (const variant of variants) {
                const cacheKey = `base_${midi}_${vel}_${variant}`;
                if (!baseSampleCache.has(cacheKey)) {
                    baseSampleCache.set(cacheKey, generatePianoSample(ctx, freq, vel, variant, false, false));
                }
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }
    
    isPreGenerating = false;
    console.log('Pre-generation complete:', baseSampleCache.size, 'samples cached');
}

// Создание импульсной характеристики для convolution reverb
export function createReverbImpulse(ctx, duration = 2.0, decay = 2.0) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-decay * t);
        
        // Алгоритм Schroeder для реалистичной реверберации
        const noise = (Math.random() * 2 - 1) * envelope;
        const earlyReflection = i < sampleRate * 0.05 ? Math.cos(i * 0.01) * envelope : 0;
        
        left[i] = noise + earlyReflection;
        right[i] = (Math.random() * 2 - 1) * envelope + earlyReflection * 0.8;
    }
    
    convolverBuffer = impulse;
    return impulse;
}

// Инвалидация кэша при изменении педали (только для affected семплов)
function invalidatePedalCache() {
    const keysToDelete = [];
    for (const key of sampleCache.keys()) {
        if (key.includes('_true_') || key.includes('_false_')) {
            keysToDelete.push(key);
        }
    }
    keysToDelete.forEach(key => sampleCache.delete(key));
    console.log(`Invalidated ${keysToDelete.length} pedal-affected samples`);
}

// ========== БАЗОВЫЙ КЛАСС ДЛЯ НОТЫ ==========
class PianoNote {
    constructor(midiNote, frequency, velocity = 127, variant = 'standard') {
        this.midiNote = midiNote;
        this.frequency = frequency;
        this.velocity = velocity; // 0-127 (MIDI velocity)
        this.variant = variant; // 'standard', 'bright', 'mellow', 'vintage'
        this.register = this.determineRegister();
        this.initializeParameters();
        this.applyVariant();
        this.applyVelocity();
    }
    
    determineRegister() {
        if (this.midiNote <= 32) return 'ultra-low';
        if (this.midiNote <= 44) return 'very-low';
        if (this.midiNote <= 56) return 'low';
        if (this.midiNote <= 68) return 'mid-low';
        if (this.midiNote <= 80) return 'mid';
        if (this.midiNote <= 92) return 'mid-high';
        if (this.midiNote <= 104) return 'high';
        return 'very-high';
    }
    
    initializeParameters() {
        // Базовые параметры (будут переопределены в подклассах)
        this.decay = 5.0;
        this.brightness = 0.8;
        this.inharmonicity = 0.0002;
        this.hammerNoise = 0.05;
        this.resonance = 0.15;
        this.volume = 0.45;
        this.harmonics = this.getDefaultHarmonics();
    }
    
    getDefaultHarmonics() {
        return [
            { n: 1, amp: 1.0 },
            { n: 2, amp: 0.35 },
            { n: 3, amp: 0.22 },
            { n: 4, amp: 0.13 },
            { n: 5, amp: 0.08 }
        ];
    }
    
    applyVariant() {
        const variants = {
            'bright': { brightnessMultiplier: 1.3, volumeMultiplier: 1.05, harmMultiplier: 1.2 },
            'mellow': { brightnessMultiplier: 0.7, volumeMultiplier: 0.95, harmMultiplier: 0.8 },
            'vintage': { brightnessMultiplier: 0.85, volumeMultiplier: 1.0, harmMultiplier: 0.9 },
            'standard': { brightnessMultiplier: 1.0, volumeMultiplier: 1.0, harmMultiplier: 1.0 }
        };
        
        const v = variants[this.variant] || variants['standard'];
        this.brightness *= v.brightnessMultiplier;
        this.volume *= v.volumeMultiplier;
        this.harmonics = this.harmonics.map(h => ({
            n: h.n,
            amp: h.amp * (h.n === 1 ? 1 : v.harmMultiplier)
        }));
    }
    
    applyVelocity() {
        // Velocity влияет на громкость, яркость и шум молоточка
        const velocityFactor = this.velocity / 127;
        
        // Громкость: логарифмическая зависимость (как в реальном MIDI)
        this.volume *= 0.4 + 0.6 * velocityFactor;
        
        // Яркость: тихие ноты темнее
        this.brightness *= 0.7 + 0.3 * velocityFactor;
        
        // Шум молоточка: сильнее при громких нотах
        this.hammerNoise *= 0.5 + 0.5 * velocityFactor;
        
        // Атака: быстрее при громких нотах
        this.attackMultiplier = 0.8 + 0.2 * velocityFactor;
    }
    
    // Метод для генерации семпла (СТЕРЕО + оптимизация)
    generateSample(ctx, usePedal = true, useReverb = true) {
        const sampleRate = ctx.sampleRate;
        const pedalMultiplier = (usePedal && globalPedalDown) ? 2.5 : 1.0;
        const duration = Math.max(5, this.decay * pedalMultiplier);
        const length = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, length, sampleRate); // СТЕРЕО!
        const dataLeft = buffer.getChannelData(0);
        const dataRight = buffer.getChannelData(1);
        
        // Детюнинг для реалистичности
        const detune = 1 + (Math.random() - 0.5) * 0.001;
        const actualFreq = this.frequency * detune;
        
        // ADSR параметры
        const attackTime = this.getAttackTime() * this.attackMultiplier;
        const decayTime = this.getDecayTime();
        const sustainLevel = this.getSustainLevel();
        const releaseTime = this.decay * pedalMultiplier;
        
        // Стерео параметры
        const stereoWidth = 0.3; // Ширина стерео поля
        const panPosition = (this.midiNote - 64.5) / 87 * 0.4; // Панорамирование по клавиатуре
        
        // Буфер для реверберации
        const reverbBufferL = [];
        const reverbBufferR = [];
        const reverbDelay = Math.floor(sampleRate * 0.03);
        const reverbAmount = useReverb ? globalReverbAmount : 0;
        
        // Генерация волны
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            let sample = 0;
            
            // ADSR ENVELOPE (раннее прерывание для оптимизации)
            const envelope = this.calculateEnvelope(t, attackTime, decayTime, sustainLevel, releaseTime);
            if (envelope < 0.001) {
                dataLeft[i] = 0;
                dataRight[i] = 0;
                continue;
            }
            
            // ГАРМОНИКИ С ИНХАРМОНИЧНОСТЬЮ
            sample += this.generateHarmonics(actualFreq, t);
            
            // ШУМ УДАРА МОЛОТОЧКА
            if (t < 0.01) {
                sample += this.generateHammerNoise(t);
            }
            
            // РЕЗОНАНС ДЕКИ
            sample += this.generateBodyResonance(actualFreq, t);
            
            // СТРУННЫЙ РЕЗОНАНС (симпатические струны)
            if (usePedal && globalPedalDown) {
                sample += this.generateStringResonance(actualFreq, t);
            }
            
            // ПРИМЕНЕНИЕ ENVELOPE
            sample *= envelope;
            
            // СТЕРЕО ДЕКОРРЕЛЯЦИЯ
            const stereoDelay = Math.sin(t * actualFreq * 2 * Math.PI) * stereoWidth * 0.001;
            const sampleLeft = sample * (1 + stereoDelay);
            const sampleRight = sample * (1 - stereoDelay);
            
            // РЕВЕРБЕРАЦИЯ (улучшенная стерео)
            let finalLeft = sampleLeft;
            let finalRight = sampleRight;
            
            if (reverbAmount > 0 && i >= reverbDelay) {
                const reverbL = reverbBufferL[i - reverbDelay] || 0;
                const reverbR = reverbBufferR[i - reverbDelay] || 0;
                finalLeft += reverbL * reverbAmount * 0.3;
                finalRight += reverbR * reverbAmount * 0.3;
            }
            reverbBufferL[i] = sampleLeft;
            reverbBufferR[i] = sampleRight;
            
            // ПАНОРАМИРОВАНИЕ (constant power panning)
            const panAngle = (panPosition + 1) * Math.PI / 4;
            const leftGain = Math.cos(panAngle);
            const rightGain = Math.sin(panAngle);
            
            // МЯГКОЕ ОГРАНИЧЕНИЕ
            const normalizedLeft = finalLeft * this.volume * leftGain;
            const normalizedRight = finalRight * this.volume * rightGain;
            
            dataLeft[i] = Math.tanh(normalizedLeft * 1.5) * 0.7;
            dataRight[i] = Math.tanh(normalizedRight * 1.5) * 0.7;
        }
        
        return buffer;
    }
    
    getAttackTime() {
        return 0.005; // 5ms
    }
    
    getDecayTime() {
        return 0.08; // 80ms
    }
    
    getSustainLevel() {
        return 0.6;
    }
    
    calculateEnvelope(t, attackTime, decayTime, sustainLevel, releaseTime) {
        if (t < attackTime) {
            // Нелинейная атака (быстрее в начале)
            return Math.pow(t / attackTime, 0.8);
        } else if (t < attackTime + decayTime) {
            const decayProgress = (t - attackTime) / decayTime;
            return 1 - (1 - sustainLevel) * decayProgress;
        } else {
            const releaseProgress = (t - attackTime - decayTime) / releaseTime;
            return sustainLevel * Math.exp(-releaseProgress * 4);
        }
    }
    
    generateHarmonics(freq, t) {
        let sample = 0;
        for (let h of this.harmonics) {
            const inharmonicFactor = 1 + h.n * h.n * this.inharmonicity;
            const harmonicFreq = freq * h.n * inharmonicFactor;
            const harmonicDecay = Math.exp(-t * h.n * 0.3);
            sample += h.amp * Math.sin(2 * Math.PI * harmonicFreq * t) * harmonicDecay;
        }
        return sample;
    }
    
    generateHammerNoise(t) {
        const noiseEnvelope = Math.exp(-t * 200);
        return (Math.random() - 0.5) * this.hammerNoise * noiseEnvelope;
    }
    
    generateBodyResonance(freq, t) {
        return this.resonance * Math.sin(2 * Math.PI * freq * 0.5 * t) * Math.exp(-t * 2);
    }
    
    generateStringResonance(freq, t) {
        // Симпатические струны резонируют при нажатой педали
        const octaveDown = freq * 0.5;
        const octaveUp = freq * 2;
        const resonance = 
            0.05 * Math.sin(2 * Math.PI * octaveDown * t) * Math.exp(-t * 3) +
            0.03 * Math.sin(2 * Math.PI * octaveUp * t) * Math.exp(-t * 4);
        return resonance;
    }
}

// ========== СПЕЦИАЛИЗИРОВАННЫЕ КЛАССЫ ДЛЯ РЕГИСТРОВ ==========

class UltraLowNote extends PianoNote {
    initializeParameters() {
        const offset = 32 - this.midiNote;
        this.decay = 12 + offset * 0.3; // 12-15.3 сек
        this.brightness = 0.32; // Увеличено с 0.28
        this.inharmonicity = 0.0008 + offset * 0.00005;
        this.hammerNoise = 0.09; // Увеличено
        this.resonance = 0.28; // Увеличено
        this.volume = 0.42 + offset * 0.018; // Увеличено
        this.harmonics = [
            { n: 1, amp: 1.0 },
            { n: 2, amp: 0.55 }, // Усилены гармоники
            { n: 3, amp: 0.38 },
            { n: 4, amp: 0.24 },
            { n: 5, amp: 0.16 },
            { n: 6, amp: 0.11 },
            { n: 7, amp: 0.07 },
            { n: 0.5, amp: 0.15 } // Субгармоника для глубины!
        ];
    }
    
    getSustainLevel() {
        return 0.78; // Увеличено
    }
}

class VeryLowNote extends PianoNote {
    initializeParameters() {
        const offset = 44 - this.midiNote;
        this.decay = 10 + offset * 0.15; // 10-11.8 сек
        this.brightness = 0.42; // Увеличено
        this.inharmonicity = 0.0005;
        this.hammerNoise = 0.075;
        this.resonance = 0.24; // Увеличено
        this.volume = 0.45; // Увеличено
        this.harmonics = [
            { n: 1, amp: 1.0 },
            { n: 2, amp: 0.52 },
            { n: 3, amp: 0.34 },
            { n: 4, amp: 0.22 },
            { n: 5, amp: 0.15 },
            { n: 6, amp: 0.10 },
            { n: 7, amp: 0.06 }
        ];
    }
    
    getSustainLevel() {
        return 0.74;
    }
}

class LowNote extends PianoNote {
    initializeParameters() {
        const offset = 56 - this.midiNote;
        this.decay = 8 + offset * 0.1; // 8-9.2 сек
        this.brightness = 0.52; // Увеличено
        this.inharmonicity = 0.0003;
        this.hammerNoise = 0.065;
        this.resonance = 0.20; // Увеличено
        this.volume = 0.47; // Увеличено
        this.harmonics = [
            { n: 1, amp: 1.0 },
            { n: 2, amp: 0.48 },
            { n: 3, amp: 0.32 },
            { n: 4, amp: 0.20 },
            { n: 5, amp: 0.13 },
            { n: 6, amp: 0.08 }
        ];
    }
    
    getSustainLevel() {
        return 0.70;
    }
}

class MidLowNote extends PianoNote {
    initializeParameters() {
        this.decay = 6.5;
        this.brightness = 0.68;
        this.inharmonicity = 0.0002;
        this.hammerNoise = 0.055;
        this.resonance = 0.16;
        this.volume = 0.48;
        this.harmonics = [
            { n: 1, amp: 1.0 },
            { n: 2, amp: 0.42 },
            { n: 3, amp: 0.27 },
            { n: 4, amp: 0.16 },
            { n: 5, amp: 0.10 },
            { n: 6, amp: 0.06 }
        ];
    }
    
    getSustainLevel() {
        return 0.65;
    }
}

class MidNote extends PianoNote {
    initializeParameters() {
        this.decay = 5.5;
        this.brightness = 0.82;
        this.inharmonicity = 0.00015;
        this.hammerNoise = 0.048;
        this.resonance = 0.13;
        this.volume = 0.49;
        this.harmonics = [
            { n: 1, amp: 1.0 },
            { n: 2, amp: 0.37 },
            { n: 3, amp: 0.24 },
            { n: 4, amp: 0.14 },
            { n: 5, amp: 0.09 }
        ];
    }
    
    getSustainLevel() {
        return 0.62;
    }
}

class MidHighNote extends PianoNote {
    initializeParameters() {
        this.decay = 4.5;
        this.brightness = 0.98;
        this.inharmonicity = 0.0001;
        this.hammerNoise = 0.042;
        this.resonance = 0.11;
        this.volume = 0.51;
        this.harmonics = [
            { n: 1, amp: 1.0 },
            { n: 2, amp: 0.32 },
            { n: 3, amp: 0.20 },
            { n: 4, amp: 0.11 },
            { n: 5, amp: 0.07 }
        ];
    }
    
    getSustainLevel() {
        return 0.59;
    }
}

class HighNote extends PianoNote {
    initializeParameters() {
        this.decay = 3.5;
        this.brightness = 1.15;
        this.inharmonicity = 0.00008;
        this.hammerNoise = 0.038;
        this.resonance = 0.09;
        this.volume = 0.53;
        this.harmonics = [
            { n: 1, amp: 1.0 },
            { n: 2, amp: 0.30 },
            { n: 3, amp: 0.18 },
            { n: 4, amp: 0.10 }
        ];
    }
    
    getSustainLevel() {
        return 0.56;
    }
}

class VeryHighNote extends PianoNote {
    initializeParameters() {
        const offset = 108 - this.midiNote;
        this.decay = 2.5 + offset * 0.1;
        this.brightness = 1.30;
        this.inharmonicity = 0.00006;
        this.hammerNoise = 0.032;
        this.resonance = 0.07;
        this.volume = 0.55;
        this.harmonics = [
            { n: 1, amp: 1.0 },
            { n: 2, amp: 0.27 },
            { n: 3, amp: 0.15 },
            { n: 4, amp: 0.09 }
        ];
    }
    
    getSustainLevel() {
        return 0.53;
    }
    
    getAttackTime() {
        return 0.003; // Более быстрая атака для высоких нот
    }
}

// ========== ФАБРИКА ДЛЯ СОЗДАНИЯ НОТ ==========
class PianoNoteFactory {
    static createNote(frequency, velocity = 127, variant = 'standard') {
        const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
        const clampedMidi = Math.max(21, Math.min(108, midiNote));
        const exactFreq = 440 * Math.pow(2, (clampedMidi - 69) / 12);
        
        let NoteClass;
        if (clampedMidi <= 32) {
            NoteClass = UltraLowNote;
        } else if (clampedMidi <= 44) {
            NoteClass = VeryLowNote;
        } else if (clampedMidi <= 56) {
            NoteClass = LowNote;
        } else if (clampedMidi <= 68) {
            NoteClass = MidLowNote;
        } else if (clampedMidi <= 80) {
            NoteClass = MidNote;
        } else if (clampedMidi <= 92) {
            NoteClass = MidHighNote;
        } else if (clampedMidi <= 104) {
            NoteClass = HighNote;
        } else {
            NoteClass = VeryHighNote;
        }
        
        return new NoteClass(clampedMidi, exactFreq, velocity, variant);
    }
}

// ========== ГЕНЕРАЦИЯ И ВОСПРОИЗВЕДЕНИЕ ==========
function generatePianoSample(ctx, freq, velocity, variant, usePedal = true, useReverb = true) {
    const note = PianoNoteFactory.createNote(freq, velocity, variant);
    return note.generateSample(ctx, usePedal, useReverb);
}

function createPiano(ctx, freq, time, velocity = 127, variant = 'standard') {
    const midiNote = Math.round(12 * Math.log2(freq / 440) + 69);
    const cacheKey = `${midiNote}_${velocity}_${variant}_${globalPedalDown}_${globalReverbAmount.toFixed(2)}`;
    
    // Проверяем кэш
    let buffer;
    if (!sampleCache.has(cacheKey)) {
        // Ограничиваем размер кэша (максимум 300 семплов)
        if (sampleCache.size > 300) {
            const firstKey = sampleCache.keys().next().value;
            sampleCache.delete(firstKey);
        }
        buffer = generatePianoSample(ctx, freq, velocity, variant, true, true);
        sampleCache.set(cacheKey, buffer);
    } else {
        buffer = sampleCache.get(cacheKey);
    }
    
    // Создаём источник из буфера
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    // BiquadFilter для динамической фильтрации (заменяет математический фильтр)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const baseCutoff = 2000 + (velocity / 127) * 3000; // Яркость зависит от velocity
    filter.frequency.setValueAtTime(baseCutoff, time);
    filter.Q.setValueAtTime(1.0, time);
    
    // Автоматическая модуляция фильтра (симуляция затухания яркости)
    const filterDecayTime = 0.5;
    const minCutoff = Math.max(baseCutoff * 0.3, 200); // Минимум 200Hz
    filter.frequency.exponentialRampToValueAtTime(minCutoff, time + filterDecayTime);
    
    // Convolution reverb (если доступен буфер и включена реверберация)
    const convolver = convolverBuffer && globalReverbAmount > 0 ? ctx.createConvolver() : null;
    if (convolver) {
        convolver.buffer = convolverBuffer;
    }
    
    // Gain ноды для микширования dry/wet сигнала
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const masterGain = ctx.createGain();
    
    dryGain.gain.setValueAtTime(1.0, time);
    wetGain.gain.setValueAtTime(globalReverbAmount * 0.5, time);
    masterGain.gain.setValueAtTime(1.0, time);
    
    // Routing: source -> filter -> split(dry/wet) -> masterGain
    source.connect(filter);
    
    if (convolver) {
        // Сплит на сухой и мокрый сигналы
        filter.connect(dryGain);
        filter.connect(convolver);
        convolver.connect(wetGain);
        
        dryGain.connect(masterGain);
        wetGain.connect(masterGain);
    } else {
        filter.connect(masterGain);
    }
    
    return { 
        oscillator: source,
        gainNode: masterGain,
        extras: [filter, convolver, dryGain, wetGain].filter(Boolean),
        duration: buffer.duration
    };
}

// ========== ЭКСПОРТ ДОПОЛНИТЕЛЬНЫХ ФУНКЦИЙ ==========

// Варианты звучания
export function setVariant(variant) {
    // 'standard', 'bright', 'mellow', 'vintage'
    // Использовать при создании нот
    return variant;
}

// Информация о ноте
export function getNoteInfo(frequency) {
    const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
    const note = PianoNoteFactory.createNote(frequency);
    return {
        midiNote: note.midiNote,
        frequency: note.frequency,
        register: note.register,
        decay: note.decay,
        brightness: note.brightness,
        harmonicsCount: note.harmonics.length
    };
}