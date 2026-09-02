export interface RestroomTaskInput {
  deviceId: string;
  restroomName?: string | null;
  stallId?: string | null;
  stallNumber?: string | null;
}

export type RestroomGender =
  | 'male'
  | 'female'
  | 'faculty-male'
  | 'faculty-female'
  | 'pwd'
  | 'general';

export interface RestroomRoomDefinition {
  id: string;
  aliases?: string[];
  building: string;
  floor: string;
  roomName: string;
  gender: RestroomGender;
  stallCount: number;
}

export interface StallDefinition {
  id: string;
  roomId: string;
  building: string;
  floor: string;
  roomName: string;
  gender: RestroomGender;
  stallNumber: number;
  stallLabel: string;
  fullLabel: string;
  reportPath: string;
}

export const SDCA_RESTROOM_ROOMS: RestroomRoomDefinition[] = [
  // 1st Floor (Canteen: 7 Male, 3 Female; Faculty: 6 Male, 2 Female -> 18 Stalls)
  {
    id: 'SDCA-FL1-CANTEEN-M',
    aliases: ['SDCA-FL1-CANT-M', 'SDCA-FL1-M'],
    building: 'SDCA Annex',
    floor: '1F',
    roomName: 'SDCA Annex 1F Canteen Male Restroom',
    gender: 'male',
    stallCount: 7,
  },
  {
    id: 'SDCA-FL1-CANTEEN-F',
    aliases: ['SDCA-FL1-CANT-F', 'SDCA-FL1-F'],
    building: 'SDCA Annex',
    floor: '1F',
    roomName: 'SDCA Annex 1F Canteen Female Restroom',
    gender: 'female',
    stallCount: 3,
  },
  {
    id: 'SDCA-FL1-FACULTY-M',
    aliases: ['SDCA-FL1-FAC-M'],
    building: 'SDCA Annex',
    floor: '1F',
    roomName: 'SDCA Annex 1F Faculty Male Restroom',
    gender: 'faculty-male',
    stallCount: 6,
  },
  {
    id: 'SDCA-FL1-FACULTY-F',
    aliases: ['SDCA-FL1-FAC-F'],
    building: 'SDCA Annex',
    floor: '1F',
    roomName: 'SDCA Annex 1F Faculty Female Restroom',
    gender: 'faculty-female',
    stallCount: 2,
  },

  // 2nd Floor (Left: 7 Male, 5 Female, 1 PWD; Right: 7 Male, 5 Female, 1 PWD -> 26 Stalls)
  {
    id: 'SDCA-FL2-M1',
    aliases: ['SDCA-FL2-M-LEFT', 'SDCA-FL2-M'],
    building: 'SDCA Annex',
    floor: '2F',
    roomName: 'SDCA Annex 2F Male Restroom (Left Wing)',
    gender: 'male',
    stallCount: 7,
  },
  {
    id: 'SDCA-FL2-M2',
    aliases: ['SDCA-FL2-M-RIGHT'],
    building: 'SDCA Annex',
    floor: '2F',
    roomName: 'SDCA Annex 2F Male Restroom (Right Wing)',
    gender: 'male',
    stallCount: 7,
  },
  {
    id: 'SDCA-FL2-F1',
    aliases: ['SDCA-FL2-F-LEFT', 'SDCA-FL2-F'],
    building: 'SDCA Annex',
    floor: '2F',
    roomName: 'SDCA Annex 2F Female Restroom (Left Wing)',
    gender: 'female',
    stallCount: 5,
  },
  {
    id: 'SDCA-FL2-F2',
    aliases: ['SDCA-FL2-F-RIGHT'],
    building: 'SDCA Annex',
    floor: '2F',
    roomName: 'SDCA Annex 2F Female Restroom (Right Wing)',
    gender: 'female',
    stallCount: 5,
  },
  {
    id: 'SDCA-FL2-PWD1',
    aliases: ['SDCA-FL2-PWD-LEFT', 'SDCA-FL2-PWD'],
    building: 'SDCA Annex',
    floor: '2F',
    roomName: 'SDCA Annex 2F PWD Restroom (Left Wing)',
    gender: 'pwd',
    stallCount: 1,
  },
  {
    id: 'SDCA-FL2-PWD2',
    aliases: ['SDCA-FL2-PWD-RIGHT'],
    building: 'SDCA Annex',
    floor: '2F',
    roomName: 'SDCA Annex 2F PWD Restroom (Right Wing)',
    gender: 'pwd',
    stallCount: 1,
  },

  // 3rd Floor (Left: 7 Male, 5 Female, 1 PWD; Right: 7 Male, 5 Female, 1 PWD -> 26 Stalls)
  {
    id: 'SDCA-FL3-M1',
    aliases: ['SDCA-FL3-M-LEFT', 'SDCA-FL3-M'],
    building: 'SDCA Annex',
    floor: '3F',
    roomName: 'SDCA Annex 3F Male Restroom (Left Wing)',
    gender: 'male',
    stallCount: 7,
  },
  {
    id: 'SDCA-FL3-M2',
    aliases: ['SDCA-FL3-M-RIGHT'],
    building: 'SDCA Annex',
    floor: '3F',
    roomName: 'SDCA Annex 3F Male Restroom (Right Wing)',
    gender: 'male',
    stallCount: 7,
  },
  {
    id: 'SDCA-FL3-F1',
    aliases: ['SDCA-FL3-F-LEFT', 'SDCA-FL3-F'],
    building: 'SDCA Annex',
    floor: '3F',
    roomName: 'SDCA Annex 3F Female Restroom (Left Wing)',
    gender: 'female',
    stallCount: 5,
  },
  {
    id: 'SDCA-FL3-F2',
    aliases: ['SDCA-FL3-F-RIGHT'],
    building: 'SDCA Annex',
    floor: '3F',
    roomName: 'SDCA Annex 3F Female Restroom (Right Wing)',
    gender: 'female',
    stallCount: 5,
  },
  {
    id: 'SDCA-FL3-PWD1',
    aliases: ['SDCA-FL3-PWD-LEFT', 'SDCA-FL3-PWD'],
    building: 'SDCA Annex',
    floor: '3F',
    roomName: 'SDCA Annex 3F PWD Restroom (Left Wing)',
    gender: 'pwd',
    stallCount: 1,
  },
  {
    id: 'SDCA-FL3-PWD2',
    aliases: ['SDCA-FL3-PWD-RIGHT'],
    building: 'SDCA Annex',
    floor: '3F',
    roomName: 'SDCA Annex 3F PWD Restroom (Right Wing)',
    gender: 'pwd',
    stallCount: 1,
  },

  // 4th Floor (Left: 7 Male, 5 Female, 1 PWD; Right: 7 Male, 5 Female, 1 PWD -> 26 Stalls)
  {
    id: 'SDCA-FL4-M1',
    aliases: ['SDCA-FL4-M-LEFT', 'SDCA-FL4-M'],
    building: 'SDCA Annex',
    floor: '4F',
    roomName: 'SDCA Annex 4F Male Restroom (Left Wing)',
    gender: 'male',
    stallCount: 7,
  },
  {
    id: 'SDCA-FL4-M2',
    aliases: ['SDCA-FL4-M-RIGHT'],
    building: 'SDCA Annex',
    floor: '4F',
    roomName: 'SDCA Annex 4F Male Restroom (Right Wing)',
    gender: 'male',
    stallCount: 7,
  },
  {
    id: 'SDCA-FL4-F1',
    aliases: ['SDCA-FL4-F-LEFT', 'SDCA-FL4-F'],
    building: 'SDCA Annex',
    floor: '4F',
    roomName: 'SDCA Annex 4F Female Restroom (Left Wing)',
    gender: 'female',
    stallCount: 5,
  },
  {
    id: 'SDCA-FL4-F2',
    aliases: ['SDCA-FL4-F-RIGHT'],
    building: 'SDCA Annex',
    floor: '4F',
    roomName: 'SDCA Annex 4F Female Restroom (Right Wing)',
    gender: 'female',
    stallCount: 5,
  },
  {
    id: 'SDCA-FL4-PWD1',
    aliases: ['SDCA-FL4-PWD-LEFT', 'SDCA-FL4-PWD'],
    building: 'SDCA Annex',
    floor: '4F',
    roomName: 'SDCA Annex 4F PWD Restroom (Left Wing)',
    gender: 'pwd',
    stallCount: 1,
  },
  {
    id: 'SDCA-FL4-PWD2',
    aliases: ['SDCA-FL4-PWD-RIGHT'],
    building: 'SDCA Annex',
    floor: '4F',
    roomName: 'SDCA Annex 4F PWD Restroom (Right Wing)',
    gender: 'pwd',
    stallCount: 1,
  },
];

