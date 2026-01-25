/**
 * Cheers BABA - Optimized Single-Click Hosting
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
const state = { players: [], currentTurn: 0, isStarted: false, lastAction: null };
let peer, connections = [], hostConn = null, isHost = false, myId = "";

// --- ページ読み込み時の自動接続（参加者用） ---
window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const targetRoomId = params.get('id');
    if (targetRoomId) {
        isHost = false;
        initPeer(targetRoomId);
        document.getElementById('initial-buttons').innerHTML = '<p style="color:var(--accent);">Connecting to Table...</p>';
    }
};

const shuffleHand = (hand) => hand.sort(() => Math.random() - 0.5);

// --- ホスト作成：ボタン一発で発行・コピー・移動 ---
document.getElementById('btn-select-host').onclick = () => { 
    isHost = true;
    document.getElementById('btn-select-host').innerText = "Generating...";
    document.getElementById('btn-select-host').disabled = true;
    initPeer(); 
};

// --- P2P通信セクション ---
function initPeer(targetId = null) {
    peer = new Peer({
        debug: 1,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', id => {
        myId = id;
        
        if (isHost) {
            // ホストの場合：URLをコピーしてロビーへ
            const joinUrl = `${window.location.origin}${window.location.pathname}?id=${id}`;
            navigator.clipboard.writeText(joinUrl).then(() => {
                alert("招待URLをコピーしました！\nLINE等に貼り付けて参加者を招待してください。");
                startHostLobby();
            }).catch(() => {
                prompt("招待URLをコピーしてください：", joinUrl);
                startHostLobby();
            });
        } else if (targetId) {
            // 参加者の場合：ホストへ接続
            hostConn = peer.connect(targetId, { reliable: true }); 
            setupConnection(hostConn);
            startGameContainer(); 
        }
        
        startHeartbeat();
    });

    peer.on('connection', conn => {
        connections.push(conn);
        setupConnection(conn);
        if(isHost) { 
            if (!state.players.find(p => p.id === conn.peer)) {
                state.players.push({id: conn.peer, hand: [], isOut: false}); 
            }
            // プレイヤー参加を検知して同期
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

function startHeartbeat() {
    setInterval(() => {
        if (peer && !peer.disconnected && peer.socket) {
            peer.socket.send({ type: 'HEARTBEAT' });
        }
    }, 15000);
}

function setupConnection(conn) {
    conn.on('data', data => {
        if(data.type === 'SYNC') { 
            Object.assign(state, data.state); 
            updateUI(); 
        }
        if(isHost && data.type === 'DRAW') {
            handleDraw(data.fromIdx, data.cardIdx, data.toId);
        }
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

// --- ゲームロジックセクション ---

document.getElementById('btn-start-game').onclick = () => {
    if(!isHost || state.players.length < 2) return alert("2人以上必要です");
    
    let deck = [];
    ['♠','♥','♦','♣'].forEach(s => RANKS.forEach(v => deck.push({v, s, r: (s==='♥'||s==='♦')})));
    deck.push({v: 'JK', s: '🃏', r: false});
    deck.sort(() => Math.random() - 0.5);
    
    let pIdx = 0;
    while(deck.length > 0) { 
        state.players[pIdx].hand.push(deck.pop()); 
        pIdx = (pIdx + 1) % state.players.length; 
    }
    
    state.players.forEach(p => { 
        p.hand = discardInitialPairs(p.hand); 
        shuffleHand(p.hand); 
    });
    
    state.isStarted = true; 
    state.currentTurn = 0; 
    state.lastAction = null;
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
    
    let nextTurn = (state.currentTurn + 1) % state.players.length;
    let guard = 0;
    while(state.players[nextTurn].isOut && guard < state.players.length) {
        nextTurn = (nextTurn + 1) % state.players.length;
        guard++;
    }
    state.currentTurn = nextTurn; 
    broadcast();
}

// --- UI更新セクション ---

function updateUI() {
    const meIdx = state.players.findIndex(p => p.id === myId);
    if(meIdx === -1) return;
    const me = state.players[meIdx];
    
    document.getElementById('my-p-num').innerText = `P${meIdx + 1}`;
    
    // ホストかつ未開始ならスタートボタンを表示
    const startBtn = document.getElementById('btn-start-game');
    if(isHost && !state.isStarted) {
        startBtn.style.display = 'flex';
    } else {
        startBtn.style.display = 'none';
    }

    const isMyTurn = state.isStarted && state.currentTurn === meIdx && !me.isOut;
    if(isMyTurn) document.body.classList.add('my-turn-active'); 
    else document.body.classList.remove('my-turn-active');
    
    const statusList = document.getElementById('player-status-list');
    statusList.innerHTML = state.players.map((p, i) => `
        <div class="p-tag ${i === state.currentTurn && state.isStarted ? 'active' : ''} ${p.isOut ? 'is-out' : ''}">
            P${i+1}: ${p.hand.length}枚
        </div>`).join('');
    
    const myHandEl = document.getElementById('my-hand');
    myHandEl.innerHTML = me.hand.map(c => `
        <div class="card ${c.r ? 'red' : ''} ${c.v === 'JK' ? 'joker' : ''}">
            <span style="font-size:8px; position:absolute; top:2px; left:3px;">${c.s || ''}</span>${c.v}
        </div>`).join('');
    
    if(state.isStarted && !me.isOut) {
        let targetIdx = (meIdx + 1) % state.players.length;
        let guard = 0;
        while(state.players[targetIdx].isOut && targetIdx !== meIdx && guard < state.players.length) {
            targetIdx = (targetIdx + 1) % state.players.length;
            guard++;
        }
        
        const target = state.players[targetIdx];
        document.getElementById('turn-label').innerText = isMyTurn ? "YOUR TURN" : `PLAYER ${state.currentTurn+1}'S TURN`;
        document.getElementById('target-info').innerText = isMyTurn ? `PICK FROM P${targetIdx+1}` : "WAITING...";
        
        const enemyHandEl = document.getElementById('enemy-hand');
        if (target && target.hand) {
            enemyHandEl.innerHTML = target.hand.map((_, i) => `
                <div class="card back ${isMyTurn ? 'selectable' : ''}" onclick="window.requestDraw(${targetIdx}, ${i})"></div>
            `).join('');
        }
    }
    
    const missionOverlay = document.getElementById('mission-overlay');
    if(state.lastAction && state.lastAction.type === 'MISSION') {
        const mission = MISSION_RULES[state.lastAction.rank];
        if(mission) {
            document.getElementById('m-rank').innerText = state.lastAction.rank;
            document.getElementById('m-title').innerText = mission.title;
            document.getElementById('m-desc').innerText = mission.desc;
            missionOverlay.style.display = 'flex';
        }
    } else {
        missionOverlay.style.display = 'none';
    }
}

window.requestDraw = (fromIdx, cardIdx) => {
    const myIdx = state.players.findIndex(p => p.id === myId);
    if(state.currentTurn !== myIdx) return;
    if(isHost) handleDraw(fromIdx, cardIdx, myId);
    else hostConn.send({ type: 'DRAW', fromIdx, cardIdx, toId: myId });
};

document.getElementById('btn-mission-close').onclick = () => { 
    state.lastAction = null; // ミッションを閉じたことを同期するために状態をクリア
    if(isHost) broadcast();
    else hostConn.send({ type: 'SYNC', state }); // 参加者の場合はホストに通知（簡易化のためSYNCを利用）
    document.getElementById('mission-overlay').style.display = 'none'; 
};