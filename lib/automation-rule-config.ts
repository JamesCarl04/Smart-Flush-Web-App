export const AUTOMATION_ACTIONS = [
  'Send Warning Email',
  'Disable Subsystem',
  'Send Task to Available Maintenance',
] as const;

export const MAINTENANCE_ACTION_ALIAS = 'Create Maintenance Ticket';
export const DEFAULT_REPEAT_INTERVAL_MINUTES = 10;

export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];
export type AutomationActionInput =
  | AutomationAction
  | typeof MAINTENANCE_ACTION_ALIAS;
export type AutomationRuleGroup = 'system_alert' | 'maintenance';
export type AutomationRuleTrigger =
  | 'ultrasonic_sensor_fault'
  | 'water_overuse'
  | 'no_water_after_flush'
  | 'maintenance_due';

export type NumericSetting = {
  label: string;
  helperText: string;
  unit: string;
  min: number;
  max?: number;
  integer: boolean;
  positive?: boolean;
  default?: number;
};

export type AutomationRuleDefinition = {
  group: AutomationRuleGroup;
  label: string;
  threshold: NumericSetting;
  waterWaitSeconds?: NumericSetting;
};

export const AUTOMATION_RULE_CONFIG: Record<
  AutomationRuleTrigger,
  AutomationRuleDefinition
> = {
  ultrasonic_sensor_fault: {
    group: 'system_alert',
    label: 'Ultrasonic Sensor Fault',
    threshold: {
      label: 'Invalid reading duration',
      helperText: 'Create an alert when invalid ultrasonic readings persist.',
      unit: 'seconds',
      min: 5,
      max: 60,
      integer: true,
      default: 10,
    },
  },
  water_overuse: {
    group: 'system_alert',
    label: 'Water Overuse',
    threshold: {
      label: 'Water volume limit',
      helperText: 'Create an alert when a flush uses more water than this limit.',
      unit: 'litres',
      min: 0,
      integer: false,
      positive: true,
    },
  },
  no_water_after_flush: {
    group: 'system_alert',
    label: 'No Water After Flush',
    threshold: {
      label: 'Consecutive dry cycles',
      helperText: 'Create an alert after this many flushes have no water flow.',
      unit: 'cycles',
      min: 1,
      max: 20,
      integer: true,
      default: 2,
    },
    waterWaitSeconds: {
      label: 'Water wait time',
      helperText: 'Wait this long after each flush before checking for water flow.',
      unit: 'seconds',
      min: 5,
      max: 30,
      integer: true,
      default: 8,
    },
  },
  maintenance_due: {
    group: 'maintenance',
    label: 'Routine Toilet Check',
    threshold: {
      label: 'Completed cycles',
      helperText: 'Create a maintenance task after this many completed flush cycles.',
      unit: 'cycles',
      min: 1,
      max: 100000,
      integer: true,
      default: 200,
    },
  },
};

export type AutomationRuleInput = {
  group: unknown;
  trigger: unknown;
  threshold: unknown;
  action: unknown;
  waterWaitSeconds?: unknown;
  repeatIntervalMinutes?: unknown;
};

export type ValidAutomationRule = {
  group: AutomationRuleGroup;
  trigger: AutomationRuleTrigger;
  threshold: number;
  action: AutomationAction;
  waterWaitSeconds?: number;
  repeatIntervalMinutes: number;
};

export type AutomationRuleValidationResult =
  | { success: true; data: ValidAutomationRule }
  | { success: false; error: string };

export function getAutomationRuleDefinition(
  trigger: unknown,
): AutomationRuleDefinition | undefined {
  if (typeof trigger !== 'string') return undefined;
  return AUTOMATION_RULE_CONFIG[trigger as AutomationRuleTrigger];
}

export function normalizeAutomationAction(
  action: unknown,
): AutomationAction | undefined {
  if (action === MAINTENANCE_ACTION_ALIAS) {
    return 'Send Task to Available Maintenance';
  }

  return AUTOMATION_ACTIONS.includes(action as AutomationAction)
    ? (action as AutomationAction)
    : undefined;
}

export function isTaskDispatchAction(action: unknown): boolean {
  return normalizeAutomationAction(action) === 'Send Task to Available Maintenance';
}

export function getRepeatIntervalMinutes(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 1440
    ? value
    : DEFAULT_REPEAT_INTERVAL_MINUTES;
}

function validateNumericSetting(
  field: string,
  value: unknown,
  setting: NumericSetting,
): { value: number } | { error: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { error: `${field} must be a finite number` };
  }

  if (setting.integer && !Number.isInteger(value)) {
    return { error: `${field} must be an integer` };
  }

  const isBelowMinimum = setting.positive
    ? value <= setting.min
    : value < setting.min;
  if (isBelowMinimum || (setting.max !== undefined && value > setting.max)) {
    return {
      error: setting.max === undefined
        ? `${field} must be greater than ${setting.min}`
        : `${field} must be between ${setting.min} and ${setting.max}`,
    };
  }

  return { value };
}

export function validateAutomationRule(
  input: AutomationRuleInput,
): AutomationRuleValidationResult {
  const config = getAutomationRuleDefinition(input.trigger);
  if (!config) {
    return { success: false, error: 'trigger is not supported' };
  }

  if (input.group !== config.group) {
    return {
      success: false,
      error: `group must be ${config.group} for ${input.trigger}`,
    };
  }

  const action = normalizeAutomationAction(input.action);
  if (!action) {
    return { success: false, error: 'action is not supported' };
  }

  const threshold = validateNumericSetting(
    'threshold',
    input.threshold,
    config.threshold,
  );
  if ('error' in threshold) return { success: false, error: threshold.error };

  const repeatIntervalMinutes = validateNumericSetting(
    'repeatIntervalMinutes',
    input.repeatIntervalMinutes === undefined
      ? DEFAULT_REPEAT_INTERVAL_MINUTES
      : input.repeatIntervalMinutes,
    {
      label: 'Repeat interval',
      helperText: 'Set the minimum time between repeated rule actions.',
      unit: 'minutes',
      min: 1,
      max: 1440,
      integer: true,
    },
  );
  if ('error' in repeatIntervalMinutes) {
    return { success: false, error: repeatIntervalMinutes.error };
  }

  if (!config.waterWaitSeconds) {
    if (input.waterWaitSeconds !== undefined) {
      return {
        success: false,
        error: 'waterWaitSeconds is only supported for no_water_after_flush',
      };
    }

    return {
      success: true,
      data: {
        group: config.group,
        trigger: input.trigger as AutomationRuleTrigger,
        threshold: threshold.value,
        action,
        repeatIntervalMinutes: repeatIntervalMinutes.value,
      },
    };
  }

  const waitValue =
    input.waterWaitSeconds === undefined
      ? config.waterWaitSeconds.default
      : input.waterWaitSeconds;
  const waterWaitSeconds = validateNumericSetting(
    'waterWaitSeconds',
    waitValue,
    config.waterWaitSeconds,
  );
  if ('error' in waterWaitSeconds) {
    return { success: false, error: waterWaitSeconds.error };
  }

  return {
    success: true,
    data: {
      group: config.group,
      trigger: input.trigger as AutomationRuleTrigger,
      threshold: threshold.value,
      action,
      waterWaitSeconds: waterWaitSeconds.value,
      repeatIntervalMinutes: repeatIntervalMinutes.value,
    },
  };
}
