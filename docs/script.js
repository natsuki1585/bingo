const gridEl = document.getElementById("grid");
const statusEl = document.getElementById("status");
const newCardBtn = document.getElementById("newCard");
const resetBtn = document.getElementById("reset");

const SIZE = 5;
const TOTAL = SIZE * SIZE;
const MIN = 1;
const MAX = 75;
const FREE_INDEX = 12; // 5x5 の中央

const currentEl = document.getElementById("currentNumber");
const btnNext = document.getElementById("btnNext");
const btnPrev = document.getElementById("btnPrev");
const btnReset = document.getElementById("btnReset");

// ローカル開発ならこれ
const wsProto = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${wsProto}://${location.host}`);

// Pages(https)に置くなら最終的に wss:// にする必要があります
// 例：const ws = new WebSocket("wss://あなたのサーバードメイン");

let isHost = false;

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "state") {
    isHost = !!msg.isHost;

    // ホスト以外はボタン無効（授業用）
    [btnNext, btnPrev, btnReset].forEach(b => b.disabled = !isHost);

    // 現在の数字表示
    currentEl.textContent = msg.current ?? "--";

    // 出た数字で自動マーク
    if (msg.current != null) {
      autoMarkNumber(msg.current);
    }
  }
});

function sendCmd(action) {
  ws.send(JSON.stringify({ type: "cmd", action }));
}

btnNext?.addEventListener("click", () => sendCmd("next"));
btnPrev?.addEventListener("click", () => sendCmd("prev"));
btnReset?.addEventListener("click", () => sendCmd("reset"));

// card 内に数字があったら marked=true にする関数を用意
function autoMarkNumber(n) {
  // あなたの card[] 構造に合わせて実装する
  // 例：card[i].value が数値のとき一致したら card[i].marked = true
  const idx = card.findIndex(c => c.value === n);
  if (idx >= 0) {
    card[idx].marked = true;
    render();
    updateBingo();
  }
}


// ビンゴライン（横5 + 縦5 + 斜め2 = 12本）
const LINES = (() => {
  const lines = [];
  // rows
  for (let r = 0; r < SIZE; r++) {
    lines.push([...Array(SIZE)].map((_, c) => r * SIZE + c));
  }
  // cols
  for (let c = 0; c < SIZE; c++) {
    lines.push([...Array(SIZE)].map((_, r) => r * SIZE + c));
  }
  // diagonals
  lines.push([...Array(SIZE)].map((_, i) => i * SIZE + i));
  lines.push([...Array(SIZE)].map((_, i) => i * SIZE + (SIZE - 1 - i)));
  return lines;
})();

let card = []; // { value: number|string, marked: boolean }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeNewCard() {
  const pool = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);
  shuffle(pool);

  const values = pool.slice(0, TOTAL);
  card = values.map((n, idx) => ({
    value: n,
    marked: false,
  }));

  // FREE
  card[FREE_INDEX].value = "FREE";
  card[FREE_INDEX].marked = true;

  render();
  updateBingo();
  statusEl.textContent = "カードを作成しました。";
}

function resetMarks() {
  card = card.map((cell, idx) => ({
    ...cell,
    marked: idx === FREE_INDEX, // FREEは維持
  }));
  render();
  updateBingo();
  statusEl.textContent = "マークをリセットしました。";
}

function toggleMark(idx) {
  // FREEは固定にしたい場合はここでreturn
  if (idx === FREE_INDEX) return;

  card[idx].marked = !card[idx].marked;
  render();
  updateBingo();
}

function countBingosAndWinners() {
  const winners = [];
  for (const line of LINES) {
    const ok = line.every(i => card[i].marked);
    if (ok) winners.push(line);
  }
  return winners; // array of lines
}

function analyzeLines() {
  const winningLines = [];
  let reachCount = 0;

  for (const line of LINES) {
    const markedCount = line.reduce((acc, i) => acc + (card[i].marked ? 1 : 0), 0);

    if (markedCount === SIZE) {
      winningLines.push(line);
    } else if (markedCount === SIZE - 1) {
      // 4/5 でリーチ（FREE込みでOK）
      reachCount++;
    }
  }

  return { winningLines, reachCount };
}

function updateBingo() {
  // win強調を一旦消す
  const btns = [...gridEl.querySelectorAll(".cell")];
  btns.forEach(b => b.classList.remove("win"));

  const { winningLines, reachCount } = analyzeLines();

  // ビンゴラインを強調
  winningLines.flat().forEach(i => btns[i]?.classList.add("win"));

  // 表示切替（「ビンゴはまだです」は残す）
  if (winningLines.length > 0) {
    statusEl.textContent = `🎉 ビンゴ！ ${winningLines.length} 本`;
    } else if (reachCount > 0) {
    statusEl.textContent = `🔥 リーチ！ ${reachCount} 本`;
    } else {
    statusEl.textContent = "No Bingo";
  }
}


function render() {
  gridEl.innerHTML = "";

  card.forEach((cell, idx) => {
    const btn = document.createElement("button");
    btn.className = "cell";
    btn.type = "button";
    btn.textContent = cell.value;

    if (cell.marked) btn.classList.add("marked");

    btn.addEventListener("click", () => toggleMark(idx));
    gridEl.appendChild(btn);
  });
}

newCardBtn.addEventListener("click", makeNewCard);
resetBtn.addEventListener("click", resetMarks);

// 初期表示
makeNewCard();

