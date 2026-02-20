/**
 * Training Data Writer: Append SFT/DPO records to JSONL file for model improvement.
 * Collects high-quality Q&A pairs based on user feedback for supervised fine-tuning.
 */
import fs from 'fs/promises';
import path from 'path';
import { sanitizeInput } from '../gdpr/sanitizer.js';

const TRAINING_DATA_PATH = process.env.TRAINING_DATA_PATH || './data/training_data.jsonl';
const MAX_FILE_SIZE_MB = parseInt(process.env.TRAINING_DATA_MAX_SIZE_MB || '10', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

let currentFileIndex = 0;

/**
 * Ensure the data directory exists.
 */
async function ensureDataDir() {
  const dir = path.dirname(TRAINING_DATA_PATH);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error('[TrainingData] Failed to create directory:', err.message);
    }
  }
}

/**
 * Get the current file path (handles rotation).
 */
function getCurrentFilePath() {
  if (currentFileIndex === 0) {
    return TRAINING_DATA_PATH;
  }
  const ext = path.extname(TRAINING_DATA_PATH);
  const base = TRAINING_DATA_PATH.slice(0, -ext.length);
  return `${base}_${currentFileIndex}${ext}`;
}

/**
 * Check if file needs rotation and rotate if necessary.
 */
async function checkAndRotate() {
  try {
    const filePath = getCurrentFilePath();
    const stats = await fs.stat(filePath);
    if (stats.size >= MAX_FILE_SIZE_BYTES) {
      currentFileIndex++;
      console.log(`[TrainingData] Rotated to file index ${currentFileIndex}`);
    }
  } catch (err) {
    // File doesn't exist yet, that's fine
  }
}

/**
 * Append a training record to the JSONL file.
 * @param {object} record - Training data record
 * @param {string} record.query - Sanitized user query
 * @param {string} record.answer - AI response
 * @param {number} record.rating - User rating (1-5)
 * @param {string} record.feedback - User feedback text
 * @param {boolean} record.follow_up_clicked - Whether user clicked a follow-up
 * @param {object[]} record.chat_history - Recent chat history
 * @param {object} record.bloodwork_data - Associated bloodwork data (if any)
 * @param {string} record.treatment_type - Treatment context
 */
export async function appendTrainingRecord(record) {
  try {
    await ensureDataDir();
    await checkAndRotate();

    // Sanitize PII from all text fields
    const sanitizedRecord = {
      query: sanitizeInput(record.query || ''),
      answer: sanitizeInput(record.answer || ''),
      rating: record.rating,
      feedback: sanitizeInput(record.feedback || ''),
      follow_up_clicked: record.follow_up_clicked || false,
      chat_history: (record.chat_history || []).map((h) => ({
        role: h.role,
        content: sanitizeInput(h.content || ''),
      })),
      bloodwork_data: record.bloodwork_data ? {
        markers: (record.bloodwork_data.markers || []).map((m) => ({
          name: m.name,
          value: m.value,
          unit: m.unit,
        })),
        treatment_type: record.treatment_type || null,
      } : null,
      treatment_type: record.treatment_type || null,
      timestamp: new Date().toISOString(),
      source: record.source || 'feedback',
    };

    const jsonLine = JSON.stringify(sanitizedRecord) + '\n';
    const filePath = getCurrentFilePath();

    await fs.appendFile(filePath, jsonLine, 'utf8');
    console.log(`[TrainingData] Appended record (rating: ${record.rating})`);
    return true;
  } catch (err) {
    console.error('[TrainingData] Failed to append record:', err.message);
    return false;
  }
}

/**
 * Check if a feedback record qualifies for training data collection.
 * Criteria: rating === 5 (excellent) OR rating === 1 (poor) OR follow_up_clicked
 * @param {number} rating
 * @param {boolean} followUpClicked
 */
export function qualifiesForTraining(rating, followUpClicked = false) {
  return rating === 5 || rating === 1 || followUpClicked;
}

/**
 * Get stats about training data files.
 */
export async function getTrainingStats() {
  try {
    const stats = [];
    let index = 0;
    let totalRecords = 0;
    let totalBytes = 0;

    while (true) {
      const filePath = index === 0 ? TRAINING_DATA_PATH : `${TRAINING_DATA_PATH.slice(0, -6)}_${index}.jsonl`;
      try {
        const fstats = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        stats.push({
          file: path.basename(filePath),
          records: lines.length,
          size_mb: (fstats.size / 1024 / 1024).toFixed(2),
        });
        totalRecords += lines.length;
        totalBytes += fstats.size;
        index++;
      } catch (_) {
        break;
      }
    }

    return {
      files: stats,
      total_records: totalRecords,
      total_size_mb: (totalBytes / 1024 / 1024).toFixed(2),
      current_file_index: currentFileIndex,
    };
  } catch (err) {
    console.error('[TrainingData] Failed to get stats:', err.message);
    return { files: [], total_records: 0, total_size_mb: '0', current_file_index: 0 };
  }
}

export { TRAINING_DATA_PATH, MAX_FILE_SIZE_MB };
