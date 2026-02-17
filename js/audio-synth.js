// ===== ГЕНЕРАЦИЯ ЗВУКА ПИАНИНО =====

export function createAdvancedOscillator(audioContext, frequency, type, time) {
    // В будущем можно добавить switch(type) для разных инструментов
    return createPiano(audioContext, frequency, audioContext.currentTime + time);
}

// Функция создания звука пианино
function createPiano(ctx, freq, time) {
    const mainGain = ctx.createGain();
    
    // Основной тон (синусоида)
    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(freq, time);
    const fundamentalGain = ctx.createGain();
    fundamentalGain.gain.setValueAtTime(1.0, time);
    fundamental.connect(fundamentalGain).connect(mainGain);
    
    // Вторая гармоника (октава) - добавляет яркость
    const octave = ctx.createOscillator();
    octave.type = 'sine';
    octave.frequency.setValueAtTime(freq * 2, time);
    const octaveGain = ctx.createGain();
    octaveGain.gain.setValueAtTime(0.3, time);
    octave.connect(octaveGain).connect(mainGain);
    
    // Третья гармоника - добавляет теплоту
    const third = ctx.createOscillator();
    third.type = 'sine';
    third.frequency.setValueAtTime(freq * 3, time);
    const thirdGain = ctx.createGain();
    thirdGain.gain.setValueAtTime(0.15, time);
    third.connect(thirdGain).connect(mainGain);
    
    // Четвертая гармоника
    const fourth = ctx.createOscillator();
    fourth.type = 'sine';
    fourth.frequency.setValueAtTime(freq * 4, time);
    const fourthGain = ctx.createGain();
    fourthGain.gain.setValueAtTime(0.08, time);
    fourth.connect(fourthGain).connect(mainGain);
    
    // Фильтр для более реалистичного звучания
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, time);
    filter.Q.setValueAtTime(1, time);
    mainGain.connect(filter);
    
    const postGain = ctx.createGain();
    postGain.gain.setValueAtTime(1.0, time);
    filter.connect(postGain);
    
    return { 
        oscillator: fundamental, 
        gainNode: postGain, 
        extras: [octave, third, fourth] 
    };
}