const config = {
    totalLevels: 100,
    basePath: 'assets/stage_desing_resources/',
    csvPath: 'assets/system_table/stage_design.csv',
    infoPath: 'assets/system_table/stage_info.csv',
    rankPath: 'assets/system_table/stage_clear_time.csv',
    openPath: 'assets/system_table/open_stage.csv',
};

let state = {
    currentLevel: 1,
    difficulty: 'easy',
    diffSettings: null,
    rankSettings: null,
    timer: 60,
    lives: 5,
    foundCount: 0,
    totalToFind: 7,
    isPlaying: false,
    isPaused: false,
    stageData: null,
    openData: null,
    targets: [],
    items: {
        hint: 5,
        timeExtend: 5,
        defense: 5,
        tickets: 5
    },
    cooldowns: {
        hint: 0,
        timeExtend: 0,
        defense: 0
    },
    currentStageScroll: 0
};

const screens = {
    splash: document.getElementById('splash-screen'),
    selection: document.getElementById('stage-selection-screen'),
    ready: document.getElementById('stage-ready-screen'),
    game: document.getElementById('game-screen'),
    effect: document.getElementById('effect-overlay')
};

function hideAllScreens() {
    Object.values(screens).forEach(s => {
        if (s) s.classList.add('hidden');
    });
}

const canvases = {
    base: document.getElementById('base-canvas'),
    diff: document.getElementById('diff-canvas')
};

const ctxs = {
    base: canvases.base.getContext('2d'),
    diff: canvases.diff.getContext('2d')
};

const elements = {
    timerBubble: document.getElementById('timer-bubble'),
    progressBar: document.getElementById('progress-bar'),
    levelNum: document.getElementById('level-num'),
    indicators: document.getElementById('find-indicators'),
    hearts: document.getElementById('hearts'),
    hintBtn: document.getElementById('hint-btn'),
    timeExtendBtn: document.getElementById('time-extend-btn'),
    pauseBtn: document.getElementById('pause-btn'),
    selectionScreen: document.getElementById('stage-selection-screen'),
    stageCards: document.getElementById('stage-cards'),
    prevBtn: document.getElementById('prev-stage'),
    nextBtn: document.getElementById('next-stage'),
    diffTabs: document.querySelectorAll('.diff-tab'),
    confirmSelectBtn: document.getElementById('select-stage-confirm'),
    closeSelectBtn: document.getElementById('close-selection'),
    ticketCount: document.getElementById('ticket-count'),
    hudHint: document.getElementById('select-hint-count'),
    hudTime: document.getElementById('select-time-count'),
    hudLife: document.getElementById('select-life-count'),
    stageCardsWrapper: document.querySelector('.stage-cards-wrapper'),
    attainStars: document.getElementById('attain-stars'),
    readyStageTitle: document.getElementById('ready-stage-title'),
    readyStageImg: document.getElementById('ready-stage-img'),
    startGameBtn: document.getElementById('start-game-btn'),
    backToSelectBtn: document.getElementById('back-to-selection'),
    readyDiffDisplay: document.getElementById('ready-diff-display'),
    readyGoalText: document.getElementById('ready-goal-text')
};

async function init() {
    canvases.diff.addEventListener('click', handleCanvasClick);
    canvases.base.addEventListener('click', handleCanvasClick);

    elements.pauseBtn.addEventListener('click', togglePause);
    elements.hintBtn.addEventListener('click', useHint);
    elements.timeExtendBtn.addEventListener('click', useTimeExtend);

    // 좌우 스크롤 버튼 (클릭 + 터치 대응)
    const handlePrev = (e) => { e.preventDefault(); scrollStages(-3); };
    const handleNext = (e) => { e.preventDefault(); scrollStages(3); };

    elements.prevBtn.addEventListener('click', handlePrev);
    elements.prevBtn.addEventListener('touchstart', handlePrev, { passive: false });
    elements.nextBtn.addEventListener('click', handleNext);
    elements.nextBtn.addEventListener('touchstart', handleNext, { passive: false });

    elements.stageCardsWrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        scrollStages(dir);
    }, { passive: false });

    elements.diffTabs.forEach(tab => {
        tab.addEventListener('click', (e) => switchDifficulty(e.target.dataset.diff));
    });

    elements.backToSelectBtn.addEventListener('click', showStageSelection);
    elements.startGameBtn.addEventListener('click', tryStartGame);

    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.addEventListener('click', showStageSelection);

    // 통합 이펙트 오버레이 버튼 리스너
    const retryBtn = document.getElementById('retry-btn-overlay');
    const selectBtn = document.getElementById('select-btn-overlay');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            document.getElementById('effect-overlay').classList.add('hidden');
            loadLevel(state.currentLevel);
        });
    }
    if (selectBtn) {
        selectBtn.addEventListener('click', () => {
            document.getElementById('effect-overlay').classList.add('hidden');
            showStageSelection();
        });
    }

    await Promise.all([
        loadStageData(),
        loadRankData(),
        loadDiffData(),
        loadOpenData()
    ]);

    loadLastCleared(); // 마지막 클리어 설정 복구
    showSplash();
}