// Helper to format stall code e.g. 1 -> S01
function formatStallCode(num: number): string {
  return `S${num.toString().padStart(2, '0')}`;
}

// Generate all individual stalls dynamically from room inventory
function buildStallInventory(): Map<string, StallDefinition> {
  const stallMap = new Map<string, StallDefinition>();

  for (const room of SDCA_RESTROOM_ROOMS) {
    for (let s = 1; s <= room.stallCount; s++) {
      const stallCode = formatStallCode(s);
      const stallId = `${room.id}-${stallCode}`;
      const stallLabel = room.stallCount === 1 ? 'Single Stall' : `Stall ${s}`;
      const fullLabel = `${room.roomName} • ${stallLabel}`;

      const stallDef: StallDefinition = {
        id: stallId,
        roomId: room.id,
        building: room.building,
        floor: room.floor,
        roomName: room.roomName,
        gender: room.gender,
        stallNumber: s,
        stallLabel,
        fullLabel,
        reportPath: `/report/${stallId}`,
      };

      stallMap.set(stallId, stallDef);

      // Also index any alias prefixes
      if (room.aliases) {
        for (const alias of room.aliases) {
          stallMap.set(`${alias}-${stallCode}`, stallDef);
        }
      }
    }
  }

  return stallMap;
}

