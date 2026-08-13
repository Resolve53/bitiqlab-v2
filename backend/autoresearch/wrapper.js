/**
 * Wrapper layer for integrating Python autoresearch with Bitiq Lab API
 * Uses subprocess to call Python training and analysis functions
 *
 * QUARANTINED (Phase 1 integration fix):
 * Production strategy generation MUST use backend/src/autoresearch/wrapper.ts
 * (imported via @/autoresearch/wrapper). Do not call StrategyGenerator here
 * from Next.js API routes — this duplicate returns prose-schema strategies
 * and is not Truth Engine compatible.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run Python training process
 * @param {Object} config - Training configuration
 * @returns {Promise<Object>} Training results
 */
export async function trainModel(config = {}) {
  return new Promise((resolve, reject) => {
    const trainScript = path.join(__dirname, 'train.py');
    const python = spawn('python', [trainScript], {
      cwd: __dirname,
      env: { ...process.env, PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True' },
    });

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`[autoresearch] ${data}`);
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`[autoresearch-error] ${data}`);
    });

    python.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          output,
          message: 'Model training completed successfully',
        });
      } else {
        reject({
          success: false,
          code,
          error: errorOutput || output,
          message: 'Model training failed',
        });
      }
    });

    python.on('error', (error) => {
      reject({
        success: false,
        error: error.message,
        message: 'Failed to spawn training process',
      });
    });
  });
}

/**
 * Prepare data for training
 * @param {Object} config - Data preparation configuration
 * @returns {Promise<Object>} Preparation results
 */
export async function prepareData(config = {}) {
  return new Promise((resolve, reject) => {
    const prepareScript = path.join(__dirname, 'prepare.py');
    const python = spawn('python', [prepareScript], {
      cwd: __dirname,
      env: { ...process.env },
    });

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`[autoresearch-prepare] ${data}`);
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`[autoresearch-prepare-error] ${data}`);
    });

    python.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          output,
          message: 'Data preparation completed successfully',
        });
      } else {
        reject({
          success: false,
          code,
          error: errorOutput || output,
          message: 'Data preparation failed',
        });
      }
    });

    python.on('error', (error) => {
      reject({
        success: false,
        error: error.message,
        message: 'Failed to spawn preparation process',
      });
    });
  });
}

/**
 * Run analysis notebook
 * @returns {Promise<Object>} Analysis results
 */
export async function runAnalysis() {
  // Note: Jupyter notebooks would require jupytext or nbconvert
  // For now, we'll provide a placeholder that suggests using the notebook directly
  return {
    success: true,
    message: 'Analysis notebook available at analysis.ipynb',
    instructions: 'Run with: jupyter notebook analysis.ipynb',
  };
}

/**
 * Check if Python environment is properly configured
 * @returns {Promise<Object>} Environment status
 */
export async function checkEnvironment() {
  return new Promise((resolve) => {
    const python = spawn('python', ['-c', 'import torch; print(f"PyTorch {torch.__version__} available")'], {
      cwd: __dirname,
    });

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          pythonAvailable: true,
          torchAvailable: true,
          output: output.trim(),
        });
      } else {
        resolve({
          success: false,
          pythonAvailable: false,
          torchAvailable: false,
          error: errorOutput,
          message: 'PyTorch not properly installed',
        });
      }
    });

    python.on('error', () => {
      resolve({
        success: false,
        pythonAvailable: false,
        message: 'Python not found in environment',
      });
    });
  });
}

/**
 * Get configuration metadata from the autoresearch package
 * @returns {Promise<Object>} Configuration and capabilities
 */
export async function getMetadata() {
  try {
    const readmeContent = await fs.readFile(path.join(__dirname, 'README.md'), 'utf-8');
    const programContent = await fs.readFile(path.join(__dirname, 'program.md'), 'utf-8');

    return {
      success: true,
      name: 'Autoresearch',
      version: '1.0.0',
      description: 'ML-powered autonomous strategy research',
      readme: readmeContent,
      program: programContent,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * StrategyGenerator class — QUARANTINED duplicate.
 * Production path: backend/src/autoresearch/wrapper.ts
 */
export class StrategyGenerator {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * @deprecated Use @/autoresearch/wrapper (TypeScript) StrategyGenerator.
   */
  async generate(_config) {
    throw new Error(
      "backend/autoresearch/wrapper.js StrategyGenerator is quarantined. " +
        "Use backend/src/autoresearch/wrapper.ts via @/autoresearch/wrapper."
    );
  }

  async suggestImprovements(_strategy, _backtestResult) {
    throw new Error(
      "backend/autoresearch/wrapper.js StrategyGenerator is quarantined. " +
        "Use backend/src/autoresearch/wrapper.ts via @/autoresearch/wrapper."
    );
  }
}

/**
 * AutoresearchOptimizer class for continuous strategy optimization
 * Uses the Python autoresearch framework for automated tuning
 */
export class AutoresearchOptimizer {
  /**
   * Optimize a strategy using automated research
   * @param {Object} strategy - Strategy to optimize
   * @param {Object} backtestData - Historical backtest data
   * @returns {Promise<Object>} Optimized strategy
   */
  async optimize(strategy, backtestData) {
    try {
      // Run the Python training process
      const result = await trainModel({
        strategy,
        data: backtestData,
      });

      return {
        success: result.success,
        optimizedStrategy: strategy,
        improvements: result.output,
      };
    } catch (error) {
      console.error('Optimization error:', error);
      throw error;
    }
  }
}

export default {
  trainModel,
  prepareData,
  runAnalysis,
  checkEnvironment,
  getMetadata,
  StrategyGenerator,
  AutoresearchOptimizer,
};
