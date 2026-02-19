// ===== ГЕНЕРАЦИЯ ЗВУКА ПИАНИНО ЧЕРЕЗ ООП (ПОЛНАЯ ВЕРСИЯ) =====

// Кэш семплов: Map<cacheKey, AudioBuffer>
const sampleCache = new Map();

// Глобальные настройки
let globalPedalDown = false;
let globalReverbAmount = 0.15;

// Экспортируемая функция для создания осциллятора
export function createAdvancedOscillator(audioContext, frequency, type, time, velocity = 127) {
    return createPiano(audioContext, frequency, time, velocity);
}

// Управление педалью (вызывать из UI)
export function setPedalDown(isDown) {
    globalPedalDown = isDown;
}

// Управление реверберацией (0.0 - 1.0)
export function setReverbAmount(amount) {
    globalReverbAmount = Math.max(0, Math.min(1, amount));
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
    
    // Метод для генерации семпла
    generateSample(ctx) {
        const sampleRate = ctx.sampleRate;
        const pedalMultiplier = globalPedalDown ? 2.5 : 1.0; // Педаль увеличивает затухание
        const duration = Math.max(5, this.decay * pedalMultiplier);
        const length = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        
        // Детюнинг для реалистичности
        const detune = 1 + (Math.random() - 0.5) * 0.001;
        const actualFreq = this.frequency * detune;
        
        // ADSR параметры
        const attackTime = this.getAttackTime() * this.attackMultiplier;
        const decayTime = this.getDecayTime();
        const sustainLevel = this.getSustainLevel();
        const releaseTime = this.decay * pedalMultiplier;
        
        // Буфер для реверберации (простая задержка)
        const reverbBuffer = [];
        const reverbDelay = Math.floor(sampleRate * 0.03); // 30ms задержка
        
        // Генерация волны
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            let sample = 0;
            
            // ADSR ENVELOPE
            const envelope = this.calculateEnvelope(t, attackTime, decayTime, sustainLevel, releaseTime);
            if (envelope < 0.001) {
                data[i] = 0;
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
            if (globalPedalDown) {
                sample += this.generateStringResonance(actualFreq, t);
            }
            
            // ДИНАМИЧЕСКИЙ ФИЛЬТР
            sample *= this.applyDynamicFilter(actualFreq, t);
            
            // ПРИМЕНЕНИЕ ENVELOPE
            sample *= envelope;
            
            // РЕВЕРБЕРАЦИЯ (простая)
            if (globalReverbAmount > 0 && i >= reverbDelay) {
                const reverbSample = reverbBuffer[i - reverbDelay] || 0;
                sample += reverbSample * globalReverbAmount * 0.3;
            }
            reverbBuffer[i] = sample;
            
            // МЯГКОЕ ОГРАНИЧЕНИЕ
            const normalized = sample * this.volume;
            data[i] = Math.tanh(normalized * 1.5) * 0.7;
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
    
    applyDynamicFilter(freq, t) {
        const filterCutoff = 2000 + this.brightness * 3000;
        const filterDecay = Math.exp(-t * (1 / this.decay));
        const filterFreq = filterCutoff * (0.3 + 0.7 * filterDecay);
        return 1 / (1 + Math.pow(freq * 4 / filterFreq, 2));
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
function generatePianoSample(ctx, freq, velocity, variant) {
    const note = PianoNoteFactory.createNote(freq, velocity, variant);
    return note.generateSample(ctx);
}

function createPiano(ctx, freq, time, velocity = 127, variant = 'standard') {
    const midiNote = Math.round(12 * Math.log2(freq / 440) + 69);
    const cacheKey = `${midiNote}_${velocity}_${variant}_${globalPedalDown}_${globalReverbAmount.toFixed(2)}`;
    
    // Проверяем кэш
    if (!sampleCache.has(cacheKey)) {
        // Ограничиваем размер кэша (максимум 200 семплов)
        if (sampleCache.size > 200) {
            const firstKey = sampleCache.keys().next().value;
            sampleCache.delete(firstKey);
        }
        sampleCache.set(cacheKey, generatePianoSample(ctx, freq, velocity, variant));
    }
    const buffer = sampleCache.get(cacheKey);
    
    // Создаём источник из буфера
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    // Финальный gain
    const postGain = ctx.createGain();
    postGain.gain.setValueAtTime(1.0, time);
    source.connect(postGain);
    
    return { 
        oscillator: source,
        gainNode: postGain,
        extras: [],
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