export const STALL_INVENTORY = buildStallInventory();

const RESTROOM_LABELS_BY_DEVICE_ID: Record<string, string> = {
  // Legacy / Test IDs
  FShQvy5eRcTVcREcNbns: 'Restroom 1',
  'toilet-01': 'Restroom 2',

  // 1st Floor (Canteen + Faculty Restrooms)
  'SDCA-FL1-CANTEEN-M': 'SDCA Annex 1F Canteen Male Restroom',
  'SDCA-FL1-CANTEEN-F': 'SDCA Annex 1F Canteen Female Restroom',
  'SDCA-FL1-FACULTY-M': 'SDCA Annex 1F Faculty Male Restroom',
  'SDCA-FL1-FACULTY-F': 'SDCA Annex 1F Faculty Female Restroom',
  'SDCA-FL1-M': 'SDCA Annex 1F Canteen Male Restroom',
  'SDCA-FL1-F': 'SDCA Annex 1F Canteen Female Restroom',
  'SDCA-FL1-CANT-M': 'SDCA Annex 1F Canteen Male Restroom',
  'SDCA-FL1-CANT-F': 'SDCA Annex 1F Canteen Female Restroom',
  'SDCA-FL1-FAC-M': 'SDCA Annex 1F Faculty Male Restroom',
  'SDCA-FL1-FAC-F': 'SDCA Annex 1F Faculty Female Restroom',

  // 2nd Floor (Left & Right Wings, PWD)
  'SDCA-FL2-M1': 'SDCA Annex 2F Male Restroom (Left Wing)',
  'SDCA-FL2-M2': 'SDCA Annex 2F Male Restroom (Right Wing)',
  'SDCA-FL2-F1': 'SDCA Annex 2F Female Restroom (Left Wing)',
  'SDCA-FL2-F2': 'SDCA Annex 2F Female Restroom (Right Wing)',
  'SDCA-FL2-PWD1': 'SDCA Annex 2F PWD Restroom (Left Wing)',
  'SDCA-FL2-PWD2': 'SDCA Annex 2F PWD Restroom (Right Wing)',
  'SDCA-FL2-PWD': 'SDCA Annex 2F PWD Restroom (Left Wing)',
  'SDCA-FL2-PWD-LEFT': 'SDCA Annex 2F PWD Restroom (Left Wing)',
  'SDCA-FL2-PWD-RIGHT': 'SDCA Annex 2F PWD Restroom (Right Wing)',
  'SDCA-FL2-M': 'SDCA Annex 2F Male Restroom (Left Wing)',
  'SDCA-FL2-F': 'SDCA Annex 2F Female Restroom (Left Wing)',
  'SDCA-FL2-M-LEFT': 'SDCA Annex 2F Male Restroom (Left Wing)',
  'SDCA-FL2-M-RIGHT': 'SDCA Annex 2F Male Restroom (Right Wing)',
  'SDCA-FL2-F-LEFT': 'SDCA Annex 2F Female Restroom (Left Wing)',
  'SDCA-FL2-F-RIGHT': 'SDCA Annex 2F Female Restroom (Right Wing)',

  // 3rd Floor (Left & Right Wings, PWD)
  'SDCA-FL3-M1': 'SDCA Annex 3F Male Restroom (Left Wing)',
  'SDCA-FL3-M2': 'SDCA Annex 3F Male Restroom (Right Wing)',
  'SDCA-FL3-F1': 'SDCA Annex 3F Female Restroom (Left Wing)',
  'SDCA-FL3-F2': 'SDCA Annex 3F Female Restroom (Right Wing)',
  'SDCA-FL3-PWD1': 'SDCA Annex 3F PWD Restroom (Left Wing)',
  'SDCA-FL3-PWD2': 'SDCA Annex 3F PWD Restroom (Right Wing)',
  'SDCA-FL3-PWD': 'SDCA Annex 3F PWD Restroom (Left Wing)',
  'SDCA-FL3-PWD-LEFT': 'SDCA Annex 3F PWD Restroom (Left Wing)',
  'SDCA-FL3-PWD-RIGHT': 'SDCA Annex 3F PWD Restroom (Right Wing)',
  'SDCA-FL3-M': 'SDCA Annex 3F Male Restroom (Left Wing)',
  'SDCA-FL3-F': 'SDCA Annex 3F Female Restroom (Left Wing)',
  'SDCA-FL3-M-LEFT': 'SDCA Annex 3F Male Restroom (Left Wing)',
  'SDCA-FL3-M-RIGHT': 'SDCA Annex 3F Male Restroom (Right Wing)',
  'SDCA-FL3-F-LEFT': 'SDCA Annex 3F Female Restroom (Left Wing)',
  'SDCA-FL3-F-RIGHT': 'SDCA Annex 3F Female Restroom (Right Wing)',

  // 4th Floor (Left & Right Wings, PWD)
  'SDCA-FL4-M1': 'SDCA Annex 4F Male Restroom (Left Wing)',
  'SDCA-FL4-M2': 'SDCA Annex 4F Male Restroom (Right Wing)',
  'SDCA-FL4-F1': 'SDCA Annex 4F Female Restroom (Left Wing)',
  'SDCA-FL4-F2': 'SDCA Annex 4F Female Restroom (Right Wing)',
  'SDCA-FL4-PWD1': 'SDCA Annex 4F PWD Restroom (Left Wing)',
  'SDCA-FL4-PWD2': 'SDCA Annex 4F PWD Restroom (Right Wing)',
  'SDCA-FL4-PWD': 'SDCA Annex 4F PWD Restroom (Left Wing)',
  'SDCA-FL4-PWD-LEFT': 'SDCA Annex 4F PWD Restroom (Left Wing)',
  'SDCA-FL4-PWD-RIGHT': 'SDCA Annex 4F PWD Restroom (Right Wing)',
  'SDCA-FL4-M': 'SDCA Annex 4F Male Restroom (Left Wing)',
  'SDCA-FL4-F': 'SDCA Annex 4F Female Restroom (Left Wing)',
  'SDCA-FL4-M-LEFT': 'SDCA Annex 4F Male Restroom (Left Wing)',
  'SDCA-FL4-M-RIGHT': 'SDCA Annex 4F Male Restroom (Right Wing)',
  'SDCA-FL4-F-LEFT': 'SDCA Annex 4F Female Restroom (Left Wing)',
  'SDCA-FL4-F-RIGHT': 'SDCA Annex 4F Female Restroom (Right Wing)',
};

