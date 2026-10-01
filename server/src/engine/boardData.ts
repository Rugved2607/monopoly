import type { BoardDef, Group, Space } from '../../../shared/types';

/**
 * INDIA PROPERTY TYCOON board: 56 spaces (4 corners + 13 per side).
 *
 *   28 ── Free Parking ........ 42 Go To Jail
 *    .                          .
 *   14 ── Jail ................  0 GO
 *
 * Positions run anticlockwise starting at GO (bottom-right), exactly like the
 * classic layout, but every side is 13 spaces long instead of 9.
 *
 * Economy: 12 colour groups (11 × 3 cities, 1 × 2 cities) priced ₹600 → ₹5,000,
 * 5 transport hubs, 3 utilities, 2 taxes, 7 event-card spaces. Starting cash
 * ₹15,000 and GO salary ₹2,000 (the classic $1,500 / $200 ratios ×10).
 */

export const JAIL_INDEX = 14;
export const GO_TO_JAIL_INDEX = 42;
export const JAIL_FINE = 500;
export const MORTGAGE_INTEREST_PCT = 10;
export const UTILITY_MULTIPLIERS = [0, 40, 100, 150];
export const TRANSPORT_RENTS = [0, 250, 500, 1000, 2000, 3500];

const GROUPS: Omit<Group, 'id' | 'size'>[] = [
  { name: 'Heartland', color: '#8d5a3b' },
  { name: 'Central Plateau', color: '#5fb3d9' },
  { name: 'Desert & Hills', color: '#a6cf4f' },
  { name: 'Culture Trail', color: '#e879a8' },
  { name: 'Royal Heritage', color: '#f59e3b' },
  { name: 'Eastern Gate', color: '#8b5cf6' },
  { name: 'Southern Coast', color: '#e04848' },
  { name: 'Garden Cities', color: '#f2c81a' },
  { name: 'Sun & Sand', color: '#22a06b' },
  { name: 'Business Belt', color: '#0ea5a4' },
  { name: 'Tech Corridor', color: '#2f5fd0' },
  { name: 'Metropolis', color: '#8a1f6b' },
];

// [name, short, tagline, price]
type P = [string, string, string, number];
const G: P[][] = [
  [
    ['Patna', 'Patna', 'Gateway of the Ganga plains', 600],
    ['Ranchi', 'Ranchi', 'City of waterfalls', 700],
  ],
  [
    ['Bhopal', 'Bhopal', 'City of lakes', 900],
    ['Indore', 'Indore', 'Street-food capital', 900],
    ['Nagpur', 'Nagpur', 'The orange city', 1000],
  ],
  [
    ['Nashik', 'Nashik', 'Vineyards and ghats', 1100],
    ['Jodhpur', 'Jodhpur', 'The blue city', 1100],
    ['Dehradun', 'Dehradun', 'Doorway to the Himalayas', 1200],
  ],
  [
    ['Amritsar', 'Amritsar', 'Golden Temple town', 1300],
    ['Lucknow', 'Lucknow', 'City of nawabs', 1300],
    ['Varanasi', 'Varanasi', 'The eternal city', 1400],
  ],
  [
    ['Agra', 'Agra', 'Home of the Taj', 1500],
    ['Udaipur', 'Udaipur', 'City of lakes and palaces', 1500],
    ['Coimbatore', 'Coimbatore', 'The Manchester of the South', 1600],
  ],
  [
    ['Bhubaneswar', 'Bhubanes-war', 'Temple city of Odisha', 1800],
    ['Guwahati', 'Guwahati', 'Gateway to the North-East', 1800],
    ['Vadodara', 'Vadodara', 'Cultural capital of Gujarat', 1900],
  ],
  [
    ['Mysuru', 'Mysuru', 'Palace city', 2100],
    ['Kochi', 'Kochi', 'Queen of the Arabian Sea', 2100],
    ['Visakhapatnam', 'Visakha-patnam', 'Port city of the East Coast', 2200],
  ],
  [
    ['Chandigarh', 'Chandi-garh', 'The planned city', 2400],
    ['Surat', 'Surat', 'Diamond and textile hub', 2400],
    ['Thiruvananthapuram', 'Thiruvanan-thapuram', 'Capital of Kerala', 2500],
  ],
  [
    ['Jaipur', 'Jaipur', 'The pink city', 2700],
    ['Goa', 'Goa', 'Beaches and Portuguese quarters', 2700],
    ['Ahmedabad', 'Ahmedabad', 'Heritage and textiles', 2800],
  ],
  [
    ['Kolkata', 'Kolkata', 'City of joy', 3000],
    ['Noida', 'Noida', 'Planned media and tech city', 3000],
    ['Pune', 'Pune', 'Technology & Business District', 3100],
  ],
  [
    ['Gurugram', 'Gurugram', 'Corporate skyline', 3500],
    ['Hyderabad', 'Hyderabad', 'Pearl and IT capital', 3500],
    ['Chennai', 'Chennai', 'Gateway to the South', 3700],
  ],
  [
    ['Bengaluru', 'Bengaluru', 'Silicon Valley of India', 4200],
    ['Delhi', 'Delhi', 'The capital', 4600],
    ['Mumbai', 'Mumbai', 'City of dreams', 5000],
  ],
];