function showSplash() {
    hideAllScreens();
    if (screens.splash) screens.splash.classList.remove('hidden');
}

function showStageSelection() {
    hideAllScreens();
    clearAllEffects(); // 잔상 제거
    if (screens.selection) screens.selection.classList.remove('hidden');
    renderStageCards();
    updateHUD();
}

/**
 * 화면상의 모든 동적 이펙트 요소 제거
 */
function clearAllEffects() {
    const effects = document.querySelectorAll('.effect-text-overlay, .correct-mark, .wrong-mark');
    effects.forEach(el => el.remove());
}

/**
 * 범용 애니메이션 이펙트 시스템 (MP4 대체)
 */
function playEffect(type, callback, x, y) {
    const overlay = document.getElementById('effect-overlay');
    const content = document.getElementById('effect-content');
    const backdrop = document.querySelector('.effect-backdrop');

    if (!overlay) return;

    switch (type) {
        case 'start':
            showTextEffect("READY... START!", 1500, callback);
            break;

        case 'correct':
            showMarkerEffect("○", x, y, "correct-mark");
            if (callback) callback();
            break;

        case 'wrong':
            showMarkerEffect("×", x, y, "wrong-mark");
            screens.game.classList.add('shake');
            setTimeout(() => screens.game.classList.remove('shake'), 400);
            if (callback) callback();
            break;

        case 'time':
            showTextEffect("TIME EXTENDED!", 1000, callback);
            break;

        case 'success':
            overlay.classList.remove('hidden');
            if (content) content.classList.remove('hidden');
            if (backdrop) backdrop.classList.remove('transparent');
            // endGame에서 상세 텍스트를 제어하므로 여기서는 오버레이만 활성화
            break;

        case 'failure':
            overlay.classList.remove('hidden');
            if (content) content.classList.remove('hidden');
            if (backdrop) backdrop.classList.remove('transparent');
            break;
    }
}

function showTextEffect(text, duration, callback) {
    const el = document.createElement('div');
    el.className = 'effect-text-overlay';
    el.innerHTML = `<div class="ready-start-text">${text}</div>`;
    document.body.appendChild(el);

    setTimeout(() => {
        el.remove();
        if (callback) callback();
    }, duration);
}

function showMarkerEffect(symbol, x, y, className) {
    // 캔버스 클릭 위치 x, y가 전달된 경우 해당 위치에, 없으면 중앙에 표시
    const marker = document.createElement('div');
    marker.className = className;
    marker.innerText = symbol;

    if (x !== undefined && y !== undefined) {
        // 클릭 좌표 기반 (게임 화면 내) - 퍼센트로 변환하여 스케일 대응
        const leftPercent = (x / canvases.diff.width) * 100;
        const topPercent = (y / canvases.diff.height) * 100;

        marker.style.left = `${leftPercent}%`;
        marker.style.top = `${topPercent}%`;

        // 캔버스 컨테이너에 부착해야 좌표가 맞음
        const targetContainer = canvases.diff.parentElement;
        targetContainer.appendChild(marker);
    } else {
        // 중앙 기반
        marker.style.left = '50%';
        marker.style.top = '50%';
        document.body.appendChild(marker);
    }

    setTimeout(() => marker.remove(), 600);
}

