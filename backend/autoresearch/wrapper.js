/**
 * Wrapper layer for integrating Python autoresearch with Bitiq Lab API
 * Uses subprocess to call Python training and analysis functions
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
 * StrategyGenerator class for generating trading strategies using Claude API
 * Integrates with Anthropic Claude for LLM-powered strategy generation
 */
export class StrategyGenerator {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Generate a trading strategy from a prompt
   * @param {Object} config - Generation configuration
   * @returns {Promise<Object>} Generated strategy
   */
  async generate(config) {
    // This implementation uses Claude API directly
    // The autoresearch package provides ML-based optimization, but strategy generation
    // is handled by Claude for speed and flexibility
    try {
      const { Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: this.apiKey });

      const prompt = `Generate a trading strategy based on this specification:
Symbol: ${config.symbol}
Timeframe: ${config.timeframe}
Market Type: ${config.market_type}
Leverage: ${config.leverage || 1}

User Request: ${config.prompt}

Return a JSON object with this structure:
{
  "name": "strategy name",
  "description": "strategy description",
  "symbol": "${config.symbol}",
  "timeframe": "${config.timeframe}",
  "market_type": "${config.market_type}",
  "leverage": ${config.leverage || 1},
  "entry_rules": {
    "conditions": "entry condition string (e.g., 'RSI < 30 AND close < MA(20)')"
  },
  "exit_rules": {
    "conditions": "exit condition string",
    "stop_loss_percent": -2,
    "take_profit_percent": 5
  },
  "position_sizing": {
    "max_position_size": 0.05,
    "risk_per_trade": 0.02
  }
}`;

      const message = await client.messages.create({
        model: 'claude-opus-4-1',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Parse the response
      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response format from Claude');
      }

      // Extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in Claude response');
      }

      const strategy = JSON.parse(jsonMatch[0]);
      strategy.status = 'draft';
      strategy.created_at = new Date();
      strategy.version = 1;

      return strategy;
    } catch (error) {
      console.error('Strategy generation error:', error);
      throw error;
    }
  }

  /**
   * Suggest strategy improvements based on backtest results
   * @param {Object} strategy - Current strategy
   * @param {Object} backtestResult - Backtest results
   * @returns {Promise<Object>} Suggested improvements
   */
  async suggestImprovements(strategy, backtestResult) {
    try {
      const { Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: this.apiKey });

      const prompt = `Analyze this trading strategy's backtest results and suggest improvements:

Strategy:
${JSON.stringify(strategy, null, 2)}

Backtest Results:
- Sharpe Ratio: ${backtestResult.sharpe_ratio}
- Win Rate: ${backtestResult.win_rate * 100}%
- Profit Factor: ${backtestResult.profit_factor}
- Max Drawdown: ${backtestResult.max_drawdown * 100}%
- Total Trades: ${backtestResult.total_trades}

Provide specific suggestions to improve the strategy.`;

      const message = await client.messages.create({
        model: 'claude-opus-4-1',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response format from Claude');
      }

      return {
        suggestions: content.text,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error getting strategy suggestions:', error);
      throw error;
    }
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