const HOUSE_COST_BY_GROUP = [500, 500, 500, 1000, 1000, 1000, 1500, 1500, 1500, 2000, 2000, 2000];

/** Classic rent multiplier ladder (low end of the board) and the premium end, interpolated by tier. */
const LADDER_LOW = [1, 5, 15, 45, 80, 125];
const LADDER_HIGH = [1, 4, 12, 28, 34, 40];

function roundTo(n: number, step: number) {
  return Math.max(step, Math.round(n / step) * step);
}

function rentsFor(price: number, tier: number): number[] {
  const t = tier / (GROUPS.length - 1);
  const base = roundTo(price * (0.04 + 0.088 * t), 10);
  return LADDER_LOW.map((low, i) => {
    const m = low + (LADDER_HIGH[i] - low) * t;
    return i === 0 ? base : roundTo(base * m, 10);
  });
}

type Slot =
  | { k: 'go' }
  | { k: 'jail' }
  | { k: 'free' }
  | { k: 'gotojail' }
  | { k: 'prop'; g: number; i: number }
  | { k: 'transport'; name: string; short: string; sub: string }
  | { k: 'utility'; name: string; short: string; sub: string; icon: string }
  | { k: 'tax'; name: string; amount: number }
  | { k: 'khazana' }
  | { k: 'bhagya' };

const prop = (g: number, i: number): Slot => ({ k: 'prop', g, i });
const tr = (name: string, short: string, sub: string): Slot => ({ k: 'transport', name, short, sub });

/** The 56-space layout, index = board position. */
const LAYOUT: Slot[] = [
  { k: 'go' }, // 0
  prop(0, 0), // 1 Patna
  { k: 'khazana' }, // 2
  prop(0, 1), // 3 Ranchi
  { k: 'tax', name: 'Income Tax', amount: 2000 }, // 4
  tr('Indian Railways', 'Indian Railways', 'The lifeline of the nation'), // 5
  prop(1, 0), // 6 Bhopal
  { k: 'bhagya' }, // 7
  prop(1, 1), // 8 Indore
  prop(1, 2), // 9 Nagpur
  { k: 'utility', name: 'Electricity Board', short: 'Electricity Board', sub: 'Power for the nation', icon: '⚡' }, // 10
  prop(2, 0), // 11 Nashik
  prop(2, 1), // 12 Jodhpur
  prop(2, 2), // 13 Dehradun
  { k: 'jail' }, // 14
  tr('Mumbai Metro', 'Mumbai Metro', 'Urban rail for Mumbai'), // 15
  prop(3, 0), // 16 Amritsar
  { k: 'khazana' }, // 17
  prop(3, 1), // 18 Lucknow
  prop(3, 2), // 19 Varanasi
  prop(4, 0), // 20 Agra
  { k: 'bhagya' }, // 21
  prop(4, 1), // 22 Udaipur
  prop(4, 2), // 23 Coimbatore
  { k: 'utility', name: 'Water Supply', short: 'Water Supply', sub: 'Jal for every home', icon: '💧' }, // 24
  prop(5, 0), // 25 Bhubaneswar
  prop(5, 1), // 26 Guwahati
  prop(5, 2), // 27 Vadodara
  { k: 'free' }, // 28
  tr('Delhi Metro', 'Delhi Metro', 'Connecting the capital'), // 29
  prop(6, 0), // 30 Mysuru
  { k: 'khazana' }, // 31
  prop(6, 1), // 32 Kochi
  prop(6, 2), // 33 Visakhapatnam
  prop(7, 0), // 34 Chandigarh
  { k: 'bhagya' }, // 35
  prop(7, 1), // 36 Surat
  prop(7, 2), // 37 Thiruvananthapuram
  { k: 'tax', name: 'GST Luxury Tax', amount: 1000 }, // 38
  prop(8, 0), // 39 Jaipur
  prop(8, 1), // 40 Goa
  prop(8, 2), // 41 Ahmedabad
  { k: 'gotojail' }, // 42
  tr('Bengaluru Metro', 'Bengaluru Metro', 'Namma Metro'), // 43
  prop(9, 0), // 44 Kolkata
  { k: 'khazana' }, // 45
  prop(9, 1), // 46 Noida
  prop(9, 2), // 47 Pune
  { k: 'utility', name: 'Internet & Telecom', short: 'Internet & Telecom', sub: 'Digital India', icon: '📡' }, // 48
  prop(10, 0), // 49 Gurugram
  prop(10, 1), // 50 Hyderabad
  prop(10, 2), // 51 Chennai
  tr('National Airways', 'National Airways', 'Skies across India'), // 52
  prop(11, 0), // 53 Bengaluru
  prop(11, 1), // 54 Delhi
  prop(11, 2), // 55 Mumbai
];

