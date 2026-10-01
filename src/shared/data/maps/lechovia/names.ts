import type { Rng } from '../../../math/rng.ts';

/** Lechovia's cities have curated fictional names (spec §12.3). */
export const CITY_NAMES = ['Lechów', 'Morzysko', 'Odrzyn', 'Skalnik', 'Pojezierz'] as const;

/**
 * Real major cities (Poland and its neighbours) that a generated name must never match, folded to plain ASCII lower
 * case (spec §12.3: places are fictional).
 */
export const REAL_CITIES: ReadonlySet<string> = new Set(
  [
    'warszawa', 'warsaw', 'krakow', 'cracow', 'lodz', 'wroclaw', 'poznan', 'gdansk', 'szczecin', 'bydgoszcz', 'lublin',
    'bialystok', 'katowice', 'gdynia', 'czestochowa', 'radom', 'torun', 'sosnowiec', 'rzeszow', 'kielce', 'gliwice',
    'olsztyn', 'zabrze', 'bielsko-biala', 'bytom', 'zielona gora', 'rybnik', 'ruda slaska', 'opole', 'tychy',
    'gorzow wielkopolski', 'elblag', 'plock', 'walbrzych', 'wloclawek', 'tarnow', 'chorzow', 'koszalin', 'kalisz',
    'legnica', 'grudziadz', 'slupsk', 'jaworzno', 'jastrzebie-zdroj', 'nowy sacz', 'jelenia gora', 'siedlce',
    'myslowice', 'konin', 'pila', 'piotrkow trybunalski', 'inowroclaw', 'lubin', 'ostrow wielkopolski', 'suwalki',
    'stargard', 'gniezno', 'pruszkow', 'ostrowiec swietokrzyski', 'siemianowice slaskie', 'glogow', 'leszno', 'zamosc',
    'lomza', 'chelm', 'przemysl', 'stalowa wola', 'tomaszow mazowiecki', 'kedzierzyn-kozle', 'mielec', 'zgierz',
    'tczew', 'pabianice', 'swidnica', 'bedzin', 'biala podlaska', 'raciborz', 'elk', 'pulawy', 'krosno',
    'starachowice', 'ostroleka', 'wejherowo', 'zawiercie', 'skierniewice', 'starogard gdanski', 'rumia', 'kutno',
    'zory', 'ciechanow', 'sopot', 'malbork', 'zakopane', 'gorlice', 'sanok', 'augustow', 'giżycko', 'gizycko',
    'mragowo', 'hel', 'leba', 'kolobrzeg', 'swinoujscie', 'berlin', 'dresden', 'leipzig', 'hamburg', 'praha', 'prague',
    'brno', 'ostrava', 'wien', 'vienna', 'bratislava', 'kosice', 'budapest', 'lviv', 'lwow', 'kyiv', 'kiev', 'minsk',
    'brest', 'grodno', 'hrodna', 'vilnius', 'wilno', 'kaunas', 'riga', 'kaliningrad', 'krolewiec', 'moskva', 'moscow',
  ].map(foldName),
);

/** Lower case, Polish letters folded to ASCII, so "Łódź" matches "lodz". */
export function foldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Stems that end in a consonant, and endings in the manner of Polish place names. Only ó of the Polish letters, so
// every font can draw them.
const STEMS = [
  'Bor', 'Brzez', 'Bial', 'Chob', 'Dab', 'Dobr', 'Gor', 'Grab', 'Jab', 'Kam', 'Klon', 'Krom', 'Lip', 'Lub', 'Mal',
  'Mied', 'Niw', 'Ol', 'Piask', 'Pol', 'Rad', 'Ros', 'Siedl', 'Skor', 'Star', 'Strug', 'Szczyt', 'Tarn', 'Wil', 'Wol',
  'Zab', 'Ziel', 'Kos', 'Mok', 'Wierzb', 'Jaw', 'Lesz', 'Mil', 'Brod', 'Czarn', 'Glin', 'Krzyw', 'Sad', 'Was', 'Brzoz',
  'Gaj', 'Lesn', 'Bukow', 'Jodl', 'Kal',
];
/** Endings that start with a vowel follow a stem directly. */
const VOWEL_ENDS = ['owo', 'ice', 'ów', 'in', 'any', 'ewo', 'isko', 'owice', 'yn', 'owa', 'iec', 'ewice', 'ek', 'ówka', 'ina', 'ary', 'owiec'];
/** Endings that start with a consonant follow a linking vowel. */
const CONSONANT_ENDS = ['no', 'nik', 'ka', 'wola', 'sko', 'wice', 'lin', 'szyn'];
const LINKS = ['o', 'a', 'e'];

/** A fictional village name, unique among `taken` (folded names) and never a real major city. */
export function villageName(rng: Rng, taken: Set<string>): string {
  for (;;) {
    const stem = STEMS[rng.int(STEMS.length)];
    const name =
      rng.next() < 0.75
        ? stem + VOWEL_ENDS[rng.int(VOWEL_ENDS.length)]
        : stem + LINKS[rng.int(LINKS.length)] + CONSONANT_ENDS[rng.int(CONSONANT_ENDS.length)];
    const folded = foldName(name);
    if (taken.has(folded) || REAL_CITIES.has(folded)) continue;
    taken.add(folded);
    return name;
  }
}
