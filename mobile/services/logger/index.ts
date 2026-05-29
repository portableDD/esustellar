import AsyncStorage from '@react-native-async-storage/async-storage';
import config, { isProd } from '../../config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = string;

const LOG_STORAGE_KEY = 'dev:logs';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_MIN_LEVEL: LogLevel = isProd() ? 'warn' : 'debug';

type LoggerConfig = {
  minLevel: LogLevel;
  persistInDev: boolean;
  maxPersistedLines: number;
  includeStack: boolean;
};

let loggerConfig: LoggerConfig = {
  minLevel: DEFAULT_MIN_LEVEL,
  persistInDev: false,
  maxPersistedLines: 400,
  includeStack: false,
};

function nowIso(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[loggerConfig.minLevel];
}

function isSensitiveKey(key: string): boolean {
  return /(password|passphrase|secret|token|private|seed|mnemonic|key)/i.test(key);
}

function sanitizeUnknown(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  if (value instanceof Error) {
    const base = {
      name: value.name,
      message: value.message,
    };
    if (loggerConfig.includeStack && value.stack) {
      return { ...base, stack: value.stack };
    }
    return base;
  }

  if (Array.isArray(value)) {
    if (depth >= 2) return '[Array]';
    return value.map((entry) => sanitizeUnknown(entry, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= 2) return '[Object]';
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    Object.keys(input).forEach((key) => {
      if (isSensitiveKey(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = sanitizeUnknown(input[key], depth + 1);
      }
    });
    return output;
  }

  return String(value);
}

async function persistLine(line: string): Promise<void> {
  if (isProd() || !loggerConfig.persistInDev) return;

  try {
    const existing = await AsyncStorage.getItem(LOG_STORAGE_KEY);
    const parsed = existing ? (JSON.parse(existing) as string[]) : [];
    const next = [...parsed, line].slice(-loggerConfig.maxPersistedLines);
    await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}

function formatLine(level: LogLevel, context: LogContext, message: string): string {
  return `[${nowIso()}][${config.env}][${level.toUpperCase()}][${context}] ${message}`;
}

function write(level: LogLevel, context: LogContext, message: string, args: unknown[]) {
  if (!shouldLog(level)) return;

  const line = formatLine(level, context, message);
  const safeArgs = args.map((arg) => sanitizeUnknown(arg));

  if (level === 'error') console.error(line, ...safeArgs);
  else if (level === 'warn') console.warn(line, ...safeArgs);
  else if (level === 'info') console.info(line, ...safeArgs);
  else console.debug(line, ...safeArgs);

  void persistLine(
    safeArgs.length ? `${line} ${JSON.stringify(safeArgs)}` : line,
  );
}

export function configureLogger(partial: Partial<LoggerConfig>) {
  loggerConfig = { ...loggerConfig, ...partial };
}

export async function getPersistedLogs(): Promise<string[]> {
  const existing = await AsyncStorage.getItem(LOG_STORAGE_KEY);
  return existing ? (JSON.parse(existing) as string[]) : [];
}

export async function clearPersistedLogs(): Promise<void> {
  await AsyncStorage.removeItem(LOG_STORAGE_KEY);
}

export const logger = {
  debug: (context: LogContext, message: string, ...args: unknown[]) =>
    write('debug', context, message, args),
  info: (context: LogContext, message: string, ...args: unknown[]) =>
    write('info', context, message, args),
  warn: (context: LogContext, message: string, ...args: unknown[]) =>
    write('warn', context, message, args),
  error: (context: LogContext, message: string, ...args: unknown[]) =>
    write('error', context, message, args),
};