async function loadRankData() {
    try {
        const res = await fetch(config.rankPath + '?v=' + Date.now());
        state.rankSettings = parseCSV(await res.text());
    } catch (err) {
        console.error("Rank data load failed", err);
    }
}

async function loadDiffData() {
    try {
        const res = await fetch(config.infoPath + '?v=' + Date.now());
        state.diffSettings = parseCSV(await res.text());
    } catch (err) {
        console.error("Diff data load failed", err);
    }
}

async function loadStageData() {
    try {
        const res = await fetch(config.csvPath + '?v=' + Date.now());
        state.stageData = parseCSV(await res.text());
        updateSelectionHUD();
    } catch (err) {
        console.error("Stage data load failed", err);
    }
}

async function loadOpenData() {
    try {
        const res = await fetch(config.openPath + '?v=' + Date.now());
        state.openData = parseCSV(await res.text());
    } catch (err) {
        console.error("Open data load failed", err);
    }
}

function isStageUnlocked(globalNum) {
    if (!state.openData) return true; // 데이터 로드 전엔 기본 허용

    const criteria = state.openData.find(d => parseInt(d.num) === globalNum);
    if (!criteria) return true;

    const reqLevel = criteria.require_level;
    const reqNum = parseInt(criteria.require_num);
    const reqRank = parseInt(criteria.require_rank);

    // 조건이 없으면 (1스테이지 등) 항상 오픈
    if (!reqLevel || isNaN(reqNum)) return true;

    // localStorage에서 해당 조건의 별점 확인
    const stars = getProgress(reqNum, reqLevel);
    return stars >= reqRank;
}

function getLockMessage(globalNum) {
    if (!state.openData) return "";
    const criteria = state.openData.find(d => parseInt(d.num) === globalNum);
    if (!criteria) return "";
    return `${criteria.require_txt} ${criteria.common_txt}`;
}

function saveLastCleared() {
    localStorage.setItem('pengsoo_last_cleared_difficulty', state.difficulty || 'normal');
    localStorage.setItem('pengsoo_last_cleared_level', state.currentLevel || 1);
}

function saveCurrentDifficulty() {
    localStorage.setItem('pengsoo_current_difficulty', state.difficulty || 'normal');
}

function loadLastCleared() {
    const lastDiff = localStorage.getItem('pengsoo_last_cleared_difficulty') || localStorage.getItem('pengsoo_current_difficulty');
    const lastLevel = localStorage.getItem('pengsoo_last_cleared_level');

    if (lastDiff) {
        state.difficulty = lastDiff;
        elements.diffTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.diff === lastDiff);
        });
        updateSelectionHUD(); // HUD 정보(아이템 등) 동기화
    } else {
        // 데이터가 전혀 없는 경우 (최초 진입) 기본값 명시
        state.difficulty = 'easy';
        elements.diffTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.diff === 'easy');
        });
        updateSelectionHUD();
    }

    if (lastLevel) {
        state.currentLevel = parseInt(lastLevel);
    } else {
        // 최초 진입 시 스테이지 1
        state.currentLevel = 1;
    }
}

function parseCSV(text) {
    // UTF-8 BOM 제거
    const cleanText = text.replace(/^\uFEFF/, '').trim();
    const lines = cleanText.split(/\r?\n/);
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = values[i] ? values[i].trim() : "";
        });
        return obj;
    });
}

function showStageSelection() {
    hideAllScreens();
    screens.selection.classList.remove('hidden');
    renderStageCards();

    // 현재 레벨 또는 마지막 잠금해제 레벨로 포커싱
    setTimeout(() => focusStage(state.currentLevel), 100);
}

