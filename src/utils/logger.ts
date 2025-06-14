import winston from 'winston';

export class Logger {
  private winston: winston.Logger;
  
  constructor(component: string) {
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, component: _comp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level.toUpperCase()}] [${component}] ${message}${metaStr}`;
        })
      ),
      defaultMeta: { component },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    if (process.env.LOG_FILE) {
      this.winston.add(new winston.transports.File({ 
        filename: process.env.LOG_FILE 
      }));
    }
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  error(message: string, error?: any): void {
    this.winston.error(message, { error });
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }
}