export function buildBoard(): BoardDef {
  const groups: Group[] = GROUPS.map((g, id) => ({ ...g, id, size: G[id].length }));
  const spaces: Space[] = LAYOUT.map((slot, id): Space => {
    switch (slot.k) {
      case 'go':
        return { id, kind: 'go', name: 'GO', short: 'GO', subtitle: 'Collect salary as you pass', icon: '🚩' };
      case 'jail':
        return { id, kind: 'jail', name: 'Jail / Just Visiting', short: 'Jail', subtitle: 'Tihar Corner', icon: '⛓️' };
      case 'free':
        return { id, kind: 'freeParking', name: 'Kumbh Rest Stop', short: 'Rest Stop', subtitle: 'Take a breather', icon: '🪔' };
      case 'gotojail':
        return { id, kind: 'goToJail', name: 'Go To Jail', short: 'Go To Jail', subtitle: 'Straight to jail', icon: '🚔' };
      case 'khazana':
        return { id, kind: 'khazana', name: 'Khazana', short: 'Khazana', subtitle: 'Draw a treasure card', icon: '🎁' };
      case 'bhagya':
        return { id, kind: 'bhagya', name: 'Bhagya', short: 'Bhagya', subtitle: 'Draw a fortune card', icon: '🎲' };
      case 'tax':
        return { id, kind: 'tax', name: slot.name, short: slot.name, amount: slot.amount, icon: '🧾' };
      case 'transport':
        return {
          id,
          kind: 'transport',
          name: slot.name,
          short: slot.short,
          subtitle: slot.sub,
          price: 2000,
          rents: TRANSPORT_RENTS,
          mortgage: 1000,
          icon: slot.name.includes('Airways') ? '✈️' : slot.name.includes('Metro') ? '🚇' : '🚆',
        };
      case 'utility':
        return { id, kind: 'utility', name: slot.name, short: slot.short, subtitle: slot.sub, price: 1500, mortgage: 750, icon: slot.icon };
      case 'prop': {
        const [name, short, sub, price] = G[slot.g][slot.i];
        return {
          id,
          kind: 'property',
          name,
          short,
          subtitle: sub,
          groupId: slot.g,
          price,
          rents: rentsFor(price, slot.g),
          houseCost: HOUSE_COST_BY_GROUP[slot.g],
          mortgage: price / 2,
        };
      }
    }
  });
  return {
    spaces,
    groups,
    jailIndex: JAIL_INDEX,
    goToJailIndex: GO_TO_JAIL_INDEX,
    jailFine: JAIL_FINE,
    mortgageInterestPct: MORTGAGE_INTEREST_PCT,
    utilityMultipliers: UTILITY_MULTIPLIERS,
  };
}

export const BOARD: BoardDef = buildBoard();
export const BOARD_SIZE = BOARD.spaces.length;
