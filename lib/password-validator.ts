// lib/password-validator.ts
/**
 * Password validation
 * - Minimum 12 characters
 * - Check against Have I Been Pwned (HIBP) database
 * - Does NOT require complexity rules (humans make worse passwords with complexity rules)
 */

import crypto from 'crypto';

const MINIMUM_PASSWORD_LENGTH = 12;

interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password strength
 * Checks length and compromised password database
 */
export async function validatePassword(
  password: string,
): Promise<PasswordValidationResult> {
  const errors: string[] = [];

  // Check length
  if (!password || password.length < MINIMUM_PASSWORD_LENGTH) {
    errors.push(
      `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters`,
    );
  }

  // Check against HIBP (Have I Been Pwned) API
  try {
    const isCompromised = await isPasswordCompromised(password);
    if (isCompromised) {
      errors.push(
        'This password has been compromised in a known data breach. Please choose a different password.',
      );
    }
  } catch (err) {
    // If HIBP check fails, log but don't block registration
    // (better to allow registration than to have a broken service)
    console.warn('[Password Validator] HIBP check failed, continuing without check:', err);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if password has been compromised using HIBP API
 * Uses k-anonymity model for privacy:
 * - Hash password with SHA-1
 * - Send only first 5 characters to API
 * - API returns list of passwords with same prefix
 * - Check if full hash is in response
 *
 * @see https://haveibeenpwned.com/API/v3
 */
async function isPasswordCompromised(password: string): Promise<boolean> {
  try {
    // Hash password with SHA-1
    const sha1Hash = crypto
      .createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();

    // Get prefix and suffix
    const prefix = sha1Hash.slice(0, 5);
    const suffix = sha1Hash.slice(5);

    // Query HIBP API with prefix only
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'SmartFlush/1.0 (Security Check)',
      },
    });

    if (!response.ok) {
      throw new Error(`HIBP API returned ${response.status}`);
    }

    const text = await response.text();
    const hashes = text.split('\r\n');

    // Check if our suffix is in the response
    for (const line of hashes) {
      const [hashSuffix] = line.split(':');
      if (hashSuffix === suffix) {
        return true; // Password is compromised
      }
    }

    return false; // Password not in compromised list
  } catch (err) {
    console.error('[Password Validator] Error checking HIBP:', err);
    // On error, fail open (allow registration)
    // This prevents service disruption if HIBP is down
    throw err;
  }
}

/**
 * Get password strength feedback (optional, for UX)
 */
export function getPasswordStrengthFeedback(password: string): string {
  if (password.length < 8) {
    return 'Too short';
  }
  if (password.length < 12) {
    return 'Getting stronger';
  }
  if (password.length < 16) {
    return 'Good';
  }
  return 'Strong';
}