export function getRestroomLabel(task: RestroomTaskInput): string {
  const restroomName = task.restroomName?.trim();

  if (restroomName) {
    if (task.stallNumber) {
      return `${restroomName} • Stall ${task.stallNumber}`;
    }
    return restroomName;
  }

  // Check if stallId matches known stall
  if (task.stallId && STALL_INVENTORY.has(task.stallId)) {
    return STALL_INVENTORY.get(task.stallId)!.fullLabel;
  }

  // Check if deviceId matches a stall ID
  if (task.deviceId && STALL_INVENTORY.has(task.deviceId)) {
    return STALL_INVENTORY.get(task.deviceId)!.fullLabel;
  }

  return RESTROOM_LABELS_BY_DEVICE_ID[task.deviceId] ?? task.deviceId;
}

export function getAllRooms(): RestroomRoomDefinition[] {
  return [...SDCA_RESTROOM_ROOMS];
}

export function getAllStalls(): StallDefinition[] {
  return Array.from(
    new Map(
      Array.from(STALL_INVENTORY.values()).map((stall) => [stall.id, stall]),
    ).values(),
  );
}

export function getStallsByFloor(floor: string): StallDefinition[] {
  const target = floor.trim().toUpperCase();
  return getAllStalls().filter(
    (s) => s.floor.toUpperCase() === target || target.includes(s.floor.toUpperCase()),
  );
}

export function getStallsByRoom(roomId: string): StallDefinition[] {
  return getAllStalls().filter((s) => s.roomId === roomId);
}

export function getStallById(stallId: string): StallDefinition | undefined {
  return STALL_INVENTORY.get(stallId);
}

export function getRestroomSummary() {
  const stalls = getAllStalls();
  const floors = new Set(SDCA_RESTROOM_ROOMS.map((r) => r.floor));
  return {
    totalFloors: floors.size,
    totalRooms: SDCA_RESTROOM_ROOMS.length,
    totalStalls: stalls.length,
    floorBreakdown: {
      '1F': getStallsByFloor('1F').length,
      '2F': getStallsByFloor('2F').length,
      '3F': getStallsByFloor('3F').length,
      '4F': getStallsByFloor('4F').length,
    },
  };
}

export function generateStallQrUrl(
  stallId: string,
  baseUrl = 'http://localhost:3000',
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/report/${encodeURIComponent(stallId)}`;
}