function renderStageCards() {
    elements.stageCards.innerHTML = '';

    // 난이도별 글로벌 시작 번호 계산 (easy: 1, normal: 101, hard: 201)
    let startNum = 1;
    if (state.difficulty === 'normal') startNum = 101;
    else if (state.difficulty === 'hard') startNum = 201;

    for (let i = 0; i < config.totalLevels; i++) {
        const globalNum = startNum + i;
        const localNum = i + 1; // 화면에 표시될 번호 (1-100)

        const unlocked = isStageUnlocked(globalNum);

        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'stage-card-item';

        const card = document.createElement('div');
        card.className = 'stage-card' + (unlocked ? '' : ' locked');
        if (!unlocked) {
            card.dataset.lockMsg = getLockMessage(globalNum);
        }

        const stageInfo = state.stageData ? state.stageData.find(d => parseInt(d.level) === globalNum) : null;
        const thumbUrl = stageInfo ? config.basePath + stageInfo.image_original : '';

        const savedStars = getProgress(globalNum, state.difficulty);

        card.innerHTML = `
            <div class="thumb" style="background-image: url('${thumbUrl}')"></div>
            <div class="stars-overlay">
                ${[1, 2, 3, 4, 5].map(n => `
                    <span class="star ${n <= savedStars ? 'filled' : ''}">★</span>
                `).join('')}
            </div>
        `;

        const title = document.createElement('div');
        title.className = 'stage-title';
        title.innerText = `<스테이지 ${localNum}>`;

        card.addEventListener('click', () => {
            if (unlocked) {
                state.currentLevel = globalNum;
                // UI 선택 표시
                document.querySelectorAll('.stage-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');

                // 이미지 클릭 시 즉시 시작 (유저 요청)
                showStageReady(globalNum);
            } else {
                // 잠금 메시지 표시 (이미 가이드가 뜨거나 얼럿 등)
                // alert(card.dataset.lockMsg); 
            }
        });

        itemWrapper.appendChild(card);
        itemWrapper.appendChild(title);
        elements.stageCards.appendChild(itemWrapper);
    }
    // render 시점에 자동 포커싱 (첫 진입 등)
    // focusStage(state.currentLevel); // showStageSelection에서 호출하므로 중복 방지
    updateSliderPosition();
}

function focusStage(level) {
    const firstItem = elements.stageCards.querySelector('.stage-card-item');
    if (!firstItem) return;

    const cardWidth = firstItem.offsetWidth + 40; // 아이템 너비 + gap(40)
    const index = (level - 1) % 100; // 난이도별 100개 카드 기준 인덱스 0-99
    const viewWidth = elements.stageCardsWrapper.clientWidth;

    // 카드 중앙 자표: 시작패딩(50) + (인덱스 * 간격) + (아이템너비/2)
    const cardCenter = 50 + (index * cardWidth) + (firstItem.offsetWidth / 2);
    let targetScroll = cardCenter - (viewWidth / 2);

    const totalContentWidth = config.totalLevels * cardWidth + 100;
    const maxScroll = Math.max(0, totalContentWidth - viewWidth);

    state.currentStageScroll = Math.min(Math.max(0, targetScroll), maxScroll);
    updateSliderPosition();
}

function scrollStages(dir) {
    const firstItem = elements.stageCards.querySelector('.stage-card-item');
    if (!firstItem) return;

    const cardWidth = firstItem.offsetWidth + 40;
    const totalContentWidth = config.totalLevels * cardWidth + 100;
    const viewWidth = elements.stageCardsWrapper.clientWidth;
    const maxScroll = Math.max(0, totalContentWidth - viewWidth);

    // dir은 이제 카드 개수 단위로 전달됨 (예: 3 또는 -3)
    state.currentStageScroll = Math.min(Math.max(0, state.currentStageScroll + dir * cardWidth), maxScroll);
    updateSliderPosition();
}

function updateSliderPosition() {
    elements.stageCards.style.transform = `translateX(-${state.currentStageScroll}px)`;
}

function switchDifficulty(diff) {
    state.difficulty = diff;
    saveCurrentDifficulty(); // 현재 선택된 난이도 저장
    elements.diffTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.diff === diff);
    });
    updateSelectionHUD();
    renderStageCards(); // 난이도 변경 시 별점 정보 갱신을 위해 다시 렌더링
}

function updateSelectionHUD() {
    const settings = state.diffSettings.find(s => s.level === state.difficulty);
    if (settings) {
        elements.ticketCount.innerText = 'x5'; // 임시 고정값 (시안용)
        elements.hudHint.innerText = 'x' + settings.item_hint;
        elements.hudTime.innerText = 'x' + settings.item_time_ex;
        elements.hudLife.innerText = 'x' + config.lives;
    }
}

