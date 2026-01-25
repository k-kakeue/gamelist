/**
 * Cheers BABA - Game Logic & P2P Networking
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

// --- ユーティリティ ---
const shuffleHand = (hand) => hand.sort(() => Math.random() - 0.5);

// --- 初期画面イベント ---
document.getElementById('btn-select-host').onclick = () => { 
    isHost = true; 
    initPeer(); 
    document.getElementById('initial-buttons').style.display = 'none'; 
    document.getElementById('host-id-area').style.display = 'flex'; 
};

document.getElementById('btn-show-join').onclick = () => { 
    document.getElementById('initial-buttons').style.display = 'none'; 
    document.getElementById('join-input-area').style.display = 'flex'; 
};

document.getElementById('btn-copy-start').onclick = async () => { 
    const shareText = `Cheers BABAのテーブルID: ${myId}`;
    if (navigator.share) {
        try {
            await navigator.share({ title: 'Cheers BABA', text: shareText });
        } catch (e) {
            navigator.clipboard.writeText(myId);
        }
    } else {
        navigator.clipboard.writeText(myId);
        alert("IDをコピーしました。LINE等に貼ってください。");
    }
    startGameContainer(); 
};

document.getElementById('btn-connect').onclick = () => { 
    const id = document.getElementById('join-id').value.trim(); 
    if(id) { isHost = false; initPeer(id); } 
};

document.getElementById('btn-mission-close').onclick = () => { 
    document.getElementById('mission-overlay').style.display = 'none'; 
};

// --- P2P通信セクション ---

function initPeer(targetId = null) {
    peer = new Peer({
        debug: 1,
        config: {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            sdpSemantics: 'unified-plan'
        }
    });

    peer.on('open', id => {
        myId = id;
        document.getElementById('generated-id').innerText = id;
        
        // ハートビート開始（接続維持）
        startHeartbeat();

        if(targetId) { 
            hostConn = peer.connect(targetId, { reliable: true }); 
            setupConnection(hostConn);
            startGameContainer(); 
        } else { 
            state.players = [{id, hand: [], isOut: false}]; 
            updateUI(); 
        }
    });

    peer.on('connection', conn => {
        // 同じPeerIDからの再接続を考慮
        const existingIdx = connections.findIndex(c => c.peer === conn.peer);
        if (existingIdx !== -1) connections.splice(existingIdx, 1);
        
        connections.push(conn);
        setupConnection(conn);
        
        if(isHost) { 
            if (!state.players.find(p => p.id === conn.peer)) {
                state.players.push({id: conn.peer, hand: [], isOut: false}); 
            }
            setTimeout(() => broadcast(), 800); 
        }
    });

    peer.on('disconnected', () => {
        console.log("Disconnected from server. Reconnecting...");
        peer.reconnect();
    });

    peer.on('error', err => {
        console.error("PeerJS Error:", err.type);
        if (err.type === 'peer-unavailable') {
            alert("ホストが見つかりません。IDが正しいか確認してください。");
        }
    });
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
    if(state.players.length < 2) return alert("2人以上必要です");
    
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
    
    // 次のターンのプレイヤーを決定（あがっていない人）
    let nextTurn = (state.currentTurn + 1) % state.players.length;
    let checkedCount = 0;
    while(state.players[nextTurn].isOut && checkedCount < state.players.length) {
        nextTurn = (nextTurn + 1) % state.players.length;
        checkedCount++;
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
    
    const isMyTurn = state.isStarted && state.currentTurn === meIdx && !me.isOut;
    if(isMyTurn) document.body.classList.add('my-turn-active'); 
    else document.body.classList.remove('my-turn-active');
    
    // プレイヤーステータス表示
    const statusList = document.getElementById('player-status-list');
    statusList.innerHTML = state.players.map((p, i) => {
        const isMe = (p.id === myId);
        const hasJoker = p.hand.some(c => c.v === 'JK');
        return `<div class="p-tag ${i === state.currentTurn && state.isStarted ? 'active' : ''} ${p.isOut ? 'is-out' : ''}">
                    P${i+1}: ${p.hand.length}枚 ${(isMe && hasJoker) ? '<span class="joker-warning">💀</span>' : ''}
                </div>`;
    }).join('');
    
    // 自分の手札表示
    const myHandEl = document.getElementById('my-hand');
    myHandEl.innerHTML = me.hand.map(c => `
        <div class="card ${c.r ? 'red' : ''} ${c.v === 'JK' ? 'joker' : ''}">
            <span style="font-size:8px; position:absolute; top:2px; left:3px;">${c.s}</span>${c.v}
        </div>`).join('');
    
    // ホスト用スタートボタン
    const startBtn = document.getElementById('btn-start-game');
    if(isHost && !state.isStarted) startBtn.style.display = 'flex'; 
    else startBtn.style.display = 'none';
    
    // 対戦相手の手札（引く用）
    if(state.isStarted && !me.isOut) {
        let targetIdx = (meIdx + 1) % state.players.length;
        while(state.players[targetIdx].isOut && targetIdx !== meIdx) {
            targetIdx = (targetIdx + 1) % state.players.length;
        }
        
        const target = state.players[targetIdx];
        document.getElementById('turn-label').innerText = isMyTurn ? "YOUR TURN" : `PLAYER ${state.currentTurn+1}'S TURN`;
        document.getElementById('target-info').innerText = isMyTurn ? `PICK FROM P${targetIdx+1}` : "WAITING...";
        
        const enemyHandEl = document.getElementById('enemy-hand');
        if (targetIdx !== meIdx) {
            enemyHandEl.innerHTML = target.hand.map((_, i) => `
                <div class="card back ${isMyTurn ? 'selectable' : ''}" onclick="window.requestDraw(${targetIdx}, ${i})"></div>
            `).join('');
        } else {
            enemyHandEl.innerHTML = "<div>You are the Winner!</div>";
        }
    }
    
    // ミッション表示
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

// 外部（HTMLのonclick）から呼び出せるようにグローバルに登録
window.requestDraw = (fromIdx, cardIdx) => {
    const myIdx = state.players.findIndex(p => p.id === myId);
    if(state.currentTurn !== myIdx) return;
    
    if(isHost) {
        handleDraw(fromIdx, cardIdx, myId);
    } else {
        hostConn.send({ type: 'DRAW', fromIdx, cardIdx, toId: myId });
    }
};