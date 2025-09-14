// Q*BERT GAME - FARCASTER MINI APP EDITION
// With token rewards on Base network

import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk@latest';
import { 
  createConfig, 
  http, 
  getAccount,
  writeContract,
  waitForTransactionReceipt,
  readContract
} from 'https://esm.sh/wagmi@latest';
import { base } from 'https://esm.sh/wagmi@latest/chains';
import { parseUnits, formatUnits } from 'https://esm.sh/viem@latest';

// Token Configuration
const TOKEN_CONFIG = {
  address: '0x8b4b7a8b0bf35baf848308b9dfb219dfe5b661e1', // Q*BERT token
  ownerWallet: '0x8a9A07895eeea99f39C7B5b6FeCFd496Fa5B62Fc', // Your wallet
  decimals: 18,
  rewardsPerLevel: 100,
  bonusEveryFiveLevels: 500
};

// ERC20 ABI for token transfers
const ERC20_ABI = [
  {
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

// Wagmi Configuration
let wagmiConfig;
let ethereumProvider;
let walletConnected = false;
let userAddress = null;
let pendingTokens = 0;

// Game state
let gameState = {
  qbertPosition: { row: 0, col: 0 },
  score: 0,
  level: 1,
  round: 1,
  lives: 3,
  gameActive: false,
  gameStarted: false,
  cubesChanged: [],
  cubeStates: {},
  enemies: [],
  enemyTimer: 0,
  tokensEarned: 0,
  totalTokensEarned: 0
};

// Initialize Farcaster SDK
async function initializeFarcasterSDK() {
  try {
    console.log('🚀 Initializing Farcaster SDK...');
    
    // Hide splash screen when ready
    await sdk.actions.ready();
    console.log('✅ Farcaster SDK ready!');
    
    // Get user context if available
    const context = sdk.context;
    console.log('📱 Context:', context);
    
    // Setup wallet provider
    ethereumProvider = await sdk.wallet.getEthereumProvider();
    if (ethereumProvider) {
      console.log('💰 Ethereum provider available');
      setupWagmi();
    }
    
  } catch (error) {
    console.error('Error initializing Farcaster SDK:', error);
  }
}

// Setup Wagmi configuration
async function setupWagmi() {
  try {
    wagmiConfig = createConfig({
      chains: [base],
      transports: {
        [base.id]: http()
      }
    });
    
    console.log('⚙️ Wagmi configured for Base network');
  } catch (error) {
    console.error('Error setting up Wagmi:', error);
  }
}

// Connect wallet
async function connectWallet() {
  try {
    if (!ethereumProvider) {
      console.error('No Ethereum provider available');
      return;
    }
    
    const accounts = await ethereumProvider.request({ 
      method: 'eth_requestAccounts' 
    });
    
    if (accounts && accounts.length > 0) {
      userAddress = accounts[0];
      walletConnected = true;
      
      document.getElementById('wallet-status').textContent = 
        `Connected: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
      document.getElementById('connect-wallet').textContent = 'Connected ✓';
      document.getElementById('connect-wallet').classList.add('connected');
      
      // Check token balance
      await updateTokenBalance();
      
      console.log('✅ Wallet connected:', userAddress);
    }
  } catch (error) {
    console.error('Error connecting wallet:', error);
  }
}

// Update token balance display
async function updateTokenBalance() {
  if (!walletConnected || !userAddress) return;
  
  try {
    const balance = await readContract(wagmiConfig, {
      address: TOKEN_CONFIG.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAddress]
    });
    
    const formattedBalance = formatUnits(balance, TOKEN_CONFIG.decimals);
    document.getElementById('token-balance').textContent = 
      Math.floor(parseFloat(formattedBalance));
  } catch (error) {
    console.error('Error reading token balance:', error);
  }
}

// Award tokens to player
async function awardTokens(amount) {
  if (!walletConnected || !userAddress) {
    pendingTokens += amount;
    showTokenAnimation(`+${amount} Q*BERT (Connect wallet to claim)`);
    return;
  }
  
  try {
    console.log(`🎁 Awarding ${amount} tokens to ${userAddress}`);
    
    // Transfer tokens from owner wallet to player
    const hash = await writeContract(wagmiConfig, {
      address: TOKEN_CONFIG.address,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [
        userAddress,
        parseUnits(amount.toString(), TOKEN_CONFIG.decimals)
      ]
    });
    
    // Wait for transaction
    const receipt = await waitForTransactionReceipt(wagmiConfig, {
      hash,
      confirmations: 1
    });
    
    if (receipt.status === 'success') {
      gameState.totalTokensEarned += amount;
      showTokenAnimation(`+${amount} Q*BERT Tokens!`);
      await updateTokenBalance();
      console.log('✅ Tokens awarded successfully!');
    }
    
  } catch (error) {
    console.error('Error awarding tokens:', error);
    showTokenAnimation(`Token transfer pending...`);
  }
}

// Show token reward animation
function showTokenAnimation(text) {
  const elem = document.createElement('div');
  elem.className = 'token-reward';
  elem.textContent = text;
  elem.style.left = '50%';
  elem.style.top = '50%';
  elem.style.transform = 'translateX(-50%)';
  document.getElementById('game').appendChild(elem);
  
  setTimeout(() => elem.remove(), 2000);
}

// Pyramid structure: 28 cubes in 7 rows
const pyramidMap = [
  [0, 0],
  [1, 0], [1, 1],
  [2, 0], [2, 1], [2, 2],
  [3, 0], [3, 1], [3, 2], [3, 3],
  [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
  [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5],
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6]
];

// Level rules
const levelRules = {
  1: { hopsToTarget: 1, canRevert: false },
  2: { hopsToTarget: 2, canRevert: false },
  3: { hopsToTarget: 1, canRevert: true },
  4: { hopsToTarget: 2, canRevert: true },
  5: { hopsToTarget: 2, canRevert: true }
};

// Position calculations
const cubePositions = {};
const qbertPositions = {};

function calculatePositions() {
  const baseCubeX = 0, baseCubeY = 0;
  const baseQbertX = 500, baseQbertY = 220;
  const stepX = 48, stepY = 48;

  for (let r = 0; r <= 6; r++) {
    for (let c = 0; c <= r; c++) {
      const x = Math.round(baseCubeX + (c - r / 2) * stepX);
      const y = Math.round(baseCubeY + r * stepY);
      cubePositions[`${r},${c}`] = { x, y };

      const qx = Math.round(baseQbertX + (c - r / 2) * stepX);
      const qy = Math.round(baseQbertY + r * stepY);
      qbertPositions[`${r},${c}`] = { x: qx, y: qy };
    }
  }
}

function createPyramid() {
  const pyramid = document.getElementById("pyramid");
  pyramid.innerHTML = "";

  pyramidMap.forEach(([row, col]) => {
    const cube = document.createElement("div");
    cube.className = "cube";
    cube.id = `cube-${row}-${col}`;

    const position = cubePositions[`${row},${col}`];
    cube.style.left = position.x + "px";
    cube.style.top = position.y + "px";

    pyramid.appendChild(cube);

    const cubeKey = `${row},${col}`;
    gameState.cubeStates[cubeKey] = { hops: 0, color: "#4169E1" };
  });
}

function getCurrentLevelRule() {
  return levelRules[Math.min(gameState.level, 5)] || levelRules[5];
}

function updateQbertPosition() {
  const qbert = document.getElementById("qbert");
  const posKey = `${gameState.qbertPosition.row},${gameState.qbertPosition.col}`;
  const position = qbertPositions[posKey];

  if (position) {
    qbert.style.left = position.x + "px";
    qbert.style.top = position.y + "px";
    handleCubeHop(gameState.qbertPosition.row, gameState.qbertPosition.col);
  }
}

function handleCubeHop(row, col) {
  const cubeKey = `${row},${col}`;
  const cube = document.getElementById(`cube-${row}-${col}`);
  const rule = getCurrentLevelRule();

  if (!gameState.cubeStates[cubeKey]) {
    gameState.cubeStates[cubeKey] = { hops: 0, color: "#4169E1" };
  }

  gameState.cubeStates[cubeKey].hops++;
  
  let newColor = "#4169E1";

  if (rule.hopsToTarget === 1) {
    if (gameState.cubeStates[cubeKey].hops === 1) {
      newColor = "#FFD700";
    } else if (rule.canRevert && gameState.cubeStates[cubeKey].hops === 2) {
      newColor = "#4169E1";
      gameState.cubeStates[cubeKey].hops = 0;
    } else if (!rule.canRevert) {
      newColor = "#FFD700";
    }
  } else if (rule.hopsToTarget === 2) {
    if (gameState.cubeStates[cubeKey].hops === 1) {
      newColor = "#90EE90";
    } else if (gameState.cubeStates[cubeKey].hops === 2) {
      newColor = "#FFD700";
    } else if (rule.canRevert && gameState.cubeStates[cubeKey].hops === 3) {
      newColor = "#4169E1";
      gameState.cubeStates[cubeKey].hops = 0;
    } else if (!rule.canRevert) {
      newColor = "#FFD700";
    }
  }

  gameState.cubeStates[cubeKey].color = newColor;
  cube.style.backgroundColor = newColor;

  const isTargetColor = newColor === "#FFD700";
  const cubeIndex = pyramidMap.findIndex(([r, c]) => r === row && c === col);

  if (isTargetColor && !gameState.cubesChanged.includes(cubeIndex)) {
    gameState.cubesChanged.push(cubeIndex);
    gameState.score += 25;
    updateScore();
    showQbertSpeech();
    checkLevelComplete();
  }

  if (!isTargetColor && gameState.cubesChanged.includes(cubeIndex) && rule.canRevert) {
    gameState.cubesChanged.splice(gameState.cubesChanged.indexOf(cubeIndex), 1);
  }
}

function animateJump() {
  const qbert = document.getElementById("qbert");
  qbert.classList.remove("jump");
  void qbert.offsetWidth;
  qbert.classList.add("jump");
  setTimeout(() => qbert.classList.remove("jump"), 250);
}

function moveQbert(direction) {
  if (!gameState.gameActive) return;

  let newRow = gameState.qbertPosition.row;
  let newCol = gameState.qbertPosition.col;

  if (direction === "up-left") {
    newRow--;
    newCol--;
  } else if (direction === "up-right") {
    newRow--;
  } else if (direction === "down-left") {
    newRow++;
  } else if (direction === "down-right") {
    newRow++;
    newCol++;
  }

  if (isValidPosition(newRow, newCol)) {
    gameState.qbertPosition.row = newRow;
    gameState.qbertPosition.col = newCol;
    animateJump();
    updateQbertPosition();
  } else {
    loseLife();
  }
}

function isValidPosition(row, col) {
  return pyramidMap.some(([r, c]) => r === row && c === col);
}

// Coily enemy system
function createCoily() {
  const coily = {
    id: Date.now(),
    type: "egg",
    row: 1,
    col: Math.floor(Math.random() * 2),
    element: null
  };

  const coilyEl = document.createElement("div");
  coilyEl.className = "coily coily-egg";
  coilyEl.id = `coily-${coily.id}`;

  const position = qbertPositions[`${coily.row},${coily.col}`];
  coilyEl.style.left = position.x + "px";
  coilyEl.style.top = position.y + "px";

  document.getElementById("game").appendChild(coilyEl);
  coily.element = coilyEl;
  gameState.enemies.push(coily);

  return coily;
}

function updateCoily(coily) {
  if (coily.type === "egg") {
    if (coily.row < 6) {
      const direction = Math.random() < 0.5 ? 0 : 1;
      coily.row++;
      if (direction && coily.col < coily.row) coily.col++;

      const position = qbertPositions[`${coily.row},${coily.col}`];
      coily.element.style.left = position.x + "px";
      coily.element.style.top = position.y + "px";
    } else {
      coily.type = "snake";
      coily.element.className = "coily coily-snake";
    }
  } else if (coily.type === "snake") {
    const qRow = gameState.qbertPosition.row;
    const qCol = gameState.qbertPosition.col;

    const moves = [
      { row: coily.row - 1, col: coily.col - 1 },
      { row: coily.row - 1, col: coily.col },
      { row: coily.row + 1, col: coily.col },
      { row: coily.row + 1, col: coily.col + 1 }
    ];

    let bestMove = null;
    let bestDistance = Infinity;

    moves.forEach((move) => {
      if (isValidPosition(move.row, move.col)) {
        const distance = Math.abs(move.row - qRow) + Math.abs(move.col - qCol);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMove = move;
        }
      }
    });

    if (bestMove) {
      coily.row = bestMove.row;
      coily.col = bestMove.col;

      const position = qbertPositions[`${coily.row},${coily.col}`];
      coily.element.style.left = position.x + "px";
      coily.element.style.top = position.y + "px";
    }
  }
}

function checkCollisions() {
  gameState.enemies.forEach((enemy) => {
    if (enemy.row === gameState.qbertPosition.row && 
        enemy.col === gameState.qbertPosition.col) {
      loseLife();
    }
  });
}

function clearEnemies() {
  gameState.enemies.forEach((enemy) => {
    if (enemy.element && enemy.element.parentNode) {
      enemy.element.parentNode.removeChild(enemy.element);
    }
  });
  gameState.enemies = [];
}

// Game loop
let gameLoopRunning = false;

function gameLoop() {
  if (!gameLoopRunning) return;

  if (gameState.gameActive && gameState.gameStarted) {
    gameState.enemyTimer++;
    if (gameState.enemyTimer > 600 && gameState.enemies.length === 0) {
      createCoily();
      gameState.enemyTimer = 0;
    }

    gameState.enemies.forEach((enemy) => {
      if (Math.random() < 0.008) {
        updateCoily(enemy);
      }
    });

    checkCollisions();
  }

  requestAnimationFrame(gameLoop);
}

function startGame() {
  document.getElementById("start-screen").classList.add("hidden");
  gameState.gameActive = true;
  gameState.gameStarted = true;

  gameState.qbertPosition = { row: 0, col: 0 };
  gameState.cubesChanged = [];
  gameState.cubeStates = {};
  clearEnemies();
  gameState.enemyTimer = 0;

  createPyramid();
  updateQbertPosition();
  updateScore();

  if (!gameLoopRunning) {
    gameLoopRunning = true;
    gameLoop();
  }
}

function loseLife() {
  gameState.lives--;
  updateScore();
  clearEnemies();
  gameState.enemyTimer = 0;

  if (gameState.lives <= 0) {
    gameOver();
  } else {
    gameState.qbertPosition = { row: 0, col: 0 };
    updateQbertPosition();
    gameState.gameActive = false;
    setTimeout(() => (gameState.gameActive = true), 1500);
  }
}

function gameOver() {
  gameState.gameActive = false;
  gameState.gameStarted = false;
  gameLoopRunning = false;
  clearEnemies();

  setTimeout(() => {
    document.getElementById("start-screen").classList.remove("hidden");
  }, 1500);
}

async function checkLevelComplete() {
  if (gameState.cubesChanged.length >= 28) {
    const previousLevel = gameState.level;
    
    // Award tokens for completing level
    let tokensToAward = TOKEN_CONFIG.rewardsPerLevel;
    
    // Check for bonus every 5 levels
    if (gameState.level % 5 === 0) {
      tokensToAward += TOKEN_CONFIG.bonusEveryFiveLevels;
    }
    
    gameState.tokensEarned += tokensToAward;
    await awardTokens(tokensToAward);
    
    // Level progression
    gameState.score += 500 * gameState.level;
    clearEnemies();

    gameState.round++;
    if (gameState.round > 4) {
      gameState.level++;
      gameState.round = 1;
    }

    gameState.gameActive = false;

    setTimeout(() => {
      gameState.cubesChanged = [];
      gameState.cubeStates = {};
      gameState.qbertPosition = { row: 0, col: 0 };
      gameState.enemyTimer = 0;

      pyramidMap.forEach(([row, col]) => {
        const cube = document.getElementById(`cube-${row}-${col}`);
        cube.style.backgroundColor = "#4169E1";
        gameState.cubeStates[`${row},${col}`] = { hops: 0, color: "#4169E1" };
      });

      updateQbertPosition();
      updateScore();
      gameState.gameActive = true;
    }, 2000);
  }
}

function updateScore() {
  document.getElementById("score").textContent = gameState.score;
  document.getElementById("level").textContent = gameState.level;
  document.getElementById("round").textContent = gameState.round;
  document.getElementById("lives").textContent = gameState.lives;
}

function showQbertSpeech() {
  const qbert = document.getElementById("qbert");
  qbert.classList.add("speaking");
  setTimeout(() => qbert.classList.remove("speaking"), 800);
}

function handleKeyPress(event) {
  const key = event.key.toLowerCase();

  if (!gameState.gameStarted) {
    if (key === " " || key === "enter") {
      startGame();
    }
    return;
  }

  if (key === "q") moveQbert("up-left");
  else if (key === "w") moveQbert("up-right");
  else if (key === "a") moveQbert("down-left");
  else if (key === "s") moveQbert("down-right");
  else if (key === "arrowup") moveQbert("up-right");
  else if (key === "arrowleft") moveQbert("up-left");
  else if (key === "arrowdown") moveQbert("down-left");
  else if (key === "arrowright") moveQbert("down-right");
}

// Mobile controls setup
function setupMobileControls() {
  const mobileButtons = document.querySelectorAll(".mobile-btn");

  mobileButtons.forEach((button) => {
    button.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const direction = button.dataset.direction;
      if (gameState.gameActive) {
        moveQbert(direction);
      }
    }, { passive: false });

    button.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const direction = button.dataset.direction;
      if (gameState.gameActive) {
        moveQbert(direction);
      }
    });
  });
}

// Initialize everything
window.addEventListener("load", async () => {
  calculatePositions();
  createPyramid();
  updateScore();

  // Initialize Farcaster SDK
  await initializeFarcasterSDK();

  // Setup event listeners
  document.getElementById("start-button").addEventListener("click", startGame);
  document.getElementById("connect-wallet").addEventListener("click", connectWallet);
  document.addEventListener("keydown", handleKeyPress);

  // Setup mobile controls
  setupMobileControls();

  console.log("🎮 Q*bert Farcaster Edition loaded!");
});