function messageWrong(customMsg) {
    elements.game.classList.add('shake');
    setTimeout(() => elements.game.classList.remove('shake'), 500);

    if (customMsg) {
        console.log(customMsg); // UI 메시지 알림 등으로 확장 가능
    }
}

function startGame() {
    hideAllScreens();
    screens.game.classList.remove('hidden');
    loadLevel(state.currentLevel);

    // 시작 연출 후 타이머 시작
    playEffect('start', () => {
        startTimer();
    });
}

async function loadLevel(level) {
    const data = state.stageData.find(d => parseInt(d.level) === level);
    const settings = state.diffSettings.find(s => s.level === state.difficulty);

    if (!data || !settings) {
        endGame(true, "축하합니다! 모든 스테이지를 정복하셨군요!");
        return;
    }

    clearPersistentCircles();
    state.isPlaying = false;
    state.foundCount = 0;
    state.targets = [];
    state.timer = parseInt(settings.limit_time);

    // 아이템 수량 난이도별 설정 (기존 tickets 보존)
    state.items = {
        ...state.items,
        hint: parseInt(settings.item_hint),
        timeExtend: parseInt(settings.item_time_ex),
        defense: parseInt(settings.item_def)
    };

    elements.levelNum.innerText = String(level).padStart(3, '0');

    const baseImg = await loadImage(config.basePath + data.image_original);
    setupCanvas(canvases.base, baseImg);
    setupCanvas(canvases.diff, baseImg);

    // 7개의 후보군을 모두 로드
    const candidates = [];
    for (let i = 1; i <= 7; i++) {
        const loc = data[`image_location${i}`];
        const imgName = data[`image_incorrect${i}`];
        if (loc && imgName && loc.includes('x')) {
            const [x, y] = loc.split('x').map(Number);
            if (!isNaN(x) && !isNaN(y)) {
                const partImg = await loadImage(config.basePath + imgName);
                candidates.push({ x, y, width: partImg.width, height: partImg.height, img: partImg });
            }
        }
    }

    // 난이도에 따라 필요한 개수만큼 무작위 선택
    let targetCount = 7;
    if (state.difficulty === 'easy') targetCount = 2;
    else if (state.difficulty === 'normal') targetCount = 4;

    // 후보군 섞기
    candidates.sort(() => Math.random() - 0.5);
    const selected = candidates.slice(0, targetCount);

    selected.forEach((t, idx) => {
        state.targets.push({ ...t, id: idx, found: false });
        drawPart(ctxs.diff, t.img, t.x, t.y);
    });

    state.totalToFind = selected.length;
    setupIndicators(state.totalToFind);
    updateHUD();

    state.isPlaying = true;
    state.isPaused = false;
}

function setupIndicators(count) {
    elements.indicators.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const ind = document.createElement('div');
        ind.className = 'indicator';
        ind.innerText = '?';
        elements.indicators.appendChild(ind);
    }
}

