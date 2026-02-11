/**
 * ============================================================
 * FLIPPING CARDS SPA — Main Application
 * ============================================================
 */

(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================

  /**
   * URL del Google Apps Script desplegado como Web App
   * Reemplaza esta URL con la de tu propio script
   */
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwCj5-idGCk2O4AxdFr9BA_qTq45K8DkTV8_Qzn7DQ-mCTGWnhNSLSlgn2IyQYOD3yLNA/exec';

  /**
   * ID del juego a cargar. Se puede pasar por URL: ?gameId=game1
   */
  function getGameId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('gameId') || 'game1';
  }

  // ============================================================
  // DEMO DATA (fallback when no APPS_SCRIPT_URL is set)
  // ============================================================
  const DEMO_CONFIG = {
    gameId: 'game1',
    gameUrl: '',
    active: true,
    penalizeErrors: true,
    penaltyPoints: 5,
    timeLimit: 120,
    backgroundImage: '',
    authMode: 'nickname',
    showAnswersAtEnd: true,
    showLeaderboard: true,
    colorPrimary: '#273440',
    colorSecondary: '#D9C8A9',
    colorAccent: '#8C6F56',
    colorBackground: '#D9AF8B',
    colorText: '#0D0D0D',
    defaultTheme: 'light',
    defaultLogo: ''
  };

  const DEMO_CARDS = [
    { gameId: 'game1', pairId: '1', side: 'A', contentType: 'text', content: 'H₂O' },
    { gameId: 'game1', pairId: '1', side: 'B', contentType: 'text', content: 'Agua' },
    { gameId: 'game1', pairId: '2', side: 'A', contentType: 'text', content: 'NaCl' },
    { gameId: 'game1', pairId: '2', side: 'B', contentType: 'text', content: 'Sal de mesa' },
    { gameId: 'game1', pairId: '3', side: 'A', contentType: 'text', content: 'CO₂' },
    { gameId: 'game1', pairId: '3', side: 'B', contentType: 'text', content: 'Dióxido de carbono' },
    { gameId: 'game1', pairId: '4', side: 'A', contentType: 'text', content: 'O₂' },
    { gameId: 'game1', pairId: '4', side: 'B', contentType: 'text', content: 'Oxígeno' },
    { gameId: 'game1', pairId: '5', side: 'A', contentType: 'text', content: 'Fe' },
    { gameId: 'game1', pairId: '5', side: 'B', contentType: 'text', content: 'Hierro' },
    { gameId: 'game1', pairId: '6', side: 'A', contentType: 'text', content: 'Au' },
    { gameId: 'game1', pairId: '6', side: 'B', contentType: 'text', content: 'Oro' },
  ];

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    config: null,
    cards: [],      // raw cards from sheets
    gameCards: [],   // shuffled cards for the board
    player: '',
    flipped: [],     // currently flipped card indices
    matched: new Set(),
    pairsFound: 0,
    totalPairs: 0,
    attempts: 0,
    errors: 0,
    score: 0,
    timerInterval: null,
    timeRemaining: 0,
    timeUsed: 0,
    isProcessing: false, // lock while checking a pair
    gameStartTime: null,
    inferredMeta: { title: '', description: '', complexity: '', tags: [] },
    muted: false,
    sounds: {
      intro: new Audio('cards-ini.m4a'),
      flip: new Audio('flip-card.m4a'),
      success: new Audio('success.m4a'),
      bgm: new Audio('intro_circus-theme.m4a')
    }
  };

  // Configure BGM to loop
  state.sounds.bgm.loop = true;

  // ============================================================
  // DOM REFERENCES
  // ============================================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = {
    loading: $('#screen-loading'),
    inactive: $('#screen-inactive'),
    auth: $('#screen-auth'),
    game: $('#screen-game'),
    results: $('#screen-results')
  };

  // ============================================================
  // INITIALIZATION
  // ============================================================
  async function init() {
    showScreen('loading');

    try {
      const gameId = getGameId();
      let data;

      if (APPS_SCRIPT_URL) {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getGame&gameId=${encodeURIComponent(gameId)}`);
        data = await res.json();
        if (data.error) throw new Error(data.error);
      } else {
        // Demo mode
        data = { success: true, config: DEMO_CONFIG, cards: DEMO_CARDS };
      }

      state.config = normalizeConfig(data.config);
      state.cards = data.cards;

      // Apply theme and colors
      applyTheme(state.config.defaultTheme);
      applyColors(state.config);
      applyBackground(state.config.backgroundImage);

      // Check if game is active
      if (!state.config.active) {
        showScreen('inactive');
        return;
      }

      // Infer metadata
      state.inferredMeta = inferMetadata(state.cards, state.config);

      // Setup auth screen
      setupAuthScreen();
      showScreen('auth');

    } catch (err) {
      console.error('Error loading game:', err);
      $('#screen-loading .loading-text').textContent = 'Error al cargar el juego: ' + err.message;
    }
  }

  // ============================================================
  // CONFIG HELPERS
  // ============================================================
  function normalizeConfig(c) {
    return {
      gameId: c.gameId || 'game1',
      gameTitle: c.gameTitle || '',
      gameDescription: c.gameDescription || '',
      tags: c.tags || '',
      complexity: c.complexity || '',
      gameUrl: c.gameUrl || '',
      active: String(c.active).toUpperCase() === 'TRUE' || c.active === true,
      penalizeErrors: String(c.penalizeErrors).toUpperCase() === 'TRUE' || c.penalizeErrors === true,
      penaltyPoints: parseInt(c.penaltyPoints) || 5,
      timeLimit: parseInt(c.timeLimit) || 0,
      backgroundImage: c.backgroundImage || '',
      authMode: c.authMode || 'nickname',
      showAnswersAtEnd: String(c.showAnswersAtEnd).toUpperCase() === 'TRUE' || c.showAnswersAtEnd === true,
      showLeaderboard: String(c.showLeaderboard).toUpperCase() === 'TRUE' || c.showLeaderboard === true,
      colorPrimary: c.colorPrimary || '#273440',
      colorSecondary: c.colorSecondary || '#D9C8A9',
      colorAccent: c.colorAccent || '#8C6F56',
      colorBackground: c.colorBackground || '#D0EDE8',
      colorText: c.colorText || '#0D0D0D',
      defaultTheme: c.defaultTheme || 'light',
      defaultLogo: c.defaultLogo || ''
    };
  }

  function applyColors(config) {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', config.colorPrimary);
    root.style.setProperty('--color-secondary', config.colorSecondary);
    root.style.setProperty('--color-accent', config.colorAccent);
    root.style.setProperty('--color-text', config.colorText);

    // In light mode, use config background; in dark mode, keep dark bg
    if (document.documentElement.getAttribute('data-theme') === 'light') {
      root.style.setProperty('--color-background', config.colorBackground);
    }
  }

  function applyTheme(theme) {
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);

    const sunIcon = $('#icon-sun');
    const moonIcon = $('#icon-moon');
    if (sunIcon && moonIcon) {
      sunIcon.style.display = theme === 'light' ? 'block' : 'none';
      moonIcon.style.display = theme === 'dark' ? 'block' : 'none';
    }
  }

  function applyBackground(url) {
    if (url) {
      document.body.style.backgroundImage = `url('${url}')`;
      document.body.classList.add('has-bg-image');
    }
  }

  // ============================================================
  // METADATA INFERENCE
  // ============================================================
  function inferMetadata(cards, config) {
    const contents = cards
      .filter(c => c.contentType === 'text')
      .map(c => c.content);

    const totalPairs = new Set(cards.map(c => c.pairId)).size;

    // ----- Title -----
    let title = config.gameTitle || 'Juego de Memoria';

    // If no explicit title, try to infer it
    if (!config.gameTitle && contents.length > 0) {
      const hasChemical = contents.some(c => /[₂₃₄₅₆₇₈₉]|H₂O|CO₂|NaCl/i.test(c));
      const hasNumbers = contents.some(c => /^\d+$/.test(c));
      const hasEnglish = contents.some(c => /^[a-zA-Z\s]+$/.test(c) && /the|is|are|and|or/i.test(c));

      if (hasChemical) title = 'Memoria: Fórmulas Químicas';
      else if (hasNumbers) title = 'Memoria: Números';
      else if (hasEnglish) title = 'Memoria: Vocabulario en Inglés';
      else {
        const sample = contents.slice(0, 3).join(', ');
        if (sample.length < 50) title = `Memoria: ${sample}...`;
      }

      // Check for non-text content if title is still generic
      const contentTypes = new Set(cards.map(c => c.contentType));
      if (contentTypes.has('image') && !title.includes('Memoria:')) title = 'Memoria Visual';
      if (contentTypes.has('audio') && !title.includes('Memoria:')) title = 'Memoria Auditiva';
      if (contentTypes.has('video') && !title.includes('Memoria:')) title = 'Memoria con Videos';
    }

    // ----- Complexity -----
    let complexity = config.complexity;
    if (!complexity) {
      if (totalPairs <= 4) complexity = 'Fácil';
      else if (totalPairs <= 8) complexity = 'Intermedio';
      else if (totalPairs <= 12) complexity = 'Difícil';
      else complexity = 'Experto';
    }

    // ----- Description -----
    const contentTypes = new Set(cards.map(c => c.contentType));
    let description = config.gameDescription;
    if (!description) {
      description = `Encuentra los ${totalPairs} pares de cartas emparejando sus contenidos. `;
      if (config.penalizeErrors) description += 'Cuidado: los errores penalizan tu puntaje. ';
      if (config.timeLimit > 0) description += `Tienes ${config.timeLimit} segundos para completar el juego.`;
    }

    // ----- Tags -----
    let tags = [];
    if (config.tags) {
      tags = config.tags.split(',').map(t => t.trim());
    } else {
      tags.push('Memoria');
      if (contentTypes.has('text')) tags.push('Texto');
      if (contentTypes.has('image')) tags.push('Imágenes');
      if (contentTypes.has('audio')) tags.push('Audio');
      if (contentTypes.has('video')) tags.push('Video');
      tags.push(`${totalPairs} pares`);
      tags.push(complexity);
    }

    return { title, description, complexity, tags };
  }

  // ============================================================
  // SCREEN MANAGEMENT
  // ============================================================
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');

    // Handle BGM for auth screen
    if (name === 'auth') {
      if (!state.muted) {
        state.sounds.bgm.play().catch(e => console.warn('BGM play blocked:', e));
      }
    } else if (name === 'game') {
      state.sounds.bgm.pause();
      state.sounds.bgm.currentTime = 0;
    }
  }

  // ============================================================
  // AUTH SCREEN SETUP
  // ============================================================
  function setupAuthScreen() {
    const meta = state.inferredMeta;
    const config = state.config;

    // Title & description
    $('#auth-title').textContent = meta.title;
    $('#auth-description').textContent = meta.description;
    document.title = meta.title;

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', meta.description);

    // Complexity badge
    $('#meta-complexity').textContent = meta.complexity;

    // Tags
    const tagsContainer = $('#meta-tags');
    tagsContainer.innerHTML = '';
    meta.tags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'meta-tag';
      span.textContent = tag;
      tagsContainer.appendChild(span);
    });

    // Logo
    if (config.defaultLogo) {
      const logoEl = $('#auth-logo');
      logoEl.innerHTML = `<img src="${config.defaultLogo}" alt="Logo">`;
    }

    // Auth mode
    if (config.authMode === 'email') {
      $('#auth-nickname-group').style.display = 'none';
      $('#auth-email-group').style.display = 'block';
    } else {
      $('#auth-nickname-group').style.display = 'block';
      $('#auth-email-group').style.display = 'none';
    }

    // Config badges
    if (config.timeLimit > 0) {
      $('#badge-time').style.display = 'inline-flex';
      const mins = Math.floor(config.timeLimit / 60);
      const secs = config.timeLimit % 60;
      $('#badge-time-text').textContent = `${mins}:${String(secs).padStart(2, '0')} límite`;
    }

    if (config.penalizeErrors) {
      $('#badge-penalty').style.display = 'inline-flex';
    }

    // Form submission
    $('#auth-form').addEventListener('submit', handleAuth);
  }

  function handleAuth(e) {
    e.preventDefault();

    const config = state.config;
    let player = '';

    if (config.authMode === 'email') {
      const emailInput = $('#auth-email');
      player = emailInput.value.trim();
      if (!player || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(player)) {
        emailInput.classList.add('error');
        emailInput.focus();
        setTimeout(() => emailInput.classList.remove('error'), 2000);
        return;
      }
    } else {
      const nickInput = $('#auth-nickname');
      player = nickInput.value.trim();
      if (!player || !/^\d{1,9}$/.test(player)) {
        nickInput.classList.add('error');
        nickInput.focus();
        setTimeout(() => nickInput.classList.remove('error'), 2000);
        return;
      }
    }

    state.player = player;
    startGame();
  }

  // ============================================================
  // GAME ENGINE
  // ============================================================
  function startGame() {
    // Build pairs and create shuffled game cards
    const pairIds = [...new Set(state.cards.map(c => c.pairId))];
    state.totalPairs = pairIds.length;

    // Each card in the game gets a unique index
    state.gameCards = [];
    state.cards.forEach(card => {
      state.gameCards.push({
        pairId: card.pairId,
        side: card.side,
        contentType: card.contentType,
        content: card.content
      });
    });

    // Shuffle
    shuffleArray(state.gameCards);

    // Reset state
    state.flipped = [];
    state.matched = new Set();
    state.pairsFound = 0;
    state.attempts = 0;
    state.errors = 0;
    state.score = 0;
    state.isProcessing = false;
    state.gameStartTime = Date.now();

    // Update header
    $('#game-title').textContent = state.inferredMeta.title;
    updateStats();

    // Build board
    buildBoard();

    // Play intro sound
    if (!state.muted) {
      state.sounds.intro.currentTime = 0;
      state.sounds.intro.play().catch(e => console.warn('Audio play blocked:', e));
    }

    // Timer
    if (state.config.timeLimit > 0) {
      state.timeRemaining = state.config.timeLimit;
      $('#stat-timer-container').style.display = 'flex';
      updateTimerDisplay();
      state.timerInterval = setInterval(timerTick, 1000);
    } else {
      $('#stat-timer-container').style.display = 'none';
    }

    showScreen('game');
  }

  function buildBoard() {
    const board = $('#game-board');
    board.innerHTML = '';

    const numCards = state.gameCards.length;

    // Calculate grid columns
    let cols;
    if (numCards <= 4) cols = 2;
    else if (numCards <= 8) cols = 4;
    else if (numCards <= 12) cols = 4;
    else if (numCards <= 16) cols = 4;
    else if (numCards <= 20) cols = 5;
    else cols = 6;

    // Responsive adjustment
    const isMobile = window.innerWidth < 600;
    if (isMobile && cols > 3) cols = 3;

    board.style.gridTemplateColumns = `repeat(${cols}, var(--card-width))`;

    state.gameCards.forEach((card, index) => {
      const cardEl = createCardElement(card, index);
      board.appendChild(cardEl);
    });
  }

  function createCardElement(card, index) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.index = index;
    el.dataset.pairId = card.pairId;

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    // Front face (the hidden/back of card — what user sees initially)
    const front = document.createElement('div');
    front.className = 'card-face card-front';

    const pattern = document.createElement('div');
    pattern.className = 'card-pattern';
    front.appendChild(pattern);

    if (state.config.defaultLogo) {
      const logo = document.createElement('img');
      logo.className = 'card-logo';
      logo.src = state.config.defaultLogo;
      logo.alt = 'Logo';
      front.appendChild(logo);
    } else {
      // Default icon when no logo
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '40');
      svg.setAttribute('height', '40');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'rgba(255,255,255,0.5)');
      svg.setAttribute('stroke-width', '1.5');
      svg.innerHTML = '<path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>';
      front.appendChild(svg);
    }

    // Back face (content — revealed on flip)
    const back = document.createElement('div');
    back.className = 'card-face card-back';
    back.appendChild(renderCardContent(card));

    inner.appendChild(front);
    inner.appendChild(back);
    el.appendChild(inner);

    el.addEventListener('click', () => handleCardClick(index));

    return el;
  }

  function renderCardContent(card) {
    const container = document.createElement('div');

    switch (card.contentType) {
      case 'text':
        container.className = 'card-content-text';
        container.textContent = card.content;
        break;

      case 'image':
        const img = document.createElement('img');
        img.className = 'card-content-image';
        img.src = card.content;
        img.alt = 'Carta';
        img.loading = 'lazy';
        container.appendChild(img);
        break;

      case 'audio':
        container.className = 'card-content-audio';
        const audioIcon = document.createElement('div');
        audioIcon.className = 'audio-icon';
        audioIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';

        const audio = document.createElement('audio');
        audio.src = card.content;
        audio.preload = 'none';

        audioIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          if (audio.paused) audio.play();
          else audio.pause();
        });

        const label = document.createElement('span');
        label.className = 'audio-label';
        label.textContent = '▶ Reproducir';

        container.appendChild(audioIcon);
        container.appendChild(audio);
        container.appendChild(label);
        break;

      case 'video':
        // Extract YouTube video ID
        let videoId = card.content;
        const ytMatch = card.content.match(/(?:youtube\.com\/.*v=|youtu\.be\/)([^&\s]+)/);
        if (ytMatch) videoId = ytMatch[1];

        const iframe = document.createElement('iframe');
        iframe.className = 'card-content-video';
        iframe.src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope';
        iframe.allowFullscreen = true;
        container.appendChild(iframe);
        break;

      default:
        container.className = 'card-content-text';
        container.textContent = card.content || '?';
    }

    return container;
  }

  // ============================================================
  // CARD INTERACTION
  // ============================================================
  function handleCardClick(index) {
    // Ignore if processing, already flipped, or already matched
    if (state.isProcessing) return;
    if (state.flipped.includes(index)) return;
    if (state.matched.has(index)) return;

    // Flip the card
    const cardEl = $(`.card[data-index="${index}"]`);
    cardEl.classList.add('flipped');
    state.flipped.push(index);

    // Play flip sound
    if (!state.muted) {
      state.sounds.flip.currentTime = 0;
      state.sounds.flip.play().catch(e => console.warn('Audio play blocked:', e));
    }

    // If this is the second card
    if (state.flipped.length === 2) {
      state.isProcessing = true;
      state.attempts++;

      const [i1, i2] = state.flipped;
      const card1 = state.gameCards[i1];
      const card2 = state.gameCards[i2];

      updateStats();

      // Check for match (same pairId, different sides)
      if (card1.pairId === card2.pairId && i1 !== i2) {
        // Match!
        setTimeout(() => {
          state.matched.add(i1);
          state.matched.add(i2);
          state.pairsFound++;

          const el1 = $(`.card[data-index="${i1}"]`);
          const el2 = $(`.card[data-index="${i2}"]`);
          el1.classList.add('matched');
          el2.classList.add('matched');

          state.flipped = [];
          state.isProcessing = false;
          updateStats();

          // Check win
          if (state.pairsFound === state.totalPairs) {
            endGame(false);
          }
        }, 500);
      } else {
        // No match
        state.errors++;
        setTimeout(() => {
          const el1 = $(`.card[data-index="${i1}"]`);
          const el2 = $(`.card[data-index="${i2}"]`);
          el1.classList.add('error-shake');
          el2.classList.add('error-shake');

          setTimeout(() => {
            el1.classList.remove('flipped', 'error-shake');
            el2.classList.remove('flipped', 'error-shake');
            state.flipped = [];
            state.isProcessing = false;
            updateStats();
          }, 500);
        }, 800);
      }
    }
  }

  // ============================================================
  // STATS & TIMER
  // ============================================================
  function updateStats() {
    $('#stat-pairs').textContent = `${state.pairsFound}/${state.totalPairs}`;
    $('#stat-attempts').textContent = state.attempts;
    $('#stat-errors').textContent = state.errors;
  }

  function timerTick() {
    state.timeRemaining--;
    updateTimerDisplay();

    if (state.timeRemaining <= 0) {
      clearInterval(state.timerInterval);
      showTimeoutOverlay();
    }
  }

  function updateTimerDisplay() {
    const mins = Math.floor(state.timeRemaining / 60);
    const secs = state.timeRemaining % 60;
    const timerEl = $('#stat-timer');
    timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    // Warning/danger states
    timerEl.classList.remove('warning', 'danger');
    if (state.timeRemaining <= 10) timerEl.classList.add('danger');
    else if (state.timeRemaining <= 30) timerEl.classList.add('warning');
  }

  function showTimeoutOverlay() {
    const overlay = $('#overlay-timeout');
    overlay.style.display = 'flex';
    $('#btn-timeout-continue').addEventListener('click', () => {
      overlay.style.display = 'none';
      endGame(true);
    }, { once: true });
  }

  // ============================================================
  // END GAME & SCORING
  // ============================================================
  function endGame(timedOut) {
    // Stop timer
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    // Calculate time used
    state.timeUsed = Math.round((Date.now() - state.gameStartTime) / 1000);

    // Calculate score
    const baseScore = (state.pairsFound / state.totalPairs) * 1000;
    let penalty = 0;
    if (state.config.penalizeErrors) {
      penalty = state.errors * state.config.penaltyPoints;
    }
    let timeBonus = 0;
    if (state.config.timeLimit > 0 && !timedOut) {
      timeBonus = (state.timeRemaining / state.config.timeLimit) * 200;
    }
    state.score = Math.max(0, Math.round(baseScore - penalty + timeBonus));

    const percentage = (state.pairsFound / state.totalPairs) * 100;

    // Show results
    showResults(percentage);

    // Play success sound
    if (!state.muted) {
      state.sounds.success.currentTime = 0;
      state.sounds.success.play().catch(e => console.warn('Success sound blocked:', e));
    }

    // Save score to Google Sheets
    saveScore(percentage);
  }

  function showResults(percentage) {
    // Icon based on performance
    let icon = '😅';
    let heading = '¡Juego Terminado!';
    let subtitle = '';

    if (percentage >= 100) {
      icon = '🏆';
      heading = '¡Perfecto!';
      subtitle = '¡Has encontrado todos los pares! Increíble memoria.';
    } else if (percentage >= 80) {
      icon = '🌟';
      heading = '¡Excelente!';
      subtitle = '¡Gran desempeño! Has ganado un código secreto.';
    } else if (percentage >= 50) {
      icon = '👍';
      heading = '¡Buen intento!';
      subtitle = 'No está mal, pero puedes mejorar. ¡Intenta de nuevo!';
    } else {
      icon = '💪';
      heading = '¡Sigue practicando!';
      subtitle = 'La práctica hace al maestro. ¡Vuelve a intentarlo!';
    }

    $('#results-icon').textContent = icon;
    $('#results-heading').textContent = heading;
    $('#results-subtitle').textContent = subtitle;

    // Player score table
    $('#result-player').textContent = state.player;
    $('#result-score').textContent = state.score;
    $('#result-pairs').textContent = `${state.pairsFound}/${state.totalPairs}`;
    $('#result-errors').textContent = state.errors;
    const mins = Math.floor(state.timeUsed / 60);
    const secs = state.timeUsed % 60;
    $('#result-time').textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    // Leaderboard
    if (state.config.showLeaderboard) {
      loadLeaderboard();
    }

    // Answers
    if (state.config.showAnswersAtEnd) {
      showAnswers();
    }

    // Play again button
    $('#btn-play-again').addEventListener('click', () => {
      showScreen('auth');
    }, { once: true });

    showScreen('results');
  }

  async function saveScore(percentage) {
    if (!APPS_SCRIPT_URL) {
      // Demo mode: simulate secret code
      if (percentage >= 80) {
        const code = 'FC-DEMO-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        showSecretCode(code);
      }
      return;
    }

    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // Apps Script requires this
        body: JSON.stringify({
          action: 'saveScore',
          gameId: state.config.gameId,
          player: state.player,
          score: state.score,
          totalPairs: state.totalPairs,
          pairsFound: state.pairsFound,
          errors: state.errors,
          timeUsed: state.timeUsed
        })
      });

      const result = await res.json();
      if (result.secretCode) {
        showSecretCode(result.secretCode);
      }
    } catch (err) {
      console.error('Error saving score:', err);
    }
  }

  function showSecretCode(code) {
    const section = $('#secret-code-section');
    section.style.display = 'block';
    $('#secret-code-value').textContent = code;
  }

  async function loadLeaderboard() {
    const section = $('#leaderboard-section');
    section.style.display = 'block';
    const tbody = $('#leaderboard-body');
    tbody.innerHTML = '';

    if (!APPS_SCRIPT_URL) {
      // Demo leaderboard
      const demoScores = [
        { player: '123456', score: 950, date: new Date().toISOString() },
        { player: '789012', score: 820, date: new Date().toISOString() },
        { player: '345678', score: 700, date: new Date().toISOString() },
      ];
      demoScores.forEach((s, i) => renderLeaderboardRow(s, i + 1, tbody));
      return;
    }

    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=getScores&gameId=${encodeURIComponent(state.config.gameId)}`);
      const data = await res.json();
      if (data.scores) {
        data.scores.forEach((s, i) => renderLeaderboardRow(s, i + 1, tbody));
      }
    } catch (err) {
      console.error('Error loading leaderboard:', err);
    }
  }

  function renderLeaderboardRow(score, rank, tbody) {
    const tr = document.createElement('tr');
    const medals = ['🥇', '🥈', '🥉'];

    tr.innerHTML = `
      <td>${rank <= 3 ? medals[rank - 1] : rank}</td>
      <td>${escapeHtml(String(score.player))}</td>
      <td><strong>${score.score}</strong></td>
      <td>${formatDate(score.date)}</td>
    `;
    tbody.appendChild(tr);
  }

  function showAnswers() {
    const section = $('#answers-section');
    section.style.display = 'block';
    const grid = $('#answers-grid');
    grid.innerHTML = '';

    // Group cards by pairId
    const pairs = {};
    state.cards.forEach(card => {
      if (!pairs[card.pairId]) pairs[card.pairId] = {};
      pairs[card.pairId][card.side] = card;
    });

    Object.values(pairs).forEach(pair => {
      const cardA = pair.A || pair[Object.keys(pair)[0]];
      const cardB = pair.B || pair[Object.keys(pair)[1]];

      const pairEl = document.createElement('div');
      pairEl.className = 'answer-pair animate-slide-up';

      const sideA = document.createElement('div');
      sideA.className = 'answer-side';
      sideA.appendChild(renderAnswerContent(cardA));

      const connector = document.createElement('div');
      connector.className = 'answer-connector';
      connector.textContent = '↔';

      const sideB = document.createElement('div');
      sideB.className = 'answer-side';
      sideB.appendChild(renderAnswerContent(cardB));

      pairEl.appendChild(sideA);
      pairEl.appendChild(connector);
      pairEl.appendChild(sideB);
      grid.appendChild(pairEl);
    });
  }

  function renderAnswerContent(card) {
    const el = document.createElement('span');
    if (!card) {
      el.textContent = '?';
      return el;
    }

    switch (card.contentType) {
      case 'text':
        el.textContent = card.content;
        break;
      case 'image':
        const img = document.createElement('img');
        img.src = card.content;
        img.alt = 'Respuesta';
        return img;
      case 'audio':
        el.textContent = '🔊 Audio';
        break;
      case 'video':
        el.textContent = '🎬 Video';
        break;
      default:
        el.textContent = card.content || '?';
    }
    return el;
  }

  // ============================================================
  // SOUND TOGGLE
  // ============================================================
  function setupSoundToggle() {
    const btns = [$('#btn-sound-toggle-auth'), $('#btn-sound-toggle-game')];

    btns.forEach(btn => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        state.muted = !state.muted;
        updateSoundUI();

        // If unmuting on auth screen, start BGM
        if (!state.muted && screens.auth.classList.contains('active')) {
          state.sounds.bgm.play().catch(e => console.warn('BGM play blocked:', e));
        } else if (state.muted) {
          state.sounds.bgm.pause();
        }
      });
    });
  }

  function updateSoundUI() {
    const btns = [$('#btn-sound-toggle-auth'), $('#btn-sound-toggle-game')];
    btns.forEach(btn => {
      if (!btn) return;
      const onIcon = btn.querySelector('.icon-volume-high');
      const offIcon = btn.querySelector('.icon-volume-off');

      if (state.muted) {
        onIcon.style.display = 'none';
        offIcon.style.display = 'block';
      } else {
        onIcon.style.display = 'block';
        offIcon.style.display = 'none';
      }
    });
  }

  // ============================================================
  // THEME TOGGLE
  // ============================================================
  function setupThemeToggle() {
    const btn = $('#btn-theme-toggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      if (next === 'light') {
        applyColors(state.config);
      }
    });
  }

  // ============================================================
  // UTILITIES
  // ============================================================
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
    } catch {
      return dateStr;
    }
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================
  setupThemeToggle();
  setupSoundToggle();
  init();

})();
