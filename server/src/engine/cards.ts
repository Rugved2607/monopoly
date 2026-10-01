import type { DeckName } from '../../../shared/types';

export type CardEffect =
  | { t: 'money'; amount: number }
  | { t: 'moveTo'; pos: number }
  | { t: 'moveBy'; n: number }
  | { t: 'nearest'; kind: 'transport' | 'utility' }
  | { t: 'jail' }
  | { t: 'jailFree' }
  | { t: 'collectAll'; amount: number }
  | { t: 'repairs'; house: number; hotel: number };

export interface CardDef {
  id: number;
  deck: DeckName;
  title: string;
  text: string;
  effect: CardEffect;
}

let nextId = 1;
const c = (deck: DeckName, title: string, text: string, effect: CardEffect): CardDef => ({
  id: nextId++,
  deck,
  title,
  text,
  effect,
});

/** Khazana: treasure deck (mostly money, like a community chest). */
const KHAZANA: CardDef[] = [
  c('khazana', 'Festival Bonus', 'You received a Diwali bonus. Collect ₹500.', { t: 'money', amount: 500 }),
  c('khazana', 'Startup Success', 'Your startup received funding. Collect ₹1,000.', { t: 'money', amount: 1000 }),
  c('khazana', 'Cricket Ticket Resale', 'You resold tickets for the final. Collect ₹200.', { t: 'money', amount: 200 }),
  c('khazana', 'Income Tax Refund', 'Your refund arrived early. Collect ₹200.', { t: 'money', amount: 200 }),
  c('khazana', 'Consultancy Fee', 'A client paid your invoice. Collect ₹250.', { t: 'money', amount: 250 }),
  c('khazana', 'Family Inheritance', 'An old family property was sold. Collect ₹1,000.', { t: 'money', amount: 1000 }),
  c('khazana', 'Bank Error in Your Favour', 'A sweep of dormant accounts pays you. Collect ₹2,000.', { t: 'money', amount: 2000 }),
  c('khazana', 'Hospital Fees', 'A family health scare. Pay ₹1,000.', { t: 'money', amount: -1000 }),
  c('khazana', 'School Fees', 'Term fees are due. Pay ₹500.', { t: 'money', amount: -500 }),
  c('khazana', 'Wedding Season', 'You are invited to every wedding. Collect ₹100 from each player as gifts.', { t: 'collectAll', amount: 100 }),
  c('khazana', 'Begin a New Financial Year', 'Advance to GO and collect your salary.', { t: 'moveTo', pos: 0 }),
  c('khazana', 'Chai with the Commissioner', 'A friendly chat sorts everything out. Keep this card to get out of jail free.', { t: 'jailFree' }),
  c('khazana', 'Caught Without a Ticket', 'Go directly to jail. Do not pass GO.', { t: 'jail' }),
  c('khazana', 'Monsoon Repairs', 'Heavy rain damaged your buildings. Pay ₹400 per house and ₹1,150 per hotel.', { t: 'repairs', house: 400, hotel: 1150 }),
  c('khazana', 'Doctor\u2019s Fee', 'Annual health check. Pay ₹500.', { t: 'money', amount: -500 }),
  c('khazana', 'Yoga Retreat Prize', 'You won a wellness contest. Collect ₹1,000.', { t: 'money', amount: 1000 }),
];

/** Bhagya: fortune deck (movement and swings, like chance). */
const BHAGYA: CardDef[] = [
  c('bhagya', 'Mumbai Traffic Jam', 'You were stuck in traffic for hours. Pay ₹300.', { t: 'money', amount: -300 }),
  c('bhagya', 'Expressway Toll', 'Pay ₹200 for highway tolls.', { t: 'money', amount: -200 }),
  c('bhagya', 'Advance to GO', 'Collect your salary.', { t: 'moveTo', pos: 0 }),
  c('bhagya', 'City of Dreams', 'Advance to Mumbai. If you pass GO, collect your salary.', { t: 'moveTo', pos: 55 }),
  c('bhagya', 'Tech Hub Transfer', 'Advance to Pune. If you pass GO, collect your salary.', { t: 'moveTo', pos: 47 }),
  c('bhagya', 'Metro Ride', 'Take the Mumbai Metro. If you pass GO, collect your salary.', { t: 'moveTo', pos: 15 }),
  c('bhagya', 'Nearest Transit Hub', 'Advance to the nearest transport hub. If owned, pay the owner double rent.', { t: 'nearest', kind: 'transport' }),
  c('bhagya', 'Nearest Transit Hub', 'Advance to the nearest transport hub. If owned, pay the owner double rent.', { t: 'nearest', kind: 'transport' }),
  c('bhagya', 'Power Cut', 'Advance to the nearest utility. If owned, roll again and pay the owner 10× the dice.', { t: 'nearest', kind: 'utility' }),
  c('bhagya', 'Highway Diversion', 'A diversion sends you back 3 spaces.', { t: 'moveBy', n: -3 }),
  c('bhagya', 'Raided by the Taxman', 'Go directly to jail. Do not pass GO.', { t: 'jail' }),
  c('bhagya', 'Chai with the Commissioner', 'Keep this card to get out of jail free.', { t: 'jailFree' }),
  c('bhagya', 'Dividend Day', 'The bank pays you a dividend of ₹500.', { t: 'money', amount: 500 }),
  c('bhagya', 'Fixed Deposit Matures', 'Your fixed deposit matured. Collect ₹1,500.', { t: 'money', amount: 1500 }),
  c('bhagya', 'Municipal Property Tax', 'Pay ₹250 per house and ₹1,000 per hotel.', { t: 'repairs', house: 250, hotel: 1000 }),
  c('bhagya', 'Speeding Challan', 'Pay ₹150.', { t: 'money', amount: -150 }),
  c('bhagya', 'Cricket World Cup Win', 'Your fantasy team won big. Collect ₹500.', { t: 'money', amount: 500 }),
];

export const CARDS: CardDef[] = [...KHAZANA, ...BHAGYA];
export const CARD_BY_ID = new Map(CARDS.map((x) => [x.id, x]));
export const DECK_IDS: Record<DeckName, number[]> = {
  khazana: KHAZANA.map((x) => x.id),
  bhagya: BHAGYA.map((x) => x.id),
};
