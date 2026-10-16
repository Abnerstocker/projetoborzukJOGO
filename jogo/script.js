(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const MAX_WAVE = 5;
  const ui = {
    score: document.getElementById('scoreValue'), best: document.getElementById('bestValue'), combo: document.getElementById('comboValue'),
    lives: document.getElementById('lifeRow'), lifeMessage: document.getElementById('lifeMessage'), wave: document.getElementById('waveValue'), waveTotal: document.getElementById('waveTotal'),
    waveName: document.getElementById('waveName'), waveProgress: document.getElementById('waveProgress'), powerBar: document.getElementById('powerBar'),
    powerValue: document.getElementById('powerValue'), pulse: document.getElementById('pulseButton'), network: document.getElementById('networkStatus'),
    overlay: document.getElementById('gameOverlay'), overlayKicker: document.getElementById('overlayKicker'), overlayTitle: document.getElementById('overlayTitle'),
    overlayMessage: document.getElementById('overlayMessage'), overlayButton: document.getElementById('overlayButton'), endlessButton: document.getElementById('endlessButton'), choices: document.getElementById('upgradeChoices'),
    objectiveBanner: document.getElementById('objectiveBanner'), objectiveText: document.getElementById('objectiveText'), objectiveStatus: document.getElementById('objectiveStatus'),
    threat: document.getElementById('threatLabel'), status: document.getElementById('statusMessage'), kills: document.getElementById('killValue'),
    boss: document.getElementById('bossWarning'), sound: document.getElementById('soundButton'), soundLabel: document.getElementById('soundLabel'), dash: document.getElementById('dashButton'),
    pause: document.getElementById('pauseButton'), restart: document.getElementById('restartButton'), restartDialog: document.getElementById('restartDialog'),
    restartCancel: document.getElementById('restartCancel'), restartConfirm: document.getElementById('restartConfirm'), contrast: document.getElementById('contrastButton'), motion: document.getElementById('motionButton'),
    home: document.getElementById('homeButton'),
    textSize: document.getElementById('textSizeButton'), help: document.getElementById('helpButton'), helpDialog: document.getElementById('helpDialog'), helpClose: document.getElementById('helpClose')
  };
  const stages = [
    { name: 'MALWARE DE ROTINA', briefing: 'Elimine os vírus básicos e prepare sua defesa.', color: '#65e6d5' },
    { name: 'ENXAME DE SPAM', briefing: 'Bots velozes vão tentar cercar você.', color: '#d2fb52' },
    { name: 'RANSOMWARE BRABO', briefing: 'Ransomwares atiram de longe. Não fique parado!', color: '#ffc65a' },
    { name: 'BOTNET SEM FREIO', briefing: 'A invasão acelera: mais inimigos e ataques sem pausa.', color: '#ff6f61' },
    { name: 'BUG FINAL', briefing: 'Derrote o chefão e desvie das rajadas!', color: '#ff6f61' }
  ];
  const objectives = [
    { type: 'no-hit', text: 'Conclua a fase sem sofrer dano.', target: 1 },
    { type: 'combo', text: 'Alcance combo x4 nesta fase.', target: 4 },
    { type: 'ransomware', text: 'Elimine 2 ransomwares.', target: 2 },
    { type: 'emp', text: 'Acerte 3 ameaças com o pulso EMP.', target: 3 }
  ];
  const stars = Array.from({ length: 115 }, (_, index) => ({ x: (index * 197 + 43) % WIDTH, y: (index * 127 + 17) % HEIGHT, size: index % 11 === 0 ? 2 : 1, phase: index * 0.61 }));
  const keys = new Set();
  const pointer = { x: WIDTH * 0.72, y: HEIGHT * 0.48, active: false, firing: false, mode: '' };
  const upgrades = [
    { icon: '»', title: 'Dedos de fibra', text: 'Atire 18% mais rápido.', apply: (player) => { player.fireRate = Math.max(0.09, player.fireRate * 0.82); } },
    { icon: '✹', title: 'Pacote pesado', text: 'Seus tiros causam +1 de dano.', apply: (player) => { player.damage += 1; } },
    { icon: '⋈', title: 'Mira dupla', text: 'Dispare dois projéteis por vez.', apply: (player) => { player.shots = Math.min(4, player.shots + 1); } },
    { icon: '↯', title: 'Pernas de modem', text: 'Movimente-se 15% mais rápido.', apply: (player) => { player.speed *= 1.15; } },
    { icon: '♥', title: 'Backup suspeito', text: 'Recupere uma vida, até o máximo de 3.', apply: (player, game) => { game.lives = Math.min(3, game.lives + 1); } },
    { icon: '✳', title: 'Bateria extra', text: 'Ganhe 20% de carga EMP.', apply: (player, game) => { game.pulse = Math.min(100, game.pulse + 20); } },
    { icon: '●', title: 'Balas velozes', text: 'Projéteis viajam 22% mais rápido.', apply: (player) => { player.bulletSpeed *= 1.22; } }
  ];
  let bestScore = 0;
  try { bestScore = Number(localStorage.getItem('firewallFrenzyBest')) || 0; } catch { bestScore = 0; }
  let game;
  let resumeAfterRestartPrompt = false;
  let previousFrame = 0;
  let frameRequest = 0;
  let soundEnabled = true;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionPreference.matches;
  let motionPreferenceOverridden = false;
  let largeText = false;
  try { largeText = localStorage.getItem('firewallFrenzyLargeText') === 'true'; } catch { largeText = false; }
  let audioContext = null;
  let audioOutput = null;
  let distortionCurve = null;

  function stageForWave(wave) {
    return stages[(Math.max(1, wave) - 1) % stages.length];
  }

  function createObjective(wave) {
    return { ...objectives[(wave - 1) % objectives.length], progress: 0, failed: false, completed: false, reward: Math.min(wave * 125, 1250) };
  }

  function updateObjectiveHud() {
    const objective = game.objective;
    ui.objectiveBanner.hidden = !objective;
    if (!objective) return;
    ui.objectiveText.textContent = objective.text;
    ui.objectiveStatus.textContent = objective.failed ? 'FALHOU' : objective.completed ? 'CONCLUÍDO' : objective.type === 'no-hit' ? 'SEM DANO' : `${objective.progress}/${objective.target}`;
  }

  function advanceObjective(type, amount = 1) {
    const objective = game.objective;
    if (!objective || objective.type !== type || objective.failed || objective.completed) return;
    objective.progress = type === 'combo' ? Math.max(objective.progress, amount) : objective.progress + amount;
    if (objective.progress >= objective.target) objective.completed = true;
    updateObjectiveHud();
  }

  function newGame() {
    return {
      active: false, paused: false, ended: false, endless: false, objective: null, wave: 0, score: 0, kills: 0, waveKills: 0, lives: 3, combo: 1, comboTimer: 0, pulse: 35,
      spawnLeft: 0, spawned: 0, waveTotal: 0, spawnTimer: 0, bossQueued: false, bossSpawned: false,
      player: { x: WIDTH / 2, y: HEIGHT / 2, radius: 15, speed: 230, fireRate: 0.25, fireCooldown: 0, damage: 1, shots: 1, bulletSpeed: 650, invulnerable: 0, dashTime: 0, dashCooldown: 0, moveTarget: null },
      enemies: [], bullets: [], enemyBullets: [], particles: [], elapsed: 0, shake: 0
    };
  }

  function setReducedMotion(enabled) {
    reducedMotion = enabled;
    document.body.classList.toggle('reduce-motion', reducedMotion);
    document.body.classList.toggle('allow-motion', !reducedMotion && motionPreference.matches);
    ui.motion.setAttribute('aria-pressed', String(reducedMotion));
    if (reducedMotion) game.shake = 0;
  }

  function setLargeText(enabled) {
    largeText = enabled;
    document.body.classList.toggle('large-text', largeText);
    ui.textSize.setAttribute('aria-pressed', String(largeText));
    try { localStorage.setItem('firewallFrenzyLargeText', String(largeText)); } catch { /* A preferência continua ativa nesta sessão. */ }
  }

  function setOverlay({ kicker, title, message, button, choices = false, controls = true, startScreen = false }) {
    ui.overlayKicker.textContent = kicker;
    ui.overlayTitle.innerHTML = title;
    ui.overlayMessage.textContent = message;
    ui.overlayButton.innerHTML = button;
    ui.endlessButton.hidden = true;
    ui.overlayButton.hidden = choices;
    ui.choices.hidden = !choices;
    ui.overlay.classList.toggle('start-screen', startScreen);
    ui.overlay.querySelector('.overlay-controls').hidden = !controls;
    ui.overlay.hidden = false;
  }

  function updateHud() {
    ui.score.textContent = String(game.score).padStart(6, '0');
    ui.best.textContent = String(Math.max(bestScore, game.score)).padStart(6, '0');
    ui.combo.textContent = `x${game.combo}`;
    ui.wave.textContent = String(Math.max(1, game.wave)).padStart(2, '0');
    ui.waveTotal.textContent = game.endless ? '∞' : String(MAX_WAVE).padStart(2, '0');
    ui.waveName.textContent = stageForWave(game.wave).name;
    ui.waveProgress.style.width = `${game.waveTotal ? Math.min(100, (game.waveKills / game.waveTotal) * 100) : 0}%`;
    ui.powerBar.style.width = `${game.pulse}%`;
    ui.powerValue.textContent = `${Math.floor(game.pulse)}%`;
    ui.pulse.disabled = !game.active || game.pulse < 100;
    ui.pause.disabled = !game.active || game.ended;
    ui.restart.disabled = game.wave === 0;
    ui.pause.setAttribute('aria-pressed', String(game.paused));
    ui.pause.setAttribute('aria-label', game.paused ? 'Retomar jogo' : 'Pausar jogo');
    ui.pause.textContent = game.paused ? '▶ RETOMAR' : 'Ⅱ PAUSAR';
    ui.kills.textContent = String(game.kills).padStart(2, '0');
    ui.lifeMessage.textContent = game.lives === 3 ? 'Sem backup. Sem pressão.' : game.lives === 2 ? 'Olha o antivírus aí.' : game.lives === 1 ? 'Uma vida. Um sonho.' : 'Sem vidas restantes.';
    ui.lives.querySelectorAll('.life-pip').forEach((pip, index) => {
      pip.classList.toggle('is-alive', index < game.lives);
      pip.classList.toggle('is-lost', index >= game.lives);
    });
    ui.lives.setAttribute('aria-label', `${game.lives} ${game.lives === 1 ? 'vida' : 'vidas'}`);
    ui.boss.hidden = !game.enemies.some((enemy) => enemy.type === 'boss');
    updateObjectiveHud();
    if (game.ended) ui.threat.textContent = game.lives > 0 ? 'REDE RECUPERADA' : 'CONEXÃO INTERROMPIDA';
    else if (game.active) ui.threat.textContent = game.bossSpawned ? 'CHEFE DETECTADO' : `FASE ${String(game.wave).padStart(2, '0')} // ${game.enemies.length + game.spawnLeft} AMEAÇAS`;
    else ui.threat.textContent = 'AGUARDANDO CONEXÃO';
  }

  function beginWave(wave) {
    game.wave = wave;
    game.waveKills = 0;
    game.active = true;
    game.spawnLeft = wave % MAX_WAVE === 4 ? 6 + wave * 4 : 6 + Math.min(wave, 18) * 3;
    game.spawned = 0;
    game.waveTotal = game.spawnLeft + (wave % MAX_WAVE === 0 ? 1 : 0);
    game.spawnTimer = wave % MAX_WAVE === 4 ? 0.25 : 0.4;
    game.enemyBullets = [];
    game.bossQueued = wave % MAX_WAVE === 0;
    game.bossSpawned = false;
    game.objective = createObjective(wave);
    ui.network.textContent = 'INVASÃO EM ANDAMENTO';
    ui.status.textContent = stageForWave(wave).briefing;
    updateHud();
  }

  function startGame() {
    game = newGame();
    game.active = true;
    ui.overlay.hidden = true;
    keys.clear();
    pointer.firing = false;
    unlockAudio();
    beginWave(1);
    canvas.focus({ preventScroll: true });
  }

  function returnToTitle() {
    game = newGame();
    keys.clear();
    pointer.firing = false;
    pointer.mode = '';
    ui.network.textContent = 'REDE EM RISCO';
    ui.status.textContent = 'Sua senha era “123456”, né?';
    setOverlay({ kicker: 'ALERTA DE SEGURANÇA // 404', title: 'Seu antivírus<br><span>pediu demissão.</span>', message: 'Vírus por todo lado. Você, um blaster e três vidas. Parece um plano.', button: '<span aria-hidden="true">▶</span> INICIAR A INVASÃO', startScreen: true });
    updateHud();
    ui.overlayButton.focus({ preventScroll: true });
  }

  function startEndless() {
    if (!game.ended || game.wave < MAX_WAVE) return;
    game.ended = false;
    game.endless = true;
    ui.overlay.hidden = true;
    keys.clear();
    pointer.firing = false;
    beginWave(MAX_WAVE + 1);
    canvas.focus({ preventScroll: true });
  }

  function setPaused(paused) {
    if (!game.active || game.ended || game.paused === paused) return;
    game.paused = paused;
    keys.clear();
    pointer.firing = false;
    pointer.mode = '';
    if (paused) {
      setOverlay({ kicker: 'JOGO PAUSADO // P', title: 'Pausa<br><span>tática.</span>', message: 'A invasão está pausada. Respire e volte quando quiser.', button: '<span aria-hidden="true">▶</span> RETOMAR JOGO', controls: false });
      ui.overlayButton.focus({ preventScroll: true });
    } else {
      ui.overlay.hidden = true;
      previousFrame = 0;
      canvas.focus({ preventScroll: true });
    }
    updateHud();
  }

  function showUpgradeScreen() {
    const objective = game.objective;
    const objectiveReward = objective && !objective.failed ? objective.reward : 0;
    if (objectiveReward) {
      objective.completed = true;
      game.score += objectiveReward;
    }
    if (game.wave >= MAX_WAVE && !game.endless) {
      finishGame(true);
      return;
    }
    game.active = false;
    game.score += game.wave * 250;
    game.pulse = Math.min(100, game.pulse + 15);
    ui.network.textContent = 'AMEAÇA NEUTRALIZADA';
    ui.status.textContent = objectiveReward ? `Objetivo bônus concluído: +${objectiveReward} pontos.` : 'Rede limpa por uns cinco segundos. Aproveite.';
    const nextStage = stageForWave(game.wave + 1);
    const shuffled = [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3);
    ui.choices.innerHTML = shuffled.map((upgrade) => `<button class="upgrade-card" type="button" data-upgrade="${upgrades.indexOf(upgrade)}"><span class="upgrade-icon" aria-hidden="true">${upgrade.icon}</span><strong>${upgrade.title}</strong><small>${upgrade.text}</small></button>`).join('');
    ui.choices.querySelectorAll('.upgrade-card').forEach((button) => button.addEventListener('click', () => {
      upgrades[Number(button.dataset.upgrade)].apply(game.player, game);
      game.wave += 1;
      game.active = true;
      ui.overlay.hidden = true;
      beginWave(game.wave);
      playSound('upgrade');
    }, { once: true }));
    const rewardMessage = objectiveReward ? ` Objetivo bônus: +${objectiveReward} pontos.` : '';
    setOverlay({ kicker: `FASE ${String(game.wave).padStart(2, '0')} // CONCLUÍDA`, title: 'Escolha sua<br><span>gambiarra.</span>', message: `Melhoria desbloqueada! Próxima: FASE ${String(game.wave + 1).padStart(2, '0')} — ${nextStage.name}. ${nextStage.briefing}${rewardMessage}`, button: '', choices: true, controls: false });
    updateHud();
  }

  function finishGame(won) {
    game.active = false;
    game.paused = false;
    game.ended = true;
    pointer.firing = false;
    ui.network.textContent = won ? 'REDE RECUPERADA' : 'SINAL PERDIDO';
    if (game.score > bestScore) {
      bestScore = game.score;
      try { localStorage.setItem('firewallFrenzyBest', String(bestScore)); } catch { /* O jogo continua sem armazenamento local. */ }
    }
    if (won) {
      setOverlay({ kicker: 'AMEAÇA ELIMINADA // 5 DE 5', title: 'A internet está<br><span>menos pior.</span>', message: `Você fez ${game.score.toLocaleString('pt-BR')} pontos e salvou a rede. O suporte vai chamar isso de “manutenção”.`, button: '<span aria-hidden="true">↻</span> JOGAR DE NOVO' });
      ui.status.textContent = 'Você venceu. Agora atualize o roteador, só por precaução.';
    } else {
      setOverlay({ kicker: `FALHA DE SEGURANÇA // FASE ${String(game.wave).padStart(2, '0')}`, title: 'Deu tela<br><span>azul.</span>', message: `Você eliminou ${game.kills} ameaças e marcou ${game.score.toLocaleString('pt-BR')} pontos. O antivírus continua desempregado.`, button: '<span aria-hidden="true">↻</span> TENTAR NOVAMENTE' });
      ui.status.textContent = 'O sistema encontrou um problema e precisa reiniciar.';
    }
    ui.endlessButton.hidden = !won;
    updateHud();
  }

  function startFromOverlay() {
    if (game.ended) {
      startGame();
      return;
    }
    if (game.paused) {
      setPaused(false);
      return;
    }
    if (!game.active) startGame();
  }

  function unlockAudio() {
    if (!soundEnabled) return;
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioContext = new AudioCtor();
      audioOutput = audioContext.createGain();
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-18, audioContext.currentTime);
      compressor.knee.setValueAtTime(16, audioContext.currentTime);
      compressor.ratio.setValueAtTime(8, audioContext.currentTime);
      compressor.attack.setValueAtTime(0.004, audioContext.currentTime);
      compressor.release.setValueAtTime(0.16, audioContext.currentTime);
      audioOutput.gain.setValueAtTime(0.82, audioContext.currentTime);
      audioOutput.connect(compressor);
      compressor.connect(audioContext.destination);
      distortionCurve = new Float32Array(2048);
      for (let index = 0; index < distortionCurve.length; index += 1) {
        const input = (index * 2) / (distortionCurve.length - 1) - 1;
        distortionCurve[index] = Math.tanh(input * 3.8) / Math.tanh(3.8);
      }
    }
    if (audioContext.state === 'suspended') audioContext.resume();
  }

  function playTone(frequency, duration = 0.1, type = 'sine', endFrequency = frequency, volume = 0.07, delay = 0) {
    if (!soundEnabled || !audioContext) return;
    const oscillator = audioContext.createOscillator();
    const shaper = audioContext.createWaveShaper();
    const gain = audioContext.createGain();
    shaper.curve = distortionCurve;
    shaper.oversample = '4x';
    const start = audioContext.currentTime + delay;
    const end = start + duration;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), end);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    oscillator.connect(shaper);
    shaper.connect(gain);
    gain.connect(audioOutput);
    oscillator.start(start);
    oscillator.stop(end);
  }

  function playNoise(duration, volume, cutoff, filterType = 'lowpass') {
    if (!soundEnabled || !audioContext) return;
    const length = Math.ceil(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) samples[index] = Math.random() * 2 - 1;
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const shaper = audioContext.createWaveShaper();
    const gain = audioContext.createGain();
    const end = audioContext.currentTime + duration;
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(cutoff, audioContext.currentTime);
    shaper.curve = distortionCurve;
    shaper.oversample = '4x';
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    source.connect(filter);
    filter.connect(shaper);
    shaper.connect(gain);
    gain.connect(audioOutput);
    source.start();
    source.stop(end);
  }

  function playSound(effect) {
    if (!soundEnabled || !audioContext) return;
    if (effect === 'shot') {
      playNoise(0.045, 0.11, 1400, 'highpass');
      playNoise(0.095, 0.075, 950);
      playTone(155, 0.14, 'sawtooth', 38, 0.09);
      playTone(72, 0.18, 'sine', 30, 0.11, 0.008);
    } else if (effect === 'hit') {
      playTone(220, 0.22, 'square', 42, 0.085);
      playTone(72, 0.28, 'sawtooth', 28, 0.08, 0.015);
      playNoise(0.2, 0.09, 1100);
    } else if (effect === 'kill') {
      playTone(520, 0.16, 'sawtooth', 1100, 0.065);
      playTone(145, 0.22, 'square', 36, 0.075, 0.015);
      playNoise(0.2, 0.085, 1900);
    } else if (effect === 'combo') {
      playTone(390, 0.22, 'sawtooth', 980, 0.075);
      playTone(780, 0.24, 'square', 1560, 0.055, 0.05);
      playTone(82, 0.34, 'sine', 34, 0.08);
      playNoise(0.24, 0.075, 2400);
    } else if (effect === 'dash') {
      playTone(250, 0.2, 'sawtooth', 1550, 0.065);
      playTone(1450, 0.16, 'square', 270, 0.045, 0.025);
      playNoise(0.16, 0.06, 1500);
    } else if (effect === 'emp') {
      playTone(110, 0.62, 'sawtooth', 24, 0.12);
      playTone(420, 0.48, 'square', 38, 0.075, 0.035);
      playTone(58, 0.7, 'sine', 22, 0.11);
      playNoise(0.62, 0.14, 680);
    } else if (effect === 'boss') {
      playTone(82, 0.9, 'sawtooth', 25, 0.12);
      playTone(124, 0.82, 'square', 32, 0.085, 0.06);
      playTone(46, 0.95, 'sine', 20, 0.12);
      playNoise(0.8, 0.12, 480);
    } else if (effect === 'enrage') {
      playTone(150, 0.42, 'sawtooth', 920, 0.09);
      playTone(76, 0.5, 'square', 28, 0.085, 0.04);
      playNoise(0.4, 0.08, 760);
    } else if (effect === 'upgrade') {
      playTone(440, 0.16, 'triangle', 660, 0.055);
      playTone(660, 0.18, 'triangle', 990, 0.055, 0.1);
      playTone(880, 0.24, 'sine', 1320, 0.045, 0.2);
    }
  }

  function randomEdgePosition() {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: Math.random() * WIDTH, y: -28 };
    if (side === 1) return { x: WIDTH + 28, y: Math.random() * HEIGHT };
    if (side === 2) return { x: Math.random() * WIDTH, y: HEIGHT + 28 };
    return { x: -28, y: Math.random() * HEIGHT };
  }

  function spawnEnemy() {
    const roll = Math.random();
    const type = game.wave >= 3 && roll < 0.22 ? 'ransomware'
      : game.wave >= 3 && roll < 0.42 ? 'heavy'
        : game.wave >= 2 && roll < (game.wave === 2 ? 0.46 : 0.72) ? 'fast' : 'bug';
    const position = randomEdgePosition();
    const strength = 1 + Math.min(game.wave - 1, 14) * 0.18;
    const config = {
      bug: { radius: 13, health: 2, speed: 67, color: '#ff6f61', score: 100 },
      fast: { radius: 10, health: 1, speed: 126, color: '#d2fb52', score: 140 },
      heavy: { radius: 19, health: 6, speed: 43, color: '#65e6d5', score: 220 },
      ransomware: { radius: 15, health: 4, speed: 58, color: '#ffc65a', score: 260 }
    }[type];
    const health = Math.ceil(config.health * strength);
    game.enemies.push({ ...position, ...config, type, health, maxHealth: health, speed: config.speed + (game.wave - 1) * 3, phase: Math.random() * 8, shotTimer: 1.5 + Math.random(), dead: false });
    game.spawned += 1;
  }

  function spawnBoss() {
    const health = 210 + Math.min(game.wave, 20) * 32;
    game.enemies.push({ x: WIDTH / 2, y: -55, radius: 43, health, maxHealth: health, speed: 54, color: '#ff6f61', score: 2500, type: 'boss', phase: 0, shotTimer: 1.2, warningTime: 0, warningAngle: 0, enraged: false, dead: false });
    game.bossSpawned = true;
    ui.status.textContent = 'BUG FINAL conectado. Ele não leu os termos de serviço.';
    playSound('boss');
    updateHud();
  }

  function burst(x, y, color, count = 10, force = 110) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = force * (0.25 + Math.random() * 0.85);
      const life = 0.25 + Math.random() * 0.45;
      game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: 1.5 + Math.random() * 3, color });
    }
  }

  function createBullet(angle) {
    const player = game.player;
    const spread = (player.shots - 1) * 0.105;
    for (let index = 0; index < player.shots; index += 1) {
      const offset = (index - (player.shots - 1) / 2) * spread;
      const shotAngle = angle + offset;
      game.bullets.push({ x: player.x + Math.cos(shotAngle) * 17, y: player.y + Math.sin(shotAngle) * 17, vx: Math.cos(shotAngle) * player.bulletSpeed, vy: Math.sin(shotAngle) * player.bulletSpeed, damage: player.damage, life: 1.05, color: index % 2 ? '#65e6d5' : '#d2fb52' });
    }
  }

  function killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    game.kills += 1;
    game.waveKills += 1;
    game.combo = game.comboTimer > 0 ? Math.min(9, game.combo + 1) : 1;
    game.comboTimer = 1.7;
    advanceObjective('combo', game.combo);
    if (enemy.type === 'ransomware') advanceObjective('ransomware');
    game.score += enemy.score * game.combo;
    game.pulse = Math.min(100, game.pulse + (enemy.type === 'boss' ? 45 : 8));
    burst(enemy.x, enemy.y, enemy.color, enemy.type === 'boss' ? 42 : 12, enemy.type === 'boss' ? 230 : 140);
    playSound(enemy.type === 'boss' ? 'boss' : game.combo >= 4 ? 'combo' : 'kill');
    ui.status.textContent = game.combo >= 4 ? `Combo x${game.combo}! O malware está passando vergonha.` : ['Mais um pra lixeira.', 'Firewall 1, vírus 0.', 'Você clicou nos termos e condições?', 'Seu PC agradece.'][game.kills % 4];
    updateHud();
  }

  function damagePlayer() {
    const player = game.player;
    if (player.invulnerable > 0 || game.ended) return;
    if (game.objective?.type === 'no-hit') {
      game.objective.failed = true;
      updateObjectiveHud();
    }
    game.lives -= 1;
    player.invulnerable = 1.25;
    game.shake = 12;
    burst(player.x, player.y, '#ff6f61', 18, 180);
    ui.status.textContent = ['Isso não estava no treinamento.', 'Alguém salvou seu trabalho?', 'Aperta o dash, chefe.'][Math.max(0, game.lives) % 3];
    playSound('hit');
    updateHud();
    if (game.lives <= 0) finishGame(false);
  }

  function usePulse() {
    if (!game.active || game.paused || game.pulse < 100) return;
    game.pulse = 0;
    game.shake = 8;
    burst(game.player.x, game.player.y, '#ffc65a', 38, 310);
    for (const enemy of game.enemies) {
      const distance = Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y);
      if (distance < 250) {
        advanceObjective('emp');
        enemy.health -= enemy.type === 'boss' ? 34 : enemy.type === 'heavy' ? 5 : 4;
        const push = (250 - distance) * 0.9;
        const angle = Math.atan2(enemy.y - game.player.y, enemy.x - game.player.x);
        enemy.x += Math.cos(angle) * push;
        enemy.y += Math.sin(angle) * push;
        if (enemy.health <= 0) killEnemy(enemy);
      }
    }
    ui.status.textContent = 'DESCARGA! O modem fez barulho de micro-ondas.';
    playSound('emp');
    updateHud();
  }

  function dash() {
    const player = game.player;
    if (!game.active || game.paused || player.dashCooldown > 0) return;
    player.dashTime = 0.2;
    player.dashCooldown = 1.15;
    player.invulnerable = Math.max(player.invulnerable, 0.35);
    burst(player.x, player.y, '#65e6d5', 9, 100);
    playSound('dash');
  }

  function updatePlayer(delta) {
    const player = game.player;
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    player.dashCooldown = Math.max(0, player.dashCooldown - delta);
    player.dashTime = Math.max(0, player.dashTime - delta);
    let moveX = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    let moveY = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    if (moveX || moveY) player.moveTarget = null;
    else if (player.moveTarget) {
      const distance = Math.hypot(player.moveTarget.x - player.x, player.moveTarget.y - player.y);
      if (distance < 6) player.moveTarget = null;
      else { moveX = (player.moveTarget.x - player.x) / distance; moveY = (player.moveTarget.y - player.y) / distance; }
    }
    const magnitude = Math.hypot(moveX, moveY) || 1;
    const dashBoost = player.dashTime > 0 ? 2.7 : 1;
    player.x = Math.max(20, Math.min(WIDTH - 20, player.x + (moveX / magnitude) * player.speed * dashBoost * delta));
    player.y = Math.max(20, Math.min(HEIGHT - 20, player.y + (moveY / magnitude) * player.speed * dashBoost * delta));
    const aimX = pointer.active ? pointer.x : (game.enemies[0]?.x ?? player.x + 1);
    const aimY = pointer.active ? pointer.y : (game.enemies[0]?.y ?? player.y);
    player.aim = Math.atan2(aimY - player.y, aimX - player.x);
    player.fireCooldown = Math.max(0, player.fireCooldown - delta);
    if ((pointer.firing || keys.has(' ')) && player.fireCooldown === 0) {
      createBullet(player.aim);
      playSound('shot');
      player.fireCooldown = player.fireRate;
    }
  }

  function updateEnemies(delta) {
    const player = game.player;
    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      enemy.phase += delta;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (enemy.type === 'boss') {
        if (enemy.y < 100) enemy.y += enemy.speed * delta;
        else if (distance > 205) { enemy.x += (dx / distance) * enemy.speed * delta; enemy.y += (dy / distance) * enemy.speed * delta; }
        enemy.x += Math.sin(enemy.phase * 1.8) * 24 * delta;
        if (!enemy.enraged && enemy.health <= enemy.maxHealth / 2) {
          enemy.enraged = true;
          enemy.speed *= 1.5;
          ui.status.textContent = 'BUG FINAL em modo turbo! Desvie das rajadas!';
          playSound('enrage');
        }
        if (enemy.warningTime > 0) {
          enemy.warningTime = Math.max(0, enemy.warningTime - delta);
          if (enemy.warningTime === 0) {
            const angle = enemy.warningAngle;
            const spread = enemy.enraged ? [-0.46, -0.23, 0, 0.23, 0.46] : [-0.22, 0, 0.22];
            for (const offset of spread) game.enemyBullets.push({ x: enemy.x, y: enemy.y + 18, vx: Math.cos(angle + offset) * (enemy.enraged ? 250 : 210), vy: Math.sin(angle + offset) * (enemy.enraged ? 250 : 210), radius: 7, color: '#ff6f61' });
            enemy.shotTimer = enemy.enraged ? 0.82 : 1.22;
          }
        } else {
          enemy.shotTimer -= delta;
          if (enemy.shotTimer <= 0) {
            enemy.warningAngle = Math.atan2(dy, dx);
            enemy.warningTime = 0.48;
          }
        }
      } else if (enemy.type === 'ransomware') {
        if (distance > 235 || distance < 165) {
          const direction = distance > 235 ? 1 : -1;
          enemy.x += (dx / distance) * enemy.speed * direction * delta;
          enemy.y += (dy / distance) * enemy.speed * direction * delta;
        } else {
          const strafe = Math.sin(enemy.phase * 1.8) * 0.7;
          enemy.x += (-dy / distance) * enemy.speed * strafe * delta;
          enemy.y += (dx / distance) * enemy.speed * strafe * delta;
        }
        enemy.shotTimer -= delta;
        if (enemy.shotTimer <= 0) {
          const angle = Math.atan2(dy, dx);
          game.enemyBullets.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 170, vy: Math.sin(angle) * 170, radius: 5, color: enemy.color });
          enemy.shotTimer = 1.8;
        }
      } else {
        enemy.x += (dx / distance) * enemy.speed * delta;
        enemy.y += (dy / distance) * enemy.speed * delta;
      }
      if (distance < player.radius + enemy.radius) {
        if (enemy.type === 'boss') { enemy.x -= (dx / distance) * 26; enemy.y -= (dy / distance) * 26; }
        else killEnemy(enemy);
        damagePlayer();
      }
    }
    game.enemies = game.enemies.filter((enemy) => !enemy.dead);
  }

  function updateBullets(delta) {
    for (let index = game.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = game.bullets[index];
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
      bullet.life -= delta;
      const target = game.enemies.find((enemy) => !enemy.dead && Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < enemy.radius + 5);
      if (target) {
        target.health -= bullet.damage;
        burst(bullet.x, bullet.y, bullet.color, 3, 55);
        if (target.health <= 0) killEnemy(target);
        game.bullets.splice(index, 1);
      } else if (bullet.life <= 0 || bullet.x < -20 || bullet.y < -20 || bullet.x > WIDTH + 20 || bullet.y > HEIGHT + 20) game.bullets.splice(index, 1);
    }
    for (let index = game.enemyBullets.length - 1; index >= 0; index -= 1) {
      const bullet = game.enemyBullets[index];
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
      if (Math.hypot(bullet.x - game.player.x, bullet.y - game.player.y) < game.player.radius + bullet.radius) {
        game.enemyBullets.splice(index, 1);
        damagePlayer();
      } else if (bullet.x < -30 || bullet.y < -30 || bullet.x > WIDTH + 30 || bullet.y > HEIGHT + 30) game.enemyBullets.splice(index, 1);
    }
  }

  function updateGame(delta) {
    game.elapsed += delta;
    game.comboTimer = Math.max(0, game.comboTimer - delta);
    if (!game.comboTimer) game.combo = 1;
    if (reducedMotion) game.shake = 0;
    else if (game.shake > 0) game.shake = Math.max(0, game.shake - delta * 34);
    if (game.spawnLeft > 0) {
      game.spawnTimer -= delta;
      if (game.spawnTimer <= 0) {
        spawnEnemy();
        game.spawnLeft -= 1;
        game.spawnTimer = Math.max(0.22, 0.76 - game.wave * (game.wave % MAX_WAVE === 4 ? 0.11 : 0.045));
      }
    }
    updatePlayer(delta);
    updateEnemies(delta);
    updateBullets(delta);
    for (let index = game.particles.length - 1; index >= 0; index -= 1) {
      const particle = game.particles[index];
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= Math.max(0, 1 - delta * 2.4);
      particle.vy *= Math.max(0, 1 - delta * 2.4);
      particle.life -= delta;
      if (particle.life <= 0) game.particles.splice(index, 1);
    }
    if (game.bossQueued && game.spawnLeft === 0 && game.enemies.length === 0 && !game.bossSpawned) spawnBoss();
    if (game.spawnLeft === 0 && game.enemies.length === 0 && (!game.bossQueued || game.bossSpawned)) showUpgradeScreen();
    if (Math.floor(game.elapsed * 5) !== Math.floor((game.elapsed - delta) * 5)) updateHud();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#171b2a');
    gradient.addColorStop(0.52, '#151722');
    gradient.addColorStop(1, '#221b2b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const glow = ctx.createRadialGradient(WIDTH * 0.52, HEIGHT * 0.48, 20, WIDTH * 0.52, HEIGHT * 0.48, WIDTH * 0.58);
    glow.addColorStop(0, 'rgba(63, 71, 99, .16)');
    glow.addColorStop(1, 'rgba(10, 12, 20, .2)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const stage = stageForWave(game.wave);
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = stage.color;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(200, 210, 230, .055)';
    ctx.lineWidth = 1;
    const offset = reducedMotion ? 0 : (game.elapsed * 13) % 48;
    for (let x = 0; x <= WIDTH; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
    for (let y = -48 + offset; y <= HEIGHT; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }
    for (const star of stars) {
      ctx.globalAlpha = reducedMotion ? 0.35 : 0.25 + (Math.sin(game.elapsed * 2 + star.phase) + 1) * 0.25;
      ctx.fillStyle = star.phase % 2 > 1 ? '#d2fb52' : '#b9c8ff';
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(101, 230, 213, .48)';
    ctx.font = '11px monospace';
    ctx.fillText('SECURE CONNECTION: NOPE', 17, 23);
    ctx.fillStyle = stage.color;
    ctx.fillText(`FASE ${String(Math.max(1, game.wave)).padStart(2, '0')} // ${stage.name}`, 17, 39);
  }

  function drawPlayer() {
    const player = game.player;
    if (player.invulnerable > 0 && Math.floor(game.elapsed * 18) % 2) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.aim || 0);
    if (player.dashTime > 0) {
      ctx.strokeStyle = 'rgba(101, 230, 213, .55)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(-17, 0, 24, 18, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowColor = '#d2fb52';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#d2fb52';
    ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(-12, -12); ctx.lineTo(-8, 0); ctx.lineTo(-12, 12); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#65e6d5';
    ctx.fillRect(0, -3, 21, 6);
    ctx.fillStyle = '#fff0c5';
    ctx.beginPath(); ctx.arc(-4, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6f61';
    ctx.fillRect(-15, -3, 5, 6);
    ctx.restore();
  }

  function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.phase * (enemy.type === 'fast' ? 2.4 : 0.7));
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = enemy.type === 'boss' ? 24 : 12;
    ctx.fillStyle = enemy.type === 'heavy' ? '#1b3940' : enemy.type === 'fast' ? '#30381e' : enemy.type === 'boss' ? '#45242b' : '#3c242d';
    ctx.strokeStyle = enemy.color;
    ctx.lineWidth = enemy.type === 'boss' ? 3 : 2;
    ctx.beginPath();
    if (enemy.type === 'fast') {
      ctx.moveTo(0, -enemy.radius); ctx.lineTo(enemy.radius, 0); ctx.lineTo(0, enemy.radius); ctx.lineTo(-enemy.radius, 0); ctx.closePath();
    } else if (enemy.type === 'heavy') {
      ctx.rect(-enemy.radius * 0.78, -enemy.radius * 0.78, enemy.radius * 1.56, enemy.radius * 1.56);
    } else if (enemy.type === 'boss') {
      for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        const radius = index % 2 ? enemy.radius * 0.78 : enemy.radius;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (enemy.type === 'ransomware') {
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        const x = Math.cos(angle) * enemy.radius;
        const y = Math.sin(angle) * enemy.radius;
        if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(-enemy.radius, -enemy.radius * 0.7); ctx.lineTo(-enemy.radius * 0.2, -enemy.radius); ctx.lineTo(enemy.radius, -enemy.radius * 0.65); ctx.lineTo(enemy.radius * 0.8, enemy.radius * 0.65); ctx.lineTo(0, enemy.radius); ctx.lineTo(-enemy.radius, enemy.radius * 0.4); ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.rotate(-enemy.phase * (enemy.type === 'fast' ? 2.4 : 0.7));
    ctx.fillStyle = enemy.color;
    ctx.beginPath(); ctx.arc(0, 0, enemy.type === 'boss' ? 10 : 3.5, 0, Math.PI * 2); ctx.fill();
    if (enemy.type === 'ransomware') {
      ctx.lineWidth = 2;
      ctx.strokeStyle = enemy.color;
      ctx.beginPath(); ctx.arc(0, -2, 4, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = enemy.color;
      ctx.fillRect(-5, -2, 10, 8);
      ctx.fillStyle = '#171923';
      ctx.fillRect(-1, 0, 2, 3);
    }
    ctx.restore();
    if (enemy.type === 'boss' && enemy.warningTime > 0) {
      const spread = enemy.enraged ? [-0.46, -0.23, 0, 0.23, 0.46] : [-0.22, 0, 0.22];
      ctx.save();
      ctx.translate(enemy.x, enemy.y + 18);
      ctx.strokeStyle = '#ff6f61';
      ctx.lineWidth = 7;
      ctx.globalAlpha = 0.2 + (enemy.warningTime / 0.48) * 0.25;
      for (const offset of spread) {
        const angle = enemy.warningAngle + offset;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * 360, Math.sin(angle) * 360);
        ctx.stroke();
      }
      ctx.restore();
    }
    const barWidth = enemy.type === 'boss' ? 94 : enemy.radius * 2.1;
    const barY = enemy.y - enemy.radius - 9;
    ctx.fillStyle = 'rgba(5, 7, 12, .8)';
    ctx.fillRect(enemy.x - barWidth / 2, barY, barWidth, enemy.type === 'boss' ? 5 : 3);
    ctx.fillStyle = enemy.color;
    ctx.fillRect(enemy.x - barWidth / 2, barY, barWidth * Math.max(0, enemy.health / enemy.maxHealth), enemy.type === 'boss' ? 5 : 3);
  }

  function drawScene() {
    ctx.save();
    if (!reducedMotion && game.shake > 0) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
    drawBackground();
    for (const bullet of game.bullets) {
      ctx.shadowColor = bullet.color; ctx.shadowBlur = 12; ctx.fillStyle = bullet.color;
      ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    for (const bullet of game.enemyBullets) {
      ctx.shadowColor = bullet.color || '#ff6f61'; ctx.shadowBlur = 13; ctx.fillStyle = bullet.color || '#ff6f61';
      ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const enemy of game.enemies) drawEnemy(enemy);
    drawPlayer();
    for (const particle of game.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function frame(timestamp) {
    const delta = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.035) : 0;
    previousFrame = timestamp;
    if (game.active && !game.paused && !game.ended) updateGame(delta);
    drawScene();
    frameRequest = requestAnimationFrame(frame);
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (WIDTH / rect.width), y: (event.clientY - rect.top) * (HEIGHT / rect.height) };
  }

  ui.overlayButton.addEventListener('click', startFromOverlay);
  ui.endlessButton.addEventListener('click', startEndless);
  ui.home.addEventListener('click', returnToTitle);
  ui.help.addEventListener('click', () => {
    if (game.active && !game.paused) setPaused(true);
    ui.helpDialog.showModal();
    ui.helpClose.focus({ preventScroll: true });
  });
  ui.helpClose.addEventListener('click', () => ui.helpDialog.close());
  ui.restart.addEventListener('click', () => {
    resumeAfterRestartPrompt = game.active && !game.paused;
    if (resumeAfterRestartPrompt) setPaused(true);
    ui.restartDialog.showModal();
    ui.restartCancel.focus({ preventScroll: true });
  });
  ui.restartCancel.addEventListener('click', () => ui.restartDialog.close());
  ui.restartConfirm.addEventListener('click', () => {
    resumeAfterRestartPrompt = false;
    ui.restartDialog.close();
    startGame();
  });
  ui.restartDialog.addEventListener('close', () => {
    const shouldResume = resumeAfterRestartPrompt;
    resumeAfterRestartPrompt = false;
    if (shouldResume && game.paused) setPaused(false);
  });
  ui.pulse.addEventListener('click', usePulse);
  ui.dash.addEventListener('click', dash);
  ui.pause.addEventListener('click', () => setPaused(!game.paused));
  ui.contrast.addEventListener('click', () => {
    const enabled = document.body.classList.toggle('high-contrast');
    ui.contrast.setAttribute('aria-pressed', String(enabled));
  });
  ui.motion.addEventListener('click', () => {
    motionPreferenceOverridden = true;
    setReducedMotion(!reducedMotion);
  });
  ui.textSize.addEventListener('click', () => setLargeText(!largeText));
  motionPreference.addEventListener('change', (event) => {
    if (!motionPreferenceOverridden) setReducedMotion(event.matches);
  });
  document.body.classList.toggle('reduce-motion', reducedMotion);
  ui.motion.setAttribute('aria-pressed', String(reducedMotion));
  setLargeText(largeText);
  ui.sound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    ui.sound.setAttribute('aria-pressed', String(soundEnabled));
    ui.sound.setAttribute('aria-label', soundEnabled ? 'Desativar efeitos sonoros' : 'Ativar efeitos sonoros');
    ui.soundLabel.textContent = soundEnabled ? 'SOM ATIVADO' : 'SOM DESATIVADO';
    if (soundEnabled) { unlockAudio(); playSound('upgrade'); }
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (ui.helpDialog.open || ui.restartDialog.open) return;
    if (key === 'p' || key === 'escape') {
      if (game.active) {
        event.preventDefault();
        setPaused(!game.paused);
      }
      return;
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    keys.add(key);
    if (key === 'shift') dash();
    if (key === 'e') usePulse();
    if (key === 'enter' && !game.active && (game.wave === 0 || game.ended)) startFromOverlay();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => {
    keys.clear();
    pointer.firing = false;
    if (game.active) setPaused(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.active) setPaused(true);
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (!game.active) return;
    const point = canvasPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.active = true;
    if (event.pointerType === 'touch' && point.x < WIDTH * 0.42) {
      game.player.moveTarget = point;
      pointer.mode = 'move';
      pointer.firing = false;
    } else {
      pointer.mode = 'aim';
      pointer.firing = true;
    }
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = canvasPoint(event);
    if (event.pointerType === 'mouse') pointer.active = true;
    if (pointer.mode === 'move' && event.pointerType === 'touch') game.player.moveTarget = point;
    else if (event.pointerType === 'mouse' || pointer.mode === 'aim') { pointer.x = point.x; pointer.y = point.y; }
  });
  const stopPointerAction = () => { pointer.firing = false; pointer.mode = ''; };
  canvas.addEventListener('pointerup', stopPointerAction);
  canvas.addEventListener('pointercancel', stopPointerAction);
  canvas.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') pointer.active = false; });

  game = newGame();
  ui.best.textContent = String(bestScore).padStart(6, '0');
  setOverlay({ kicker: 'ALERTA DE SEGURANÇA // 404', title: 'Seu antivírus<br><span>pediu demissão.</span>', message: 'Vírus por todo lado. Você, um blaster e três vidas. Parece um plano.', button: '<span aria-hidden="true">▶</span> INICIAR A INVASÃO', startScreen: true });
  updateHud();
  frameRequest = requestAnimationFrame(frame);
  window.addEventListener('beforeunload', () => cancelAnimationFrame(frameRequest), { once: true });
})();
