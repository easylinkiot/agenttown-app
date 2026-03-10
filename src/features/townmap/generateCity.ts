export const MAP_WIDTH = 2400;
export const MAP_HEIGHT = 2800;
const TOTAL_BOTS = 30;

export interface NpcConfig {
  name: string;
  role: string;
  avatar: string;
  greeting: string;
  skills: string;
}

export type LotVisualType =
  | "red-cottage"
  | "blue-villa"
  | "dark-cabin"
  | "brown-manor"
  | "market-stall";

export interface LotData {
  id: string;
  x: number;
  y: number;
  label: string;
  visualType: LotVisualType;
  isMarket?: boolean;
  npc: NpcConfig;
}

export interface TreeData {
  x: number;
  y: number;
  scale: number;
}

const ROLES = [
  "Engineer",
  "Designer",
  "Product Mgr",
  "Data Scientist",
  "Marketer",
  "Sales",
  "HR",
  "Support",
  "DevOps",
  "Architect",
  "Founder",
  "Investor",
];

const NAMES = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Epsilon",
  "Zeta",
  "Eta",
  "Theta",
  "Iota",
  "Kappa",
  "Lambda",
  "Mu",
  "Nu",
  "Xi",
  "Omicron",
  "Pi",
  "Rho",
  "Sigma",
  "Tau",
  "Upsilon",
  "Phi",
  "Chi",
  "Psi",
  "Omega",
];

export function generateCity() {
  const lots: LotData[] = [];
  const trees: TreeData[] = [];

  const getRiverY = (x: number) => 1100 + 300 * Math.sin(x / 600);

  const isTooCloseToRiver = (x: number, y: number, padding = 350) => {
    const riverY = getRiverY(x);
    return Math.abs(y - riverY) < padding;
  };

  const isOnRoad = (x: number, y: number, padding = 100) => {
    if (Math.abs(x - 600) < padding) return true;
    if (Math.abs(x - 1800) < padding) return true;

    const tNorth = (x + 200) / 2800;
    const northY =
      (1 - tNorth) * (1 - tNorth) * 450 +
      2 * (1 - tNorth) * tNorth * 750 +
      tNorth * tNorth * 450;
    if (Math.abs(y - northY) < padding) return true;

    const tSouth = (x + 200) / 2800;
    const southY =
      (1 - tSouth) * (1 - tSouth) * 1900 +
      2 * (1 - tSouth) * tSouth * 1600 +
      tSouth * tSouth * 1900;
    if (Math.abs(y - southY) < padding) return true;

    return false;
  };

  const getRoadSidePosition = () => {
    const roadIdx = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;

    if (roadIdx === 0) {
      x = 200 + Math.random() * (MAP_WIDTH - 400);
      const t = (x + 200) / 2800;
      const roadY = (1 - t) * (1 - t) * 450 + 2 * (1 - t) * t * 750 + t * t * 450;
      y = roadY + (Math.random() > 0.5 ? 130 : -130);
    } else if (roadIdx === 1) {
      x = 200 + Math.random() * (MAP_WIDTH - 400);
      const t = (x + 200) / 2800;
      const roadY =
        (1 - t) * (1 - t) * 1900 + 2 * (1 - t) * t * 1600 + t * t * 1900;
      y = roadY + (Math.random() > 0.5 ? 130 : -130);
    } else if (roadIdx === 2) {
      y = 200 + Math.random() * (MAP_HEIGHT - 400);
      x = 600 + (Math.random() > 0.5 ? 130 : -130);
    } else {
      y = 200 + Math.random() * (MAP_HEIGHT - 400);
      x = 1800 + (Math.random() > 0.5 ? 130 : -130);
    }

    return { x, y };
  };

  for (let i = 0; i < 5; i += 1) {
    let attempts = 0;
    while (attempts < 100) {
      attempts += 1;
      const { x, y } = getRoadSidePosition();

      if (x < 50 || x > MAP_WIDTH - 50 || y < 50 || y > MAP_HEIGHT - 50) continue;
      if (isTooCloseToRiver(x, y, 360)) continue;
      if (isOnRoad(x, y, 80)) continue;
      if (lots.some((lot) => Math.hypot(lot.x - x, lot.y - y) < 200)) continue;

      lots.push({
        id: `market_${i}`,
        x,
        y,
        label: `Market ${i + 1}`,
        visualType: "market-stall",
        isMarket: true,
        npc: {
          name: `Shopkeeper ${i + 1}`,
          role: "Merchant",
          avatar: `https://api.dicebear.com/7.x/avataaars/png?seed=Market${i}&backgroundColor=ffdfbf`,
          greeting: `Welcome to Market #${i + 1}! Fresh data served daily.`,
          skills: "Trading",
        },
      });

      break;
    }
  }

  let houseAttempts = 0;
  while (lots.length < TOTAL_BOTS + 5 && houseAttempts < 3000) {
    houseAttempts += 1;
    const { x, y } = getRoadSidePosition();

    const jx = x + (Math.random() * 60 - 30);
    const jy = y + (Math.random() * 60 - 30);

    if (jx < 50 || jx > MAP_WIDTH - 50 || jy < 50 || jy > MAP_HEIGHT - 50) continue;
    if (isTooCloseToRiver(jx, jy, 360)) continue;
    if (isOnRoad(jx, jy, 90)) continue;
    if (lots.some((lot) => Math.hypot(lot.x - jx, lot.y - jy) < 160)) continue;

    const namePrefix = NAMES[(lots.length - 5) % NAMES.length];
    const role = ROLES[Math.floor(Math.random() * ROLES.length)];
    const name = `${namePrefix}-${Math.floor(10 + Math.random() * 90)}`;
    const types: LotVisualType[] = [
      "red-cottage",
      "blue-villa",
      "dark-cabin",
      "brown-manor",
    ];

    lots.push({
      id: `bot_${lots.length}`,
      x: jx,
      y: jy,
      label: name,
      visualType: types[Math.floor(Math.random() * types.length)],
      npc: {
        name: `${name} Bot`,
        role,
        avatar: `https://api.dicebear.com/7.x/avataaars/png?seed=${name}&backgroundColor=c0aede`,
        greeting: `Welcome to UsChat! I'm ${name}, a ${role}. How can I help?`,
        skills: role,
      },
    });
  }

  for (let i = 0; i < 120; i += 1) {
    const x = Math.random() * MAP_WIDTH;
    const y = Math.random() * MAP_HEIGHT;
    if (!isTooCloseToRiver(x, y, 280) && !isOnRoad(x, y, 70)) {
      trees.push({ x, y, scale: 0.7 + Math.random() * 0.6 });
    }
  }

  return { lots, trees };
}
