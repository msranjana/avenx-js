const fs = require('fs');
const path = require('path');
const { logger } = require('./core/runtime/AvenxLogger');

/**
 * Load the Avenx configuration from avenx.config.json file.
 */
function loadConfig() {
  const defaults = {
    srcDir: 'src',
    distDir: 'dist',
    templatesDir: '.avenxtemplates',
    server: {
      port: 3000,
      host: 'localhost',
    },
  };

  const configPath = path.join(process.cwd(), 'avenx.config.json');

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

    if (config.server.host && (typeof config.server.host !== 'string' || config.server.host.trim() === '')) {
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

module.exports = loadConfig;