function updateHUD() {
    // 하트 업데이트
    elements.hearts.innerHTML = '';
    for (let i = 0; i < state.lives; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart';
        heart.innerText = '❤️';
        elements.hearts.appendChild(heart);
    }

    // 아이템 수량 업데이트
    elements.hintBtn.querySelector('.item-count').innerText = `(${state.items.hint})`;
    elements.timeExtendBtn.querySelector('.item-count').innerText = `(${state.items.timeExtend})`;

    // 실수 방어(defense) 아이콘 표시가 필요하다면 여기에 추가 (현재는 로그나 메시지로 대응 가능)

    // 인디케이터 업데이트
    const indElements = elements.indicators.querySelectorAll('.indicator');
    indElements.forEach((ind, i) => {
        if (i < state.foundCount) {
            ind.classList.add('found');
            ind.innerText = '✔';
        }
    });
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
    const seconds = Math.max(0, totalSeconds) % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startTimer() {
    state.timerInterval = setInterval(() => {
        if (state.isPaused) return;

        state.timer--;
        elements.timerBubble.innerText = formatTime(state.timer);

        const settings = state.diffSettings.find(s => s.level === state.difficulty);
        const limit = settings ? parseInt(settings.limit_time) : 60;
        const progress = (state.timer / limit) * 100;
        elements.progressBar.style.width = `${progress}%`;

        if (state.timer <= 0) {
            endGame(false, "아쉽네요. 다시 도전해보세요~!");
        }
    }, 1000);
}

function togglePause() {
    state.isPaused = !state.isPaused;
    elements.pauseBtn.querySelector('span').innerText = state.isPaused ? '계속 하기' : '일시 정지';
}

function useHint() {
    if (state.items.hint <= 0 || !state.isPlaying || state.isPaused || state.cooldowns.hint > 0) return;

    state.items.hint--;
    startCooldown('hint');
    updateHUD();

    // 아직 찾지 못한 타겟들의 목록을 추출
    const unfoundTargets = state.targets.filter(t => !t.found);

    if (unfoundTargets.length > 0) {
        // 남은 것 중 무작위로 하나 선택
        const randomIndex = Math.floor(Math.random() * unfoundTargets.length);
        const target = unfoundTargets[randomIndex];

        // 정답 조각의 중심점 계산
        const centerX = target.x + (target.width / 2);
        const centerY = target.y + (target.height / 2);

        // 양쪽 캔버스 컨테이너에 힌트 효과 생성
        [canvases.base, canvases.diff].forEach(canvas => {
            const container = canvas.parentElement;
            const hint = document.createElement('div');
            hint.className = 'hint-effect';

            // 크기 설정
            const size = 100;
            hint.style.width = size + 'px';
            hint.style.height = size + 'px';

            // 퍼센트 좌표 (반응형)
            hint.style.left = (centerX / canvas.width * 100) + '%';
            hint.style.top = (centerY / canvas.height * 100) + '%';

            container.appendChild(hint);

            // 2초 후 제거
            setTimeout(() => hint.remove(), 2000);
        });
    }
}

function useTimeExtend() {
    if (state.items.timeExtend <= 0 || !state.isPlaying || state.isPaused || state.cooldowns.timeExtend > 0) return;

    const settings = state.diffSettings.find(s => s.level === state.difficulty);
    // CSV에 컬럼이 없을 경우 기본 10초 연장
    const timeExtendValue = (settings && settings.item_time_ex_val) ? parseInt(settings.item_time_ex_val) : 10;

    state.items.timeExtend--;
    state.timer = (parseInt(state.timer) || 0) + timeExtendValue;
    startCooldown('timeExtend');

    playEffect('time');

    // UI 즉시 업데이트
    elements.timerBubble.innerText = formatTime(state.timer);
    updateHUD();
}

function handleCanvasClick(e) {
    if (!state.isPlaying || state.isPaused) return;

    // 클릭된 타겟 캔버스를 기준으로 좌표 계산
    const targetCanvas = e.currentTarget;
    const rect = targetCanvas.getBoundingClientRect();
    const scaleX = targetCanvas.width / rect.width;
    const scaleY = targetCanvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    checkHit(x, y);
}

function checkHit(x, y) {
    let hit = false;
    const padding = 30; // 히트박스 여유 범위 (유저 요청 반영)

    for (const target of state.targets) {
        if (!target.found &&
            x >= (target.x - padding) && x <= (target.x + target.width + padding) &&
            y >= (target.y - padding) && y <= (target.y + target.height + padding)) {
            target.found = true;
            state.foundCount++;
            hit = true;

            playEffect('correct', null, x, y);

            const centerX = target.x + (target.width / 2);
            const centerY = target.y + (target.height / 2);
            drawPersistentCircles(centerX, centerY);
            updateHUD();
            break;
        }
    }
    if (hit) {
        if (state.foundCount >= state.targets.length) {
            clearInterval(state.timerInterval);
            setTimeout(() => {
                endGame(true, "");
            }, 1000);
        }
    } else {
        playEffect('wrong', null, x, y);

        if (state.items.defense > 0 && state.cooldowns.defense <= 0) {
            state.items.defense--;
            startCooldown('defense');
            showDefenseEffect();
            messageWrong("방어 아이템 발동! 생명을 지켰습니다.");
        } else {
            const settings = state.diffSettings.find(s => s.level === state.difficulty);
            const penalty = settings ? parseInt(settings.no_def_time) : 10;
            state.timer = Math.max(0, state.timer - penalty);
            messageWrong(`틀렸습니다! ${penalty}초 차감!`);
            state.lives--;
            if (state.lives <= 0) {
                endGame(false, "아쉽네요. 다시 도전해보세요~!");
            }
        }
        updateHUD();
    }
}

function drawPersistentCircles(imgX, imgY) {
    // 양쪽 캔버스 컨테이너에 각각 원 추가
    [canvases.base, canvases.diff].forEach(canvas => {
        const container = canvas.parentElement;

        const circle = document.createElement('div');
        circle.className = 'found-circle';

        // 원의 크기 (정답 조각 크기에 맞춰 퍼센트로 계산할 수도 있지만, 우선 고정 크기 사용)
        const size = 60;

        // 퍼센트 좌표 계산 (이미지 실제 크기 대비 위치)
        const leftPercent = (imgX / canvas.width) * 100;
        const topPercent = (imgY / canvas.height) * 100;

        // transform: translate(-50%, -50%)를 사용하여 중심점 맞춤
        circle.style.left = leftPercent + '%';
        circle.style.top = topPercent + '%';
        circle.style.width = size + 'px';
        circle.style.height = size + 'px';
        circle.style.transform = 'translate(-50%, -50%)';

        container.appendChild(circle);
    });
}

function clearPersistentCircles() {
    const circles = document.querySelectorAll('.found-circle');
    circles.forEach(c => c.remove());
}

function messageWrong(customMsg) {
    screens.game.classList.add('shake');
    setTimeout(() => screens.game.classList.remove('shake'), 500);
}

function showDefenseEffect() {
    const shield = document.createElement('div');
    shield.className = 'shield-effect';
    document.body.appendChild(shield);
    setTimeout(() => shield.remove(), 500);
}

function calculateRank(timeLeft) {
    if (!state.rankSettings) return { rank: 1, score: 0 };

    // 현재 난이도에 해당하는 등급 데이터 필터링
    const levelRanks = state.rankSettings.filter(r => r.level === state.difficulty);

    for (const rankInfo of levelRanks) {
        const min = parseInt(rankInfo.time_min) || 0;
        const max = rankInfo.time_max ? parseInt(rankInfo.time_max) : Infinity;

        if (timeLeft >= min) {
            // (max가 없거나 timeLeft가 max 이하면 매칭)
            if (!rankInfo.time_max || timeLeft <= parseInt(rankInfo.time_max)) {
                return {
                    rank: parseInt(rankInfo.time_rank) || 1,
                    score: parseInt(rankInfo.time_score) || 0
                };
            }
        }
    }
    return { rank: 1, score: 0 };
}

function endGame(isWin, msg = "") {
    state.isPlaying = false;
    clearInterval(state.timerInterval);
    clearAllEffects(); // 이전 연출 잔상 제거

    const overlay = document.getElementById('effect-overlay');
    const content = document.getElementById('effect-content');
    const title = document.getElementById('effect-title');
    const msgEl = document.getElementById('effect-msg');
    const starContainer = document.getElementById('effect-stars');

    playEffect(isWin ? 'success' : 'failure');

    // 비디오 연출 중간(또는 끝)에 결과 텍스트와 버튼 노출
    setTimeout(() => {
        if (content) content.classList.remove('hidden');
        if (isWin) {
            const rankData = calculateRank(state.timer);
            saveProgress(state.currentLevel, state.difficulty, rankData.rank);
            if (title) {
                title.textContent = "PERFECT!";
                title.style.color = "#ffcc00";
            }
            const localNum = (state.currentLevel - 1) % 100 + 1;
            if (msgEl) msgEl.textContent = `<스테이지 ${localNum}> ${rankData.rank}성으로 클리어! 펭-바!`;
            if (starContainer) {
                starContainer.innerHTML = [1, 2, 3, 4, 5].map(n =>
                    `<span class="star ${n <= rankData.rank ? 'filled' : ''}">★</span>`
                ).join('');
            }
        } else {
            if (title) {
                title.textContent = "FAILED...";
                title.style.color = "#888";
            }
            if (msgEl) msgEl.textContent = msg || "아쉽네요. 다시 도전해보세요~!";
            if (starContainer) starContainer.innerHTML = "";
        }
    }, 1500);

    if (isWin) {
        saveLastCleared(); // 성공 시에만 마지막 클리어 정보 저장
    }
    renderStageCards();
}

function saveProgress(stageId, difficulty, rank) {
    const key = `pengsoo_stage_${stageId}_${difficulty}`;
    const currentBest = getProgress(stageId, difficulty);
    if (rank > currentBest) {
        localStorage.setItem(key, rank);
    }
}

function getProgress(stageId, difficulty) {
    const key = `pengsoo_stage_${stageId}_${difficulty}`;
    const saved = localStorage.getItem(key);
    return saved ? parseInt(saved) : 0;
}

function showStageReady(level) {
    hideAllScreens();
    screens.ready.classList.remove('hidden');

    state.currentLevel = level;
    const localNum = (level - 1) % 100 + 1;
    const stageInfo = state.stageData.find(d => parseInt(d.level) === level);
    elements.readyStageTitle.innerText = `스테이지 ${localNum}`;

    // 난이도 및 목표 문구 업데이트
    const diffMap = { 'easy': '쉬움', 'normal': '보통', 'hard': '어려움' };
    if (elements.readyDiffDisplay) {
        elements.readyDiffDisplay.innerText = diffMap[state.difficulty] || state.difficulty;
    }

    const settings = state.diffSettings.find(s => s.level === state.difficulty);
    const targetCount = settings ? (settings.match || 7) : 7;
    if (elements.readyGoalText) {
        elements.readyGoalText.innerText = `제한 시간내에 틀린 그림을 ${targetCount}개 찾기`;
    }
    if (stageInfo) {
        elements.readyStageImg.src = config.basePath + stageInfo.image_original;
    }

    // 별점 갱신 (localStorage 데이터 반영)
    const stars = getProgress(level, state.difficulty);
    elements.attainStars.innerHTML = [1, 2, 3, 4, 5].map(n =>
        `<span class="star ${n <= stars ? 'filled' : ''}">★</span>`
    ).join('');

    updateHUD();
}

function tryStartGame() {
    if (state.items.tickets <= 0) {
        alert("입장권이 부족합니다!");
        return;
    }
    state.items.tickets--;
    startGame();
}

function buyItem(type) {
    // 나중에 재화 로직 추가 예정 (현재는 무료 무한 구매 느낌)
    state.items[type]++;
    updateHUD();
}

// 쿨타임 시작
function startCooldown(type) {
    state.cooldowns[type] = 2; // 2초
    const btn = type === 'hint' ? elements.hintBtn : (type === 'timeExtend' ? elements.timeExtendBtn : null);
    if (!btn) return;

    const overlay = document.createElement('div');
    overlay.className = 'cooldown-overlay';
    btn.appendChild(overlay);

    const timer = setInterval(() => {
        state.cooldowns[type]--;
        if (state.cooldowns[type] <= 0) {
            clearInterval(timer);
            overlay.remove();
        } else {
            overlay.innerText = state.cooldowns[type];
        }
    }, 1000);
}

// 기존 함수들 수정...
function updateHUD() {
    // ... 상단 HUD 수량 표시 업데이트 (기존 ID들 대응)
    const ticketIds = ['ticket-count', 'ready-ticket-count'];
    const hintIds = ['select-hint-count', 'ready-hint-count'];
    const timeIds = ['select-time-count', 'ready-time-count'];
    const lifeIds = ['select-life-count', 'ready-life-count'];

    ticketIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = `x${state.items.tickets}`;
    });
    hintIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = `x${state.items.hint}`;
    });
    timeIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = `x${state.items.timeExtend}`;
    });
    lifeIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = `x${state.items.defense}`;
    });

    // 인게임 HUD 업데이트 (기존 로직)
    if (elements.hintBtn) {
        elements.hintBtn.querySelector('.item-count').innerText = `(${state.items.hint})`;
    }
    if (elements.timeExtendBtn) {
        elements.timeExtendBtn.querySelector('.item-count').innerText = `(${state.items.timeExtend})`;
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function setupCanvas(canvas, img) {
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
}

function drawPart(ctx, img, x, y) {
    ctx.drawImage(img, x, y);
}

init();
