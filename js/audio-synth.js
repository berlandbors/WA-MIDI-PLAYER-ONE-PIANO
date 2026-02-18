// ===== ГЕНЕРАЦИЯ ЗВУКА ПИАНИНО С ОПТИМИЗАЦИЕЙ =====

// Кэш семплов: Map<frequency, AudioBuffer>
const sampleCache = new Map();

// Экспортируемая функция для создания осциллятора (в будущем можно расширить)
export function createAdvancedOscillator(audioContext, frequency, type, time) {
    return createPiano(audioContext, frequency, time);
}

// Генерация семпла пианино с envelope и гармониками
function generatePianoSample(ctx, freq) {
    const sampleRate = ctx.sampleRate;
    const duration = 5; // Длительность семпла в секундах (достаточно для затухания)
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate); // Моно
    const data = buffer.getChannelData(0);
    
    // Константы для параметров баса
    const BASS_FREQ_THRESHOLD = 100;  // Граница глубоких басов (A0-G2)
    const TRANSITION_FREQ = 150;      // Конец переходной зоны (D3)
    const BASS_BOOST_FREQ = 130;      // Граница усиления басов (C3)
    const BASS_DECAY_TIME = 8;        // Время затухания для басов
    const MAX_BASS_BOOST = 2.0;       // Максимальное усиление басов
    // Предвычисленные константы для оптимизации
    const TRANSITION_END_DECAY = 4.8239; // Math.max(2, 5 - Math.log10(150 / 100))
    const TRANSITION_RANGE = 50;         // TRANSITION_FREQ - BASS_FREQ_THRESHOLD
    const DECAY_RANGE = 3.1761;          // BASS_DECAY_TIME - TRANSITION_END_DECAY
    
    // Параметры
    const attackTime = 0.01; // Атака
    // Басы на настоящем пианино звучат дольше
    const decayTime = freq < BASS_FREQ_THRESHOLD 
        ? BASS_DECAY_TIME  // Увеличенное затухание для басов (A0-G2)
        : freq < TRANSITION_FREQ  // Плавный переход 100-150 Hz
            ? BASS_DECAY_TIME - (freq - BASS_FREQ_THRESHOLD) * DECAY_RANGE / TRANSITION_RANGE
            : Math.max(2, 5 - Math.log10(freq / 100));
    // Басы получают минимум 50% гармоник для выразительности
    const harmonicFactor = freq < TRANSITION_FREQ
        ? 0.5  // Минимум 50% для низких нот (до D3)
        : Math.min(1, freq / 300); // Плавный переход от 300 Hz (вместо 500)
    // Компенсация громкости для басовых нот
    const bassBoost = freq < BASS_BOOST_FREQ 
        ? Math.min(MAX_BASS_BOOST, 1 + (BASS_BOOST_FREQ - freq) / BASS_BOOST_FREQ)
        : 1;
    
    // Генерация волны
    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let sample = 0;
        
        // Envelope: атака + экспоненциальное затухание
        let envelope = 1;
        if (t < attackTime) {
            envelope = t / attackTime; // Линейная атака
        } else {
            const decayProgress = (t - attackTime) / decayTime;
            envelope = Math.exp(-decayProgress * 5); // Экспоненциальное затухание
        }
        if (envelope < 0.001) envelope = 0; // Обрезка для тишины
        
        // Основной тон + гармоники
        sample += Math.sin(2 * Math.PI * freq * t);
        sample += 0.3 * harmonicFactor * Math.sin(2 * Math.PI * freq * 2 * t);
        sample += 0.15 * harmonicFactor * Math.sin(2 * Math.PI * freq * 3 * t);
        sample += 0.08 * harmonicFactor * Math.sin(2 * Math.PI * freq * 4 * t);
        
        // Простой фильтр (lowpass approximation: уменьшаем верхние частоты)
        const filterFreq = Math.min(5000, 3000 + (freq / 1000) * 1000);
        const cutoff = filterFreq / (sampleRate / 2);
        const filterGain = 1 / (1 + (t * cutoff) ** 2); // Грубо имитируем фильтр
        sample *= filterGain;
        
        data[i] = sample * envelope * 0.5 * bassBoost; // Применяем усиление басов
    }
    
    return buffer;
}

// Функция создания звука пианино с использованием семпла
function createPiano(ctx, freq, time) {
    // Проверяем кэш
    if (!sampleCache.has(freq)) {
        sampleCache.set(freq, generatePianoSample(ctx, freq));
    }
    const buffer = sampleCache.get(freq);
    
    // Создаём источник из буфера
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    // Финальный gain для дополнительного контроля (если нужно)
    const postGain = ctx.createGain();
    postGain.gain.setValueAtTime(1.0, time);
    source.connect(postGain);
    
    return { 
        oscillator: source, // ПЕРЕИМЕНОВАНО: source → oscillator для совместимости
        gainNode: postGain, 
        extras: [], // Нет extras, так как всё в семпле
        duration: buffer.duration // ДОБАВЛЕНО: информация о длительности семпла
    };
}
