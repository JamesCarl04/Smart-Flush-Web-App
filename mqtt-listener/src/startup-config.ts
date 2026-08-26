const REQUIRED_KEYS = [
  'MQTT_BROKER_URL',
  'MQTT_USERNAME',
  'MQTT_PASSWORD',
  'FIREBASE_ADMIN_PROJECT_ID',
  'FIREBASE_ADMIN_CLIENT_EMAIL',
  'FIREBASE_ADMIN_PRIVATE_KEY',
] as const;

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '' ||
    normalized === 'your_password_here' ||
    normalized.startsWith('your-cluster.') ||
    normalized.includes('your_key_here') ||
    normalized.includes('firebase-adminsdk-xxxxx@')
  );
}

export function validateStartupConfig(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined>,
): void {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = environment[key];
    return typeof value !== 'string' || isPlaceholder(value);
  });

  if (missing.length > 0) {
    throw new Error(
      `[StartupConfig] Railway listener cannot start. Set valid values for: ${missing.join(', ')}. ` +
      'Use mqtt-listener/.env.example locally and the Railway Variables panel in production.',
    );
  }
}
