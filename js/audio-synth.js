// ===== ГЕНЕРАЦИЯ ЗВУКА ПИАНИНО С ОПТИМИЗАЦИЕЙ =====

// Кэш семплов по контексту: WeakMap<AudioContext, Map<frequency, AudioBuffer>>
const sampleCacheByContext = new WeakMap();

function getSampleCache(ctx) {
    if (!sampleCacheByContext.has(ctx)) {
        sampleCacheByContext.set(ctx, new Map());
    }
    return sampleCacheByContext.get(ctx);
}

// Экспортируемая функция для создания осциллятора
export function createAdvancedOscillator(audioContext, frequency, type, time) {
    return createPiano(audioContext, frequency, audioContext.currentTime + time);
}

// Генерация семпла пианино с envelope и гармониками
function generatePianoSample(ctx, freq) {
    const sampleRate = ctx.sampleRate;
    const duration = 5; // Длительность семпла в секундах
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    
    // Параметры
    const attackTime = 0.01;
    const decayTime = Math.max(2, 5 - Math.log10(freq / 100));
    const harmonicFactor = Math.min(1, freq / 500);
    
    // Генерация волны
    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let sample = 0;
        
        // Envelope: атака + экспоненциальное затухание
        let envelope = 1;
        if (t < attackTime) {
            envelope = t / attackTime;
        } else {
            const decayProgress = (t - attackTime) / decayTime;
            envelope = Math.exp(-decayProgress * 5);
        }
        if (envelope < 0.001) envelope = 0;
        
        // Основной тон + гармоники
        sample += Math.sin(2 * Math.PI * freq * t);
        sample += 0.3 * harmonicFactor * Math.sin(2 * Math.PI * freq * 2 * t);
        sample += 0.15 * harmonicFactor * Math.sin(2 * Math.PI * freq * 3 * t);
        sample += 0.08 * harmonicFactor * Math.sin(2 * Math.PI * freq * 4 * t);
        
        // Простой фильтр
        const filterFreq = Math.min(5000, 3000 + (freq / 1000) * 1000);
        const cutoff = filterFreq / (sampleRate / 2);
        const filterGain = 1 / (1 + (t * cutoff) ** 2);
        sample *= filterGain;
        
        data[i] = sample * envelope * 0.5;
    }
    
    return buffer;
}

// Функция создания звука пианино с использованием семпла
function createPiano(ctx, freq, time) {
    // Получаем кэш для этого контекста
    const cache = getSampleCache(ctx);
    
    // Проверяем кэш
    if (!cache.has(freq)) {
        cache.set(freq, generatePianoSample(ctx, freq));
    }
    const buffer = cache.get(freq);
    
    // Создаём источник из буфера
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    // Финальный gain
    const postGain = ctx.createGain();
    postGain.gain.setValueAtTime(1.0, time);
    source.connect(postGain);
    
    // Автоматический старт и стоп
    source.start(time);
    source.stop(time + buffer.duration);
    
    return { 
        oscillator: source, // ← ИСПРАВЛЕНО: source → oscillator для совместимости
        gainNode: postGain, 
        extras: []
    };
}
