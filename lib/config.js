import fs from 'fs';
import path from 'path';
import { logger } from './core/runtime/AvenxLogger.js';

/**
 * Find the project root directory by scanning upwards from startDir.
 * Looks for package.json or index.html.
 * @param {string} startDir
 * @returns {string}
 */
function findProjectRoot(startDir = process.cwd()) {
  let currentDir = startDir;
  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    const indexHtmlPath = path.join(currentDir, 'index.html');

    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (pkg && pkg.name !== 'avenx-core') {
          return currentDir;
        }
      } catch {
        // If package.json is invalid, still treat it as a project root
        return currentDir;
      }
    } else if (fs.existsSync(indexHtmlPath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return startDir;
}

/**
 * Load the Avenx configuration from avenx.config.json file.
 * @param {string} [baseDir] - The base directory of the project.
 */
function loadConfig(baseDir) {
  const defaults = {
    srcDir: 'src',
    distDir: 'dist',
    templatesDir: '.avenxtemplates',
    server: {
      port: 3000,
      host: 'localhost',
    },
    style: {
      preprocessor: 'none',
    },
  };

  const rootDir = baseDir || findProjectRoot(process.cwd());
  const configPath = path.join(rootDir, 'avenx.config.json');

  if (!fs.existsSync(configPath)) {
    return defaults;
  }

  try {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const config = {
      ...defaults,
      ...userConfig,
      server: {
        ...defaults.server,
        ...(userConfig.server || {}),
      },
      style: {
        ...defaults.style,
        ...(userConfig.style || {}),
      },
    };

    if (typeof config.srcDir !== 'string' || config.srcDir.trim() === '') {
      throw new Error('srcDir must be a non-empty string');
    }
    if (path.isAbsolute(config.srcDir)) {
      throw new Error('srcDir must be a relative path');
    }

    if (typeof config.distDir !== 'string' || config.distDir.trim() === '') {
      throw new Error('distDir must be a non-empty string');
    }
    if (path.isAbsolute(config.distDir)) {
      throw new Error('distDir must be a relative path');
    }

    if (typeof config.templatesDir !== 'string' || config.templatesDir.trim() === '') {
      throw new Error('templatesDir must be a non-empty string');
    }
    if (path.isAbsolute(config.templatesDir)) {
      throw new Error('templatesDir must be a relative path');
    }

    if (typeof config.server.port !== 'number' || config.server.port < 0 || config.server.port > 65535) {
      throw new Error('server.port must be a valid port number (0-65535)');
    }

    if (typeof config.server.host !== 'string' || config.server.host.trim() === '') {
      throw new Error('server.host must be a non-empty string');
    }

    return config;
  } catch (err) {
    logger.error(`Invalid avenx.config.json: ${err.message}`);
    if (process.env.NODE_ENV === 'test') {
      throw err;
    }
    process.exit(1);
  }
}

loadConfig.findProjectRoot = findProjectRoot;

export default loadConfig;
