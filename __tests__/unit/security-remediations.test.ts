import { escapeCsv } from '@/app/api/reports/generate/route';
import { sensorConfigSchema, validateData } from '@/lib/schemas';

describe('Security Remediations', () => {
  describe('escapeCsv Formula Injection Prevention', () => {
    it('returns empty string for null or undefined', () => {
      expect(escapeCsv(null)).toBe('');
      expect(escapeCsv(undefined)).toBe('');
      expect(escapeCsv('')).toBe('');
    });

    it('neutralizes formula injection characters (=, +, -, @, \\t, \\r)', () => {
      expect(escapeCsv('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(escapeCsv('+12345')).toBe("'+12345");
      expect(escapeCsv('-cmd|/C calc!A0')).toBe("'-cmd|/C calc!A0");
      expect(escapeCsv('@SUM(A1)')).toBe("'@SUM(A1)");
      expect(escapeCsv('\tTAB_VAL')).toBe("'\tTAB_VAL");
      expect(escapeCsv('\rCR_VAL')).toBe("'\rCR_VAL");
    });

    it('properly quotes and escapes internal double quotes and commas', () => {
      expect(escapeCsv('Normal text')).toBe('Normal text');
      expect(escapeCsv('Text with, comma')).toBe('"Text with, comma"');
      expect(escapeCsv('Text with "quotes"')).toBe('"Text with ""quotes"""');
      expect(escapeCsv('=Formula with, comma')).toBe('"\'=Formula with, comma"');
    });

    it('neutralizes formula triggers preceded by leading whitespace', () => {
      expect(escapeCsv('   =1+1')).toBe("'   =1+1");
      expect(escapeCsv('  +CMD()')).toBe("'  +CMD()");
      expect(escapeCsv('  -5+5')).toBe("'  -5+5");
      expect(escapeCsv('  @HYPERLINK("http://evil.com")')).toBe(
        '"\'  @HYPERLINK(""http://evil.com"")"',
      );
    });
  });

  describe('sensorConfigSchema validation', () => {
    it('validates valid single-field config', () => {
      const result = validateData({ threshold: 45 }, sensorConfigSchema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.threshold).toBe(45);
      }
    });

    it('validates valid multi-field timing config', () => {
      const result = validateData(
        { pumpDuration: 5, uvDuration: 30, personGoneConfirm: 3 },
        sensorConfigSchema,
      );
      expect(result.success).toBe(true);
    });

    it('rejects empty config when no fields are provided', () => {
      const result = validateData({}, sensorConfigSchema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('At least one config field is required');
      }
    });

    it('rejects out of bound values', () => {
      expect(validateData({ pumpDuration: 0 }, sensorConfigSchema).success).toBe(false);
      expect(validateData({ pumpDuration: 35 }, sensorConfigSchema).success).toBe(false);
      expect(validateData({ uvDuration: 5 }, sensorConfigSchema).success).toBe(false);
      expect(validateData({ uvDuration: 150 }, sensorConfigSchema).success).toBe(false);
      expect(validateData({ threshold: 5 }, sensorConfigSchema).success).toBe(false);
      expect(validateData({ threshold: 105 }, sensorConfigSchema).success).toBe(false);
      expect(validateData({ personGoneConfirm: 0 }, sensorConfigSchema).success).toBe(false);
      expect(validateData({ personGoneConfirm: 15 }, sensorConfigSchema).success).toBe(false);
    });
  });
});
