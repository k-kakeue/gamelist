/**
 * Cheers BABA - GameOver & Reset Update
 */

const MISSION_RULES = {
    'A': { title: 'Waterfall', desc: '全員一斉に飲み始め！ペアを捨てた人が止めるまで隣の人は止められません。' },
    '2': { title: 'Target', desc: '誰か一人を指名して飲ませます。' },
    '3': { title: 'Me', desc: '自分が飲みます。' },
    '4': { title: 'Right Side', desc: '自分の「右隣」の人が飲みます！' },
    '5': { title: 'Left Side', desc: '自分の「左隣」の人が飲みます！' },
    '6': { title: 'RPS Battle', desc: '全員でじゃんけん！負けた人が飲みます。' },
    '7': { title: 'Duel', desc: 'カードを引かれた人と引いた人でじゃんけん！負けた方が飲みます。' },
    '8': { title: 'Pointing', desc: '全員で「せーの」で誰かを指差し！一番多く指された人が飲みます。' },
    '9': { title: 'Partners', desc: 'カードを「引いた人」と「引かれた人」の二人で乾杯！' },
    '10': { title: 'Category', desc: '山手線ゲーム開始！じゃんけんの勝者がお題を決めてください。' },
    'J': { title: 'Make a Rule', desc: '新しいルールを創る。破った人は飲みます。' },
    'Q': { title: 'Lucky Drink♡', desc: 'カードを「引いた人」が一人を指名できる！次に自分が飲むとき代わりに飲んでもらえる（1回かぎり）' },
    'K': { title: 'CHEERS!!', desc: '自分以外の全員が飲みます！' }
};

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
// stateにisGameOverを追加
let state = { players: [], currentTurn: 0, isStarted: false, lastAction: null, isGameOver: false };
let peer, connections = [], hostConn = null, isHost = false, myId = "";

window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const targetRoomId = params.get('id');
    if (targetRoomId) {
        isHost = false;
        initPeer(targetRoomId);
        document.getElementById('initial-buttons').innerHTML = '<p style="color:var(--accent);">Connecting...</p>';
    }
};

const shuffleHand = (hand) => hand.sort(() => Math.random() - 0.5);

// --- ホスト作成 ---
document.getElementById('btn-select-host').onclick = () => { 
    isHost = true;
    document.getElementById('btn-select-host').innerText = "Preparing...";
    initPeer(); 
};

function initPeer(targetId = null) {
    peer = new Peer({ debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });

    peer.on('open', id => {
        myId = id;
        if (isHost) {
            const joinUrl = `${window.location.origin}${window.location.pathname}?id=${id}`;
            
            // confirmで「OK」ならコピーを実行
            if (confirm("テーブルを準備しました。\n招待URLをコピーしますか？")) {
                navigator.clipboard.writeText(joinUrl)
                    .then(() => {
                        console.log("Copied!");
                        startHostLobby();
                    })
                    .catch(() => {
                        prompt("コピーに失敗しました。以下を手動でコピー：", joinUrl);
                        startHostLobby();
                    });
            } else {
                startHostLobby(); // キャンセルしてもロビーには移動
            }
        } else if (targetId) {
            hostConn = peer.connect(targetId, { reliable: true }); 
            setupConnection(hostConn);
            startGameContainer(); 
        }
    });

    peer.on('connection', conn => {
        connections.push(conn);
        setupConnection(conn);
        if(isHost) { 
            if (!state.players.find(p => p.id === conn.peer)) {
                state.players.push({id: conn.peer, hand: [], isOut: false}); 
            }
            setTimeout(() => { broadcast(); updateUI(); }, 800); 
        }
    });
    peer.on('disconnected', () => peer.reconnect());
}

function startHostLobby() {
    state.players = [{id: myId, hand: [], isOut: false}]; 
    startGameContainer();
    updateUI();
}

function setupConnection(conn) {
    conn.on('data', data => {
        if(data.type === 'SYNC') { Object.assign(state, data.state); updateUI(); }
        if(isHost && data.type === 'DRAW') handleDraw(data.fromIdx, data.cardIdx, data.toId);
        if(isHost && data.type === 'RESET') resetGame();
    });
}

function broadcast() { 
    if(isHost) { 
        connections.forEach(c => { if(c.open) c.send({type: 'SYNC', state}); }); 
        updateUI(); 
    } 
}

function startGameContainer() {
    document.getElementById('role-selection').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
}

// --- ゲーム開始 ---
document.getElementById('btn-start-game').onclick = () => {
    if(!isHost || state.players.length < 2) return;
    
    state.isGameOver = false;
    state.isStarted = true;
    state.lastAction = null;
    
    let deck = [];
    ['♠','♥','♦','♣'].forEach(s => RANKS.forEach(v => deck.push({v, s, r: (s==='♥'||s==='♦')})));
    deck.push({v: 'JK', s: '🃏', r: false});
    deck.sort(() => Math.random() - 0.5);
    
    state.players.forEach(p => { p.hand = []; p.isOut = false; });
    let pIdx = 0;
    while(deck.length > 0) { state.players[pIdx].hand.push(deck.pop()); pIdx = (pIdx + 1) % state.players.length; }
    state.players.forEach(p => { p.hand = discardInitialPairs(p.hand); shuffleHand(p.hand); });
    
    state.currentTurn = 0;
    broadcast();
};

function discardInitialPairs(hand) {
    let newHand = []; 
    hand.sort((a,b) => a.v.localeCompare(b.v));
    for(let i=0; i<hand.length; i++) {
        if(i < hand.length - 1 && hand[i].v === hand[i+1].v && hand[i].v !== 'JK') i++; 
        else newHand.push(hand[i]);
    }
    return newHand;
}

