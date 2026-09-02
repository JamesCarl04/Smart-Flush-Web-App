import {
  getRestroomLabel,
  getAllRooms,
  getAllStalls,
  getStallsByFloor,
  getStallsByRoom,
  getStallById,
  getRestroomSummary,
  generateStallQrUrl,
} from '@/lib/restrooms';

describe('Web App restrooms utility', () => {
  describe('getRestroomLabel', () => {
    it('should return custom restroomName when provided and non-empty', () => {
      expect(
        getRestroomLabel({
          deviceId: 'toilet-01',
          restroomName: 'Executive Restroom 3F',
        }),
      ).toBe('Executive Restroom 3F');

      expect(
        getRestroomLabel({
          deviceId: 'FShQvy5eRcTVcREcNbns',
          restroomName: 'Main Lobby Restroom',
        }),
      ).toBe('Main Lobby Restroom');
    });

    it('should include stallNumber when custom restroomName and stallNumber are provided', () => {
      expect(
        getRestroomLabel({
          deviceId: 'custom-dev-1',
          restroomName: '2F Male Restroom 1',
          stallNumber: '3',
        }),
      ).toBe('2F Male Restroom 1 • Stall 3');
    });

    it('should resolve full stall label from stallId when restroomName is absent', () => {
      expect(
        getRestroomLabel({
          deviceId: 'generic-device',
          stallId: 'SDCA-FL1-CANTEEN-M-S03',
        }),
      ).toBe('1F Canteen Male Restroom • Stall 3');
    });

    it('should resolve full stall label when deviceId is a stall ID', () => {
      expect(
        getRestroomLabel({
          deviceId: 'SDCA-FL2-PWD-S01',
        }),
      ).toBe('2F Left Wing PWD Restroom • Single Stall');
    });

    it('should return predefined mapping for recognized device IDs when restroomName is null or undefined', () => {
      expect(
        getRestroomLabel({
          deviceId: 'FShQvy5eRcTVcREcNbns',
          restroomName: null,
        }),
      ).toBe('Restroom 1');

      expect(
        getRestroomLabel({
          deviceId: 'toilet-01',
          restroomName: undefined,
        }),
      ).toBe('Restroom 2');
    });

    it('should fallback to deviceId mapping when restroomName is empty string or whitespace', () => {
      expect(
        getRestroomLabel({
          deviceId: 'FShQvy5eRcTVcREcNbns',
          restroomName: '   ',
        }),
      ).toBe('Restroom 1');

      expect(
        getRestroomLabel({
          deviceId: 'toilet-01',
          restroomName: '',
        }),
      ).toBe('Restroom 2');
    });

    it('should fallback to raw deviceId for unknown device IDs without a custom restroomName', () => {
      expect(
        getRestroomLabel({
          deviceId: 'unmapped-sensor-999',
          restroomName: null,
        }),
      ).toBe('unmapped-sensor-999');

      expect(
        getRestroomLabel({
          deviceId: 'custom-toilet-xyz',
          restroomName: undefined,
        }),
      ).toBe('custom-toilet-xyz');
    });
  });

  describe('Inventory and QR utilities', () => {
    it('should return all 22 defined rooms across 4 floors', () => {
      const rooms = getAllRooms();
      expect(rooms.length).toBe(22);
    });

    it('should return all 96 unique stalls across the building', () => {
      const stalls = getAllStalls();
      expect(stalls.length).toBe(96);
    });

    it('should filter stalls correctly by floor', () => {
      const floor1 = getStallsByFloor('1F');
      const floor2 = getStallsByFloor('2F');
      const floor3 = getStallsByFloor('3F');
      const floor4 = getStallsByFloor('4F');

      expect(floor1.length).toBe(18);
      expect(floor2.length).toBe(26);
      expect(floor3.length).toBe(26);
      expect(floor4.length).toBe(26);
    });

    it('should filter stalls by roomId', () => {
      const canteenMaleStalls = getStallsByRoom('SDCA-FL1-CANTEEN-M');
      expect(canteenMaleStalls.length).toBe(7);
      expect(canteenMaleStalls[0].id).toBe('SDCA-FL1-CANTEEN-M-S01');
      expect(canteenMaleStalls[6].id).toBe('SDCA-FL1-CANTEEN-M-S07');

      const pwdStall = getStallsByRoom('SDCA-FL2-PWD1');
      expect(pwdStall.length).toBe(1);
      expect(pwdStall[0].stallLabel).toBe('Single Stall');
    });

    it('should find stall by ID and aliases', () => {
      const stall = getStallById('SDCA-FL1-CANTEEN-F-S02');
      expect(stall).toBeDefined();
      expect(stall?.roomName).toBe('1F Canteen Female Restroom');
      expect(stall?.stallNumber).toBe(2);

      const aliasedStall = getStallById('SDCA-FL1-CANT-F-S02');
      expect(aliasedStall).toBeDefined();
      expect(aliasedStall?.id).toBe('SDCA-FL1-CANTEEN-F-S02');
    });

    it('should calculate complete restroom summary', () => {
      const summary = getRestroomSummary();
      expect(summary.totalFloors).toBe(4);
      expect(summary.totalRooms).toBe(22);
      expect(summary.totalStalls).toBe(96);
      expect(summary.floorBreakdown['1F']).toBe(18);
      expect(summary.floorBreakdown['2F']).toBe(26);
      expect(summary.floorBreakdown['3F']).toBe(26);
      expect(summary.floorBreakdown['4F']).toBe(26);
    });

    it('should generate properly formatted stall QR URLs', () => {
      expect(generateStallQrUrl('SDCA-FL1-CANTEEN-M-S01')).toBe(
        'http://localhost:3000/report/SDCA-FL1-CANTEEN-M-S01',
      );
      expect(
        generateStallQrUrl(
          'SDCA-FL2-M1-S03',
          'https://klir-app.sdca.edu.ph/',
        ),
      ).toBe('https://klir-app.sdca.edu.ph/report/SDCA-FL2-M1-S03');
    });
  });
});
