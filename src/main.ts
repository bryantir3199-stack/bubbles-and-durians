import { Game } from './core/Game';
import { isCoarsePointer } from './core/display';

if (isCoarsePointer()) {
  document.documentElement.classList.add('touch-ui');
}

const container = document.getElementById('game-container');
if (!container) {
  throw new Error('#game-container missing');
}

const game = new Game(container);
void game.start();
