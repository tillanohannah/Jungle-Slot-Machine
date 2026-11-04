/* ============================================================
   Jungle Treasure Slot Machine — Game Logic
   ============================================================ */

(() => {
    'use strict';

    /* ---------------- symbol pool ---------------- */
    /* Each reel image doubles as a symbol. Swap these src paths
       for your own jungle icons (e.g. banana, parrot, idol). */
    const SYMBOLS = [
        { src: 'image1.png', weight: 34, payout: 2 },   // common
        { src: 'image2.png', weight: 24, payout: 4 },   // mid
        { src: 'image3.png', weight: 10, payout: 0 }    // rare — triple = jackpot
    ];

    /* Lucky Spin uses its own weight table — reels are still drawn
       independently and randomly (a real slot machine never guarantees
       a win), but the odds are tilted a bit toward the better symbols
       since the player paid extra for the ticket. */
    const LUCKY_SYMBOLS = [
        { src: 'image1.png', weight: 26, payout: 2 },
        { src: 'image2.png', weight: 28, payout: 4 },
        { src: 'image3.png', weight: 16, payout: 0 }
    ];

    const JACKPOT_SRC = 'image3.png';

    const SPIN_COST = 10;
    const AUTO_SPINS = 5;
    const LUCKY_COST = 25;
    const JACKPOT_PAYOUT = 200;

    const state = {
        coins: 100,
        spins: 0,
        wins: 0,
        losses: 0,
        jackpots: 0,
        highest: 100,
        streak: 0,
        bestStreak: 0,
        history: []
    };

    let spinning = false;
    let musicOn = false;
    let audioCtx = null;
    let musicNodes = null;

    /* ---------------- DOM refs ---------------- */
    const $ = (id) => document.getElementById(id);

    const loadingScreen = $('loading-screen');
    const starsContainer = $('stars-container');
    const confettiContainer = $('confetti-container');

    const coinsAmountEl = $('coins-amount');
    const resultMessage = $('result-message');
    const resultText = $('result-text');

    const reelBoxes = [$('reel-box-1'), $('reel-box-2'), $('reel-box-3')];
    const reelImgs = [$('reel-1'), $('reel-2'), $('reel-3')];

    const spinBtn = $('spin-btn');
    const autoSpinBtn = $('auto-spin-btn');
    const resetBtn = $('reset-btn');
    const luckySpinBtn = $('lucky-spin-btn');
    const darkModeBtn = $('dark-mode-btn');
    const musicBtn = $('music-btn');
    const fullscreenBtn = $('fullscreen-btn');

    const gameOverEl = $('game-over');
    const gameOverReset = $('game-over-reset');

    const historyList = $('history-list');

    /* ---------------- loading screen ---------------- */
    window.addEventListener('load', () => {
        setTimeout(() => loadingScreen.classList.add('hidden'), 500);
    });

    /* ---------------- fireflies / stars background ---------------- */
    function buildFireflies() {
        const count = 45;
        for (let i = 0; i < count; i++) {
            const star = document.createElement('div');
            const isFirefly = Math.random() < 0.3;
            star.className = 'star' + (isFirefly ? ' firefly' : '');
            const size = isFirefly ? 3 + Math.random() * 2 : 1 + Math.random() * 2;
            star.style.width = `${size}px`;
            star.style.height = `${size}px`;
            star.style.left = `${Math.random() * 100}%`;
            star.style.top = `${Math.random() * 100}%`;
            star.style.setProperty('--duration', `${2 + Math.random() * 4}s`);
            star.style.setProperty('--max-opacity', `${0.4 + Math.random() * 0.5}`);
            star.style.animationDelay = `${Math.random() * 4}s`;
            starsContainer.appendChild(star);
        }

        // occasional darting firefly trail
        for (let i = 0; i < 2; i++) {
            const trail = document.createElement('div');
            trail.className = 'shooting-star';
            trail.style.top = `${10 + Math.random() * 50}%`;
            trail.style.left = `${50 + Math.random() * 40}%`;
            trail.style.setProperty('--shoot-duration', `${5 + Math.random() * 4}s`);
            trail.style.animationDelay = `${Math.random() * 6}s`;
            starsContainer.appendChild(trail);
        }
    }

    /* ---------------- confetti (leaves & petals) ---------------- */
    function burstConfetti() {
        const colors = ['#2fbf71', '#e8b84b', '#ff6b35', '#2dd4bf', '#9b5de5'];
        const pieces = 60;
        for (let i = 0; i < pieces; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = `${Math.random() * 100}%`;
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.borderRadius = Math.random() < 0.5 ? '50%' : '2px';
            piece.style.setProperty('--fall-duration', `${2.2 + Math.random() * 1.8}s`);
            piece.style.setProperty('--fall-delay', `${Math.random() * 0.6}s`);
            confettiContainer.appendChild(piece);
            setTimeout(() => piece.remove(), 4500);
        }
    }

    /* ---------------- audio ---------------- */
    /* Looping spin sound — plays for the duration the reels are spinning,
       and stops the instant they land. */
    const spinSound = new Audio('spinning.mp3');
    spinSound.loop = true;
    spinSound.volume = 0.5;
    spinSound.preload = 'auto';

    function playSpinSound() {
        if (!musicOn) return; // respect the sound on/off toggle
        spinSound.currentTime = 0;
        spinSound.play().catch(() => {
            // Autoplay can be blocked until the user has interacted with
            // the page — harmless to ignore, the click that triggers a
            // spin is itself a user gesture so this should succeed.
        });
    }

    function stopSpinSound() {
        spinSound.pause();
        spinSound.currentTime = 0;
    }

    function getCtx() {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AC();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function tone(freq, startAt, duration, type = 'sine', peak = 0.16) {
        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + duration + 0.02);
    }

    function playWinSound() {
        const now = getCtx().currentTime;
        [523.25, 659.25, 783.99].forEach((f, i) => tone(f, now + i * 0.09, 0.22, 'triangle', 0.18));
    }

    function playJackpotSound() {
        const now = getCtx().currentTime;
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, now + i * 0.1, 0.3, 'triangle', 0.2));
    }

    function playLoseSound() {
        const now = getCtx().currentTime;
        tone(220, now, 0.26, 'sawtooth', 0.09);
    }

    function startMusic() {
        const ctx = getCtx();
        const master = ctx.createGain();
        master.gain.value = 0.05;
        master.connect(ctx.destination);

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.value = 146.83; // D3 — warm undergrowth drone
        osc2.frequency.value = 220.0;  // A3

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.1;
        lfoGain.gain.value = 0.025;
        lfo.connect(lfoGain).connect(master.gain);

        osc1.connect(master);
        osc2.connect(master);
        osc1.start();
        osc2.start();
        lfo.start();

        musicNodes = { master, osc1, osc2, lfo };
    }

    function stopMusic() {
        if (!musicNodes) return;
        const { master, osc1, osc2, lfo } = musicNodes;
        const now = getCtx().currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + 0.4);
        setTimeout(() => { osc1.stop(); osc2.stop(); lfo.stop(); }, 450);
        musicNodes = null;
    }

    /* ---------------- rendering helpers ---------------- */
    /* Generic weighted-draw helper — pass any symbol pool (normal or
       lucky) and get back one random symbol from it, respecting weights. */
    function drawSymbol(pool) {
        const total = pool.reduce((s, x) => s + x.weight, 0);
        let r = Math.random() * total;
        for (const s of pool) {
            if (r < s.weight) return s;
            r -= s.weight;
        }
        return pool[0];
    }

    function weightedSymbol() {
        return drawSymbol(SYMBOLS);
    }

    function renderCoins() {
        coinsAmountEl.textContent = state.coins;
        coinsAmountEl.classList.remove('coins-change');
        void coinsAmountEl.offsetWidth;
        coinsAmountEl.classList.add('coins-change');
    }

    function renderHistory() {
        if (state.history.length === 0) {
            historyList.innerHTML = '<p class="history-empty">No spins yet. Start playing!</p>';
            return;
        }
        historyList.innerHTML = state.history.slice(0, 10).map(h => {
            const tagClass = h.outcome === 'jackpot' ? 'jackpot-tag' : h.outcome === 'win' ? 'match-tag' : 'lose-tag';
            const label = h.outcome === 'jackpot' ? 'JACKPOT' : h.outcome === 'win' ? 'WIN' : 'LOSS';
            const imgs = h.symbols.map(src => `<img src="${src}" alt="">`).join('');
            return `<div class="history-entry">
                <div class="history-images">${imgs}</div>
                <span class="history-result ${tagClass}">${label}</span>
            </div>`;
        }).join('');
    }

    function showResult(text, kind) {
        resultText.textContent = text;
        resultMessage.classList.remove('hidden', 'jackpot', 'match', 'lose');
        void resultMessage.offsetWidth;
        if (kind) resultMessage.classList.add(kind);
        resultMessage.classList.remove('hidden');
    }

    function setControlsDisabled(disabled) {
        [spinBtn, autoSpinBtn, luckySpinBtn].forEach(b => b.disabled = disabled);
    }

    function checkGameOver() {
        if (state.coins < SPIN_COST) {
            gameOverEl.classList.remove('hidden');
        } else {
            gameOverEl.classList.add('hidden');
        }
    }

    /* ---------------- spin logic ---------------- */
    function resolveOutcome(symbols) {
        const srcs = symbols.map(s => s.src);
        const allSame = srcs[0] === srcs[1] && srcs[1] === srcs[2];
        if (allSame && srcs[0] === JACKPOT_SRC) return { outcome: 'jackpot', payout: JACKPOT_PAYOUT };
        if (allSame) return { outcome: 'win', payout: Math.round(SPIN_COST * symbols[0].payout) };
        return { outcome: 'lose', payout: 0 };
    }

    function spinOnce(isLucky) {
        return new Promise((resolve) => {
            const cost = isLucky ? LUCKY_COST : SPIN_COST;
            const pool = isLucky ? LUCKY_SYMBOLS : SYMBOLS;
            state.coins -= cost;
            renderCoins();

            reelBoxes.forEach(box => box.classList.remove('win-highlight', 'jackpot-highlight', 'stopped'));
            reelBoxes.forEach(box => box.classList.add('spinning'));
            resultMessage.classList.add('hidden');
            playSpinSound();

            const duration = 700 + Math.random() * 300;
            const flickerTimer = setInterval(() => {
                reelImgs.forEach(img => { img.src = drawSymbol(pool).src; });
            }, 90);

            setTimeout(() => {
                clearInterval(flickerTimer);
                stopSpinSound();
                // Each reel is drawn independently, exactly like a real
                // slot machine — Lucky Spin just uses odds tilted toward
                // the better symbols, it never forces a match.
                const finalSymbols = [drawSymbol(pool), drawSymbol(pool), drawSymbol(pool)];

                finalSymbols.forEach((s, i) => {
                    reelImgs[i].src = s.src;
                    reelBoxes[i].classList.remove('spinning');
                    reelBoxes[i].classList.add('stopped');
                });

                const result = resolveOutcome(finalSymbols);
                applyResult(finalSymbols, result);
                resolve();
            }, duration);
        });
    }

    function applyResult(symbols, result) {
        state.spins++;
        state.coins += result.payout;
        state.highest = Math.max(state.highest, state.coins);

        if (result.outcome === 'jackpot') {
            state.jackpots++;
            state.wins++;
            state.streak++;
            reelBoxes.forEach(b => b.classList.add('jackpot-highlight'));
            showResult(`🏆 JACKPOT! Triple match pays ${result.payout} coins!`, 'jackpot');
            playJackpotSound();
            burstConfetti();
        } else if (result.outcome === 'win') {
            state.wins++;
            state.streak++;
            reelBoxes.forEach(b => b.classList.add('win-highlight'));
            showResult(`🌿 Match! +${result.payout} coins.`, 'match');
            playWinSound();
        } else {
            state.losses++;
            state.streak = 0;
            showResult('No match. The jungle keeps its secrets.', 'lose');
            playLoseSound();
        }

        state.bestStreak = Math.max(state.bestStreak, state.streak);
        state.history.unshift({ symbols: symbols.map(s => s.src), outcome: result.outcome });
        state.history = state.history.slice(0, 30);

        renderCoins();
        renderHistory();
        checkGameOver();
    }

    /* ---------------- actions ---------------- */
    async function handleSpin() {
        if (spinning || state.coins < SPIN_COST) return;
        spinning = true;
        setControlsDisabled(true);
        await spinOnce(false);
        setControlsDisabled(false);
        spinning = false;
    }

    async function handleAutoSpin() {
        if (spinning) return;
        spinning = true;
        setControlsDisabled(true);
        for (let i = 0; i < AUTO_SPINS; i++) {
            if (state.coins < SPIN_COST) break;
            await spinOnce(false);
            await new Promise(r => setTimeout(r, 300));
        }
        setControlsDisabled(false);
        spinning = false;
    }

    async function handleLuckySpin() {
        if (spinning || state.coins < LUCKY_COST) return;
        spinning = true;
        setControlsDisabled(true);
        await spinOnce(true);
        setControlsDisabled(false);
        spinning = false;
    }

    function handleReset() {
        state.coins = 100;
        state.spins = 0;
        state.wins = 0;
        state.losses = 0;
        state.jackpots = 0;
        state.highest = 100;
        state.streak = 0;
        state.bestStreak = 0;
        state.history = [];

        reelBoxes.forEach(box => box.classList.remove('win-highlight', 'jackpot-highlight', 'spinning', 'stopped'));
        reelImgs[0].src = 'image1.png';
        reelImgs[1].src = 'image2.png';
        reelImgs[2].src = 'image3.png';

        renderCoins();
        renderHistory();
        resultMessage.classList.add('hidden');
        gameOverEl.classList.add('hidden');
    }

    /* ---------------- toggles ---------------- */
    function toggleDayNight() {
        const isLight = document.body.classList.toggle('light-mode');
        darkModeBtn.classList.toggle('active', isLight);
        darkModeBtn.querySelector('.btn-text').textContent = isLight ? 'DAY MODE' : 'NIGHT MODE';
    }

    function toggleMusic() {
        musicOn = !musicOn;
        musicBtn.classList.toggle('active', musicOn);
        musicBtn.querySelector('.btn-icon').textContent = musicOn ? '🔊' : '🔇';
        musicBtn.querySelector('.btn-text').textContent = musicOn ? 'SOUND ON' : 'SOUND OFF';
        if (musicOn) {
            startMusic();
        } else {
            stopMusic();
            stopSpinSound();
        }
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
            fullscreenBtn.classList.add('active');
        } else {
            document.exitFullscreen?.();
            fullscreenBtn.classList.remove('active');
        }
    }

    /* ---------------- wire up events ---------------- */
    spinBtn.addEventListener('click', handleSpin);
    autoSpinBtn.addEventListener('click', handleAutoSpin);
    luckySpinBtn.addEventListener('click', handleLuckySpin);
    resetBtn.addEventListener('click', handleReset);
    gameOverReset.addEventListener('click', handleReset);
    darkModeBtn.addEventListener('click', toggleDayNight);
    musicBtn.addEventListener('click', toggleMusic);
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            handleSpin();
        }
    });

    /* ---------------- init ---------------- */
    buildFireflies();
    renderCoins();
    renderHistory();
    checkGameOver();
})();