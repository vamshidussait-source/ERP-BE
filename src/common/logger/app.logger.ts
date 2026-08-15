import { LoggerService } from '@nestjs/common';
import * as winston from 'winston';

export class AppLogger implements LoggerService {
  private readonly logger = winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    transports: [new winston.transports.Console()],
  });

  log(message: unknown, ...optionalParams: unknown[]) {
    this.logger.info(this.formatEntry(message, optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.logger.error(this.formatEntry(message, optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.logger.warn(this.formatEntry(message, optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.logger.debug(this.formatEntry(message, optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.logger.verbose(this.formatEntry(message, optionalParams));
  }

  private formatEntry(message: unknown, optionalParams: unknown[]) {
    return {
      message,
      optionalParams,
    };
  }
}

export const appLogger = new AppLogger();