function handleDraw(fromIdx, cardIdx, toId) {
    const fromPlayer = state.players[fromIdx];
    const toPlayer = state.players.find(p => p.id === toId);
    if(!fromPlayer || !toPlayer) return;
    
    const card = fromPlayer.hand.splice(cardIdx, 1)[0];
    const pairIdx = toPlayer.hand.findIndex(c => c.v === card.v && c.v !== 'JK');
    
    if(pairIdx !== -1) {
        toPlayer.hand.splice(pairIdx, 1);
        state.lastAction = { type: 'MISSION', rank: card.v, timestamp: Date.now() };
    } else { 
        toPlayer.hand.push(card); 
        state.lastAction = null; 
    }
    
    shuffleHand(fromPlayer.hand);
    shuffleHand(toPlayer.hand);
    state.players.forEach(p => { if(p.hand.length === 0) p.isOut = true; });

    // 決着判定
    const activePlayers = state.players.filter(p => !p.isOut);
    if (activePlayers.length <= 1) {
        state.isGameOver = true;
        state.isStarted = false;
    } else {
        let nextTurn = (state.currentTurn + 1) % state.players.length;
        while(state.players[nextTurn].isOut) { nextTurn = (nextTurn + 1) % state.players.length; }
        state.currentTurn = nextTurn;
    }
    broadcast();
}

// リセット処理
function resetGame() {
    state.isStarted = false;
    state.isGameOver = false;
    state.lastAction = null;
    state.players.forEach(p => { p.hand = []; p.isOut = false; });
    broadcast();
}

// --- UI更新 ---
function updateUI() {
    const meIdx = state.players.findIndex(p => p.id === myId);
    if(meIdx === -1) return;
    const me = state.players[meIdx];
    
    document.getElementById('my-p-num').innerText = `P${meIdx + 1}`;
    
    // スタートボタン表示
    document.getElementById('btn-start-game').style.display = (isHost && !state.isStarted && !state.isGameOver) ? 'flex' : 'none';

    // 敗北演出（ミッションオーバーレイを流用）
    const missionOverlay = document.getElementById('mission-overlay');
    if (state.isGameOver) {
        const loser = state.players.find(p => p.hand.some(c => c.v === 'JK')) || me;
        const isMeLoser = (loser.id === myId);
        
        document.getElementById('m-rank').innerText = "LOSE";
        document.getElementById('m-title').innerText = isMeLoser ? "YOU LOST..." : `P${state.players.indexOf(loser)+1} LOST`;
        document.getElementById('m-desc').innerText = isMeLoser ? "JOKERが残りました。罰ゲームとして1杯飲んでください！" : "決着がつきました！敗者に乾杯！";
        
        // Got Itボタンを「もう一度遊ぶ」に書き換える（ホストのみ操作可能に）
        const closeBtn = document.getElementById('btn-mission-close');
        if (isHost) {
            closeBtn.innerText = "RESET GAME";
            closeBtn.onclick = () => resetGame();
        } else {
            closeBtn.innerText = "WAITING FOR HOST...";
            closeBtn.onclick = null;
        }
        missionOverlay.style.display = 'flex';
    } else if (state.lastAction && state.lastAction.type === 'MISSION') {
        // 通常のミッション表示
        const mission = MISSION_RULES[state.lastAction.rank];
        document.getElementById('m-rank').innerText = state.lastAction.rank;
        document.getElementById('m-title').innerText = mission.title;
        document.getElementById('m-desc').innerText = mission.desc;
        const closeBtn = document.getElementById('btn-mission-close');
        closeBtn.innerText = "Got It";
        closeBtn.onclick = () => { 
            state.lastAction = null; 
            if(isHost) broadcast(); 
            document.getElementById('mission-overlay').style.display = 'none'; 
        };
        missionOverlay.style.display = 'flex';
    } else {
        missionOverlay.style.display = 'none';
    }

    // ターン中演出
    const isMyTurn = state.isStarted && state.currentTurn === meIdx && !me.isOut;
    document.body.className = isMyTurn ? 'my-turn-active' : '';
    
    document.getElementById('player-status-list').innerHTML = state.players.map((p, i) => `
        <div class="p-tag ${i === state.currentTurn && state.isStarted ? 'active' : ''} ${p.isOut ? 'is-out' : ''}">
            P${i+1}: ${p.hand.length}枚
        </div>`).join('');
    
    document.getElementById('my-hand').innerHTML = me.hand.map(c => `
        <div class="card ${c.r ? 'red' : ''} ${c.v === 'JK' ? 'joker' : ''}">${c.v}</div>`).join('');
    
    const enemyHandEl = document.getElementById('enemy-hand');
    if(state.isStarted && !me.isOut) {
        let targetIdx = (meIdx + 1) % state.players.length;
        while(state.players[targetIdx].isOut && targetIdx !== meIdx) { targetIdx = (targetIdx + 1) % state.players.length; }
        const target = state.players[targetIdx];
        document.getElementById('turn-label').innerText = isMyTurn ? "YOUR TURN" : `P${state.currentTurn+1}'S TURN`;
        enemyHandEl.innerHTML = target.hand.map((_, i) => `
            <div class="card back ${isMyTurn ? 'selectable' : ''}" onclick="window.requestDraw(${targetIdx}, ${i})"></div>`).join('');
    } else {
        enemyHandEl.innerHTML = "";
    }
}

window.requestDraw = (fromIdx, cardIdx) => {
    if(state.currentTurn !== state.players.findIndex(p => p.id === myId)) return;
    if(isHost) handleDraw(fromIdx, cardIdx, myId);
    else hostConn.send({ type: 'DRAW', fromIdx, cardIdx, toId: myId });
};