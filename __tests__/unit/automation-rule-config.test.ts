import {
  AUTOMATION_RULE_CONFIG,
  validateAutomationRule,
} from '@/lib/automation-rule-config';

describe('automation rule configuration', () => {
  it('accepts no-water rules with the documented default wait and canonical maintenance action', () => {
    const result = validateAutomationRule({
      group: 'system_alert',
      trigger: 'no_water_after_flush',
      threshold: 2,
      action: 'Create Maintenance Ticket',
    });

    expect(result).toEqual({
      success: true,
      data: {
        group: 'system_alert',
        trigger: 'no_water_after_flush',
        threshold: 2,
        waterWaitSeconds: 8,
        repeatIntervalMinutes: 10,
        action: 'Send Task to Available Maintenance',
      },
    });
  });

  it.each([1, 10, 1440])(
    'accepts a whole repeat interval of %d minutes',
    (repeatIntervalMinutes) => {
      expect(
        validateAutomationRule({
          group: 'system_alert',
          trigger: 'ultrasonic_sensor_fault',
          threshold: 10,
          action: 'Send Warning Email',
          repeatIntervalMinutes,
        }),
      ).toEqual({
        success: true,
        data: expect.objectContaining({ repeatIntervalMinutes }),
      });
    },
  );

  it.each([0, 1.5, 1441, '10', true, null, Number.NaN])(
    'rejects an invalid repeat interval of %p',
    (repeatIntervalMinutes) => {
      expect(
        validateAutomationRule({
          group: 'system_alert',
          trigger: 'ultrasonic_sensor_fault',
          threshold: 10,
          action: 'Send Warning Email',
          repeatIntervalMinutes,
        }),
      ).toEqual({
        success: false,
        error: expect.stringContaining('repeatIntervalMinutes'),
      });
    },
  );

  it.each([
    ['ultrasonic_sensor_fault', 'system_alert', 4, 'threshold'],
    ['ultrasonic_sensor_fault', 'system_alert', 10.5, 'threshold'],
    ['water_overuse', 'system_alert', 0, 'threshold'],
    ['no_water_after_flush', 'system_alert', 21, 'threshold'],
    ['maintenance_due', 'maintenance', 100001, 'threshold'],
  ])(
    'rejects an invalid %s %s rule setting',
    (trigger, group, threshold, invalidField) => {
      const result = validateAutomationRule({
        group,
        trigger,
        threshold,
        action: 'Send Warning Email',
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining(invalidField),
      });
    },
  );

  it('rejects trigger-group mismatches, unknown actions, and no-water wait values outside the supported range', () => {
    expect(
      validateAutomationRule({
        group: 'maintenance',
        trigger: 'water_overuse',
        threshold: 12.5,
        action: 'Send Warning Email',
      }),
    ).toEqual({ success: false, error: expect.stringContaining('group') });

    expect(
      validateAutomationRule({
        group: 'system_alert',
        trigger: 'no_water_after_flush',
        threshold: 2,
        waterWaitSeconds: 31,
        action: 'Escalate to vendor',
      }),
    ).toEqual({ success: false, error: expect.stringContaining('action') });

    expect(
      validateAutomationRule({
        group: 'system_alert',
        trigger: 'no_water_after_flush',
        threshold: 2,
        waterWaitSeconds: 31,
        action: 'Send Warning Email',
      }),
    ).toEqual({
      success: false,
      error: expect.stringContaining('waterWaitSeconds'),
    });
  });

  it('exposes exactly the four creation choices and their contextual labels', () => {
    expect(Object.keys(AUTOMATION_RULE_CONFIG)).toEqual([
      'ultrasonic_sensor_fault',
      'water_overuse',
      'no_water_after_flush',
      'maintenance_due',
    ]);
    expect(AUTOMATION_RULE_CONFIG.water_overuse.threshold.label).toBe(
      'Water volume limit',
    );
    expect(AUTOMATION_RULE_CONFIG.no_water_after_flush.waterWaitSeconds).toMatchObject({
      label: 'Water wait time',
      default: 8,
    });
  });
});
