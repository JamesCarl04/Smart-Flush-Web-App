function getStringProperty(error: unknown, key: 'code' | 'message'): string | undefined {
  if (typeof error !== 'object' || error === null || !(key in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

export function getErrorCode(error: unknown): string | undefined {
  return getStringProperty(error, 'code');
}

export function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  return getStringProperty(error, 'message');
}
