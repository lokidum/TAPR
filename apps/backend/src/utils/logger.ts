import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf((info: winston.Logform.TransformableInfo) => {
          const { timestamp, level, message, ...meta } = info;
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${String(timestamp)} [${String(level)}] ${String(message)}${metaStr}`;
        })
      ),
  transports: [new winston.transports.Console()],
});

export default logger;
