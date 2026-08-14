// lib/schemas.ts
/**
 * HIGH FIX: Input validation schemas using Zod
 * Centralized validation for all API routes
 * Prevents injection attacks and ensures data consistency
 */

import { z } from 'zod';

// Common field schemas
const deviceIdSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9\-_]+$/, 'Device ID can only contain letters, numbers, hyphens, and underscores');

const emailSchema = z.string().email('Invalid email address');

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters (OWASP recommendation)');

const displayNameSchema = z
  .string()
  .min(1)
  .max(100, 'Display name must be 100 characters or fewer')
  .regex(/^[a-zA-Z0-9\s\-']+$/, 'Display name contains invalid characters');

const noteSchema = z
  .string()
  .max(500, 'Note must be 500 characters or fewer')
  .optional();

// Authentication schemas
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.object({
  code: z.string().min(1, 'Reset code is required'),
  password: passwordSchema,
});

// Device schemas
export const deviceCreateSchema = z.object({
  name: z.string().min(1).max(100, 'Device name must be 100 characters or fewer'),
  location: z.string().min(1).max(100, 'Location must be 100 characters or fewer'),
  deviceId: deviceIdSchema,
});

export const sensorConfigSchema = z.object({
  pumpDuration: z
    .number()
    .min(1, 'Pump duration must be at least 1 second')
    .max(30, 'Pump duration must not exceed 30 seconds'),
  uvDuration: z
    .number()
    .min(10, 'UV duration must be at least 10 seconds')
    .max(120, 'UV duration must not exceed 120 seconds'),
  threshold: z
    .number()
    .min(10, 'Occupancy threshold must be at least 10%')
    .max(100, 'Occupancy threshold must not exceed 100%'),
});

// Task schemas
export const taskCreateSchema = z.object({
  toiletId: deviceIdSchema,
  note: noteSchema,
  assignedTo: z.string().optional(),
  assignedToIds: z.array(z.string().uuid()).optional(),
});

export const taskUpdateSchema = z.object({
  status: z.enum(['pending', 'in-progress', 'completed', 'cancelled']),
  note: noteSchema,
});

// Actuator command schemas
export const pumpCommandSchema = z.object({
  command: z.enum(['ON', 'OFF'], {
    errorMap: () => ({ message: 'Command must be either "ON" or "OFF"' }),
  }),
});

export const uvCommandSchema = z.object({
  command: z.enum(['ON', 'OFF'], {
    errorMap: () => ({ message: 'Command must be either "ON" or "OFF"' }),
  }),
});

export const lidCommandSchema = z.object({
  command: z.enum(['OPEN', 'CLOSE'], {
    errorMap: () => ({ message: 'Command must be either "OPEN" or "CLOSE"' }),
  }),
});

// Alert schemas
export const alertCreateSchema = z.object({
  type: z.string().min(1).max(50, 'Alert type must be 50 characters or fewer'),
  message: z.string().min(1).max(500, 'Alert message must be 500 characters or fewer'),
  severity: z.enum(['low', 'medium', 'high']),
  deviceId: deviceIdSchema,
});

// Maintenance notes schemas
export const maintenanceNoteCreateSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  note: z
    .string()
    .min(1, 'Note cannot be empty')
    .max(1000, 'Note must be 1000 characters or fewer'),
  attachments: z.array(z.string().url()).optional(),
});

// Automation rule schemas
export const automationRuleSchema = z.object({
  name: z.string().min(1).max(100, 'Rule name must be 100 characters or fewer'),
  group: z.string().min(1).max(50, 'Group must be 50 characters or fewer'),
  trigger: z.string().min(1).max(50, 'Trigger must be 50 characters or fewer'),
  threshold: z.number().positive('Threshold must be a positive number'),
  action: z.string().min(1).max(50, 'Action must be 50 characters or fewer'),
  enabled: z.boolean().default(true),
});

/**
 * Utility function to validate and parse data against a schema
 * @param data - Data to validate
 * @param schema - Zod schema
 * @returns Validation result with data or errors
 */
export function validateData<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
): { success: boolean; data?: T; error?: string } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      const message = `${firstError.path.join('.')}: ${firstError.message}`;
      return { success: false, error: message };
    }
    return { success: false, error: 'Validation failed' };
  }
}

/**
 * Type exports for TypeScript
 */
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type PumpCommandInput = z.infer<typeof pumpCommandSchema>;
export type UVCommandInput = z.infer<typeof uvCommandSchema>;
export type LidCommandInput = z.infer<typeof lidCommandSchema>;
export type MaintenanceNoteInput = z.infer<typeof maintenanceNoteCreateSchema>;
export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;
