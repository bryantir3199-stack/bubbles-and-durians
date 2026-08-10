import { Game } from './core/Game';

const container = document.getElementById('game-container');
if (!container) {
  throw new Error('#game-container missing');
}

const game = new Game(container);
void game.start();
