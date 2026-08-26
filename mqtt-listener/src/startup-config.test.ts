import { validateStartupConfig } from './startup-config';

const validEnvironment = {
  MQTT_BROKER_URL: 'cluster.example.com',
  MQTT_USERNAME: 'listener',
  MQTT_PASSWORD: 'secret',
  FIREBASE_ADMIN_PROJECT_ID: 'smart-flush',
  FIREBASE_ADMIN_CLIENT_EMAIL: 'service@example.iam.gserviceaccount.com',
  FIREBASE_ADMIN_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
};

describe('listener startup configuration', () => {
  it('accepts the required Railway MQTT and Firebase settings', () => {
    expect(() => validateStartupConfig(validEnvironment)).not.toThrow();
  });

  it('reports every missing setting in one actionable error', () => {
    expect(() => validateStartupConfig({ MQTT_USERNAME: 'listener' })).toThrow(
      /MQTT_BROKER_URL, MQTT_PASSWORD, FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY/,
    );
  });

  it('rejects placeholder values before the listener connects', () => {
    expect(() => validateStartupConfig({
      ...validEnvironment,
      MQTT_PASSWORD: 'your_password_here',
    })).toThrow(/MQTT_PASSWORD/);
  });
});
