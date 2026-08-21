'use strict';
/**
 * Puzzle Splitter — takes an uploaded image and splits it into grid pieces
 * at multiple difficulty levels.
 *
 * POST /media/puzzle-split
 *   Body: multipart { image, difficulty? }
 *   Returns: { puzzleId, originalUrl, difficulties: { easy, medium, hard, expert } }
 *
 * Difficulty levels:
 *   easy   = 2×2  (4 pieces)   — Creche/Nursery
 *   medium = 3×3  (9 pieces)   — KG1/KG2
 *   hard   = 4×4  (16 pieces)  — KG2/Primary
 *   expert = 5×5  (25 pieces)  — Primary+
 *
 * Each level has its own grid, pieces, and pieceSize. The frontend
 * lets the child pick a difficulty and loads the corresponding pieces.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { storageDir } = require('./media-pipeline');

const PUZZLE_DIR = path.join(storageDir(), 'puzzles');

// Difficulty definitions: grid size + display label + age hint
const DIFFICULTY_LEVELS = {
  easy:   { rows: 2, cols: 2, label: 'Easy (2×2)',   emoji: '⭐',       minAge: 'Creche',  maxPieces: 4 },
  medium: { rows: 3, cols: 3, label: 'Medium (3×3)', emoji: '⭐⭐',     minAge: 'Nursery', maxPieces: 9 },
  hard:   { rows: 4, cols: 4, label: 'Hard (4×4)',   emoji: '⭐⭐⭐',   minAge: 'KG1',     maxPieces: 16 },
  expert: { rows: 5, cols: 5, label: 'Expert (5×5)', emoji: '⭐⭐⭐⭐', minAge: 'KG2',     maxPieces: 25 },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Split an image into rows × cols grid pieces.
 * @param {string} imagePath - path to source image
 * @param {number} rows
 * @param {number} cols
 * @param {string} puzzleId
 * @param {string} level - difficulty key (easy/medium/hard/expert)
 * @returns {Promise<{ pieces, grid, pieceSize }>}
 */
async function splitImage(imagePath, rows, cols, puzzleId, level = 'medium') {
  ensureDir(PUZZLE_DIR);

  const meta = await sharp(imagePath).metadata();
  const origW = meta.width;
  const origH = meta.height;

  const pieceW = Math.floor(origW / cols);
  const pieceH = Math.floor(origH / rows);

  // Resize to exact grid dimensions
  const resizedPath = path.join(PUZZLE_DIR, `${puzzleId}-${level}-resized.webp`);
  await sharp(imagePath)
    .resize(pieceW * cols, pieceH * rows, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(resizedPath);

  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const pieceName = `${puzzleId}-${level}-r${r}c${c}.webp`;
      const piecePath = path.join(PUZZLE_DIR, pieceName);

      await sharp(resizedPath)
        .extract({ left: c * pieceW, top: r * pieceH, width: pieceW, height: pieceH })
        .webp({ quality: 85 })
        .toFile(piecePath);

      pieces.push({
        id: `${level}-p${r}_${c}`,
        row: r,
        col: c,
        imageUrl: `/media/puzzle/${pieceName}`,
      });
    }
  }

  fs.unlinkSync(resizedPath);

  return { pieces, grid: { rows, cols }, pieceSize: { width: pieceW, height: pieceH } };
}

/**
 * Split an image at ALL difficulty levels (easy → expert).
 * @returns {Promise<{ puzzleId, originalUrl, difficulties }>
 */
async function splitAllLevels(imagePath, puzzleId) {
  ensureDir(PUZZLE_DIR);

  // Save the original as webp for serving
  const origWebp = path.join(PUZZLE_DIR, `${puzzleId}-original.webp`);
  await sharp(imagePath).webp({ quality: 90 }).toFile(origWebp);

  const difficulties = {};
  for (const [key, def] of Object.entries(DIFFICULTY_LEVELS)) {
    const levelResult = await splitImage(imagePath, def.rows, def.cols, puzzleId, key);
    difficulties[key] = {
      ...levelResult,
      label: def.label,
      emoji: def.emoji,
      minAge: def.minAge,
    };
  }

  return {
    puzzleId,
    originalUrl: `/media/puzzle/${puzzleId}-original.webp`,
    difficulties,
  };
}

module.exports = { splitImage, splitAllLevels, DIFFICULTY_LEVELS, PUZZLE_DIR, ensureDir };
