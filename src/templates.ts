// Scenario templates. The engine is domain-agnostic — people, capacity-bounded
// places, and relationship constraints — so Duet ships with four very different
// rooms to plan. Each template seeds guests, tables, constraints, and vocabulary.

import { update, uid, type Guest, type Table, type Constraint, type Diet, type Vocab, type GroupRule } from './model'

interface Seed {
  name: string
  vocab: Vocab
  guests: Guest[]
  tables: Table[]
  constraints: Constraint[]
  groupRules?: GroupRule[]
}

export interface Template {
  id: string
  title: string
  icon: string
  blurb: string
  build: () => Seed
}

const G = (name: string, group?: string, diet: Diet = 'none', accessibility = false): Guest => ({
  id: uid('g'),
  name,
  group,
  diet,
  accessibility,
  tableId: null,
})

const T = (label: string, capacity: number, x: number, y: number, accessible = false): Table => ({
  id: uid('t'),
  label,
  shape: 'round',
  capacity,
  x,
  y,
  accessible,
})

function C(guests: Guest[], kind: 'together' | 'apart', a: string, b: string, note?: string): Constraint {
  const find = (n: string) => guests.find((g) => g.name === n)!.id
  return { id: uid('c'), kind, a: find(a), b: find(b), note }
}

function grid(labels: string[], capacity: number, cols: number, accessibleEvery = 4): Table[] {
  return labels.map((label, i) =>
    T(label, capacity, 260 + (i % cols) * 320, 200 + Math.floor(i / cols) * 300, i % accessibleEvery === 0)
  )
}

// ---------------------------------------------------------------- wedding

function wedding(): Seed {
  const guests = [
    G('Deniz', 'couple'),
    G('Mia', 'couple'),
    G('Aunt Feride', "deniz's family", 'vegetarian'),
    G('Uncle Cem', "deniz's family"),
    G('Grandma Leyla', "deniz's family", 'none', true),
    G('Kerem', "deniz's family"),
    G('Zeynep', "deniz's family", 'gluten-free'),
    G('Aunt Nuran', "deniz's family"),
    G('Cousin Bora', "deniz's family"),
    G('Robert', "mia's family"),
    G('Susan', "mia's family", 'vegan'),
    G('Grandpa Joe', "mia's family", 'none', true),
    G('Emily', "mia's family"),
    G('Jack', "mia's family"),
    G('Lena', "mia's family", 'gluten-free'),
    G('Arda', 'college friends'),
    G('Selin', 'college friends', 'vegetarian'),
    G('Tomas', 'college friends'),
    G('Nadia', 'college friends', 'halal'),
    G('Chris', 'work friends'),
    G('Priya', 'work friends', 'vegetarian'),
    G('Marco', 'work friends'),
    G('Yuki', 'work friends'),
    G('Ex-colleague Dave', 'work friends'),
  ]
  const tables = [
    T('Head Table', 4, 560, 160, true),
    T('Table 1', 8, 260, 440),
    T('Table 2', 8, 580, 440, true),
    T('Table 3', 8, 900, 440),
    T('Table 4', 6, 400, 730),
    T('Table 5', 6, 740, 730),
  ]
  const constraints = [
    C(guests, 'apart', 'Uncle Cem', 'Robert', 'old business dispute'),
    C(guests, 'apart', 'Ex-colleague Dave', 'Priya', 'awkward history'),
    C(guests, 'apart', 'Aunt Nuran', 'Uncle Cem', 'divorced in 2019 — do not seat together'),
    C(guests, 'apart', 'Selin', 'Emily', "haven't spoken since the bachelorette"),
    C(guests, 'apart', 'Kerem', 'Cousin Bora', 'inheritance feud'),
    C(guests, 'together', 'Grandma Leyla', 'Aunt Feride'),
    C(guests, 'together', 'Deniz', 'Mia'),
    C(guests, 'together', 'Grandpa Joe', 'Susan'),
    C(guests, 'together', 'Arda', 'Nadia', 'engaged'),
  ]
  return {
    name: 'Deniz & Mia — Wedding Reception',
    vocab: { person: 'Guest', people: 'Guests', container: 'Table', containers: 'Tables' },
    guests,
    tables,
    constraints,
  }
}

// ---------------------------------------------------------------- gala (120)

const FIRST = 'Ada Bruno Carla Dmitri Elif Farid Greta Hiro Ines Jonas Katja Liam Mona Nils Omar Petra Quinn Rosa Stefan Tara Umut Vera Wale Xenia Yara Zied Alba Boris Chiara Dara Emre Freya'.split(' ')
const LAST = 'Alver Brandt Costa Demir Eriksen Fontaine Grimaldi Hansen Ilic Jansen Kaya Lindqvist Moretti Novak Okafor Petrov Quirke Rossi Sato Tanaka Ueda Vidal Weiss Xu Yilmaz Zhang Ahmed Berg Conti Duran'.split(' ')

function gala(): Seed {
  const groups: [string, number][] = [
    ['platinum donors', 14],
    ['gold donors', 18],
    ['board', 10],
    ['host committee', 12],
    ['corporate partners', 20],
    ['artists', 12],
    ['press', 8],
    ['city officials', 8],
    ['volunteers & staff', 18],
  ]
  const diets: Diet[] = ['none', 'none', 'none', 'none', 'vegetarian', 'none', 'vegan', 'none', 'gluten-free', 'halal']
  const guests: Guest[] = []
  let i = 0
  for (const [group, n] of groups) {
    for (let k = 0; k < n; k++) {
      const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + k) % LAST.length]}`
      guests.push(G(name, group, diets[i % diets.length], i % 23 === 0))
      i++
    }
  }
  // 128 seats for 120 guests — real rooms keep slack, and it lets the solver maneuver
  const tables = grid(
    Array.from({ length: 16 }, (_, k) => `Table ${k + 1}`),
    8,
    4,
    5
  )
  const byGroup = (g: string) => guests.filter((x) => x.group === g)
  const constraints: Constraint[] = [
    // each platinum donor pair gets a host-committee anchor
    ...byGroup('platinum donors')
      .slice(0, 6)
      .map((d, k) => ({
        id: uid('c'),
        kind: 'together' as const,
        a: d.id,
        b: byGroup('host committee')[k].id,
        note: 'donor hosted by committee member',
      })),
    // press away from board chair & city officials
    { id: uid('c'), kind: 'apart', a: byGroup('press')[0].id, b: byGroup('board')[0].id, note: 'no interviews at dinner' },
    { id: uid('c'), kind: 'apart', a: byGroup('press')[1].id, b: byGroup('city officials')[0].id, note: 'no interviews at dinner' },
    // two rival corporate partners
    { id: uid('c'), kind: 'apart', a: byGroup('corporate partners')[0].id, b: byGroup('corporate partners')[1].id, note: 'competing sponsors' },
  ]
  return {
    name: 'Aurora Foundation — Annual Fundraising Gala',
    vocab: { person: 'Guest', people: 'Guests', container: 'Table', containers: 'Tables' },
    guests,
    tables,
    constraints,
  }
}

// ---------------------------------------------------------------- office

function office(): Seed {
  const teams: [string, string[]][] = [
    ['engineering', ['Maya', 'Deniz K.', 'Piotr', 'Hana', 'Louis', 'Sena', 'Viktor', 'Ana']],
    ['design', ['Noor', 'Felix', 'Iris', 'Kenji']],
    ['sales', ['Tom', 'Aylin', 'Marcus', 'Sofia', 'Ben']],
    ['support', ['Rita', 'Jonasz', 'Meltem', 'Paul']],
    ['people ops', ['Clara', 'Efe']],
  ]
  const guests: Guest[] = []
  for (const [team, names] of teams) for (const n of names) guests.push(G(n, team))
  guests.find((g) => g.name === 'Rita')!.accessibility = true
  const tables = [
    T('Window Row', 6, 260, 200, true),
    T('Quiet Zone', 4, 580, 200),
    T('Collab Pod A', 6, 900, 200),
    T('Collab Pod B', 6, 340, 500),
    T('Phone-heavy Row', 5, 660, 500, true),
    T('Overflow', 4, 940, 500),
  ]
  const find = (n: string) => guests.find((g) => g.name === n)!.id
  const constraints: Constraint[] = [
    { id: uid('c'), kind: 'apart', a: find('Tom'), b: find('Maya'), note: 'sales calls disturb deep work' },
    { id: uid('c'), kind: 'apart', a: find('Marcus'), b: find('Piotr'), note: 'sales calls disturb deep work' },
    { id: uid('c'), kind: 'together', a: find('Noor'), b: find('Maya'), note: 'design–eng pairing on checkout flow' },
    { id: uid('c'), kind: 'together', a: find('Clara'), b: find('Efe') },
    { id: uid('c'), kind: 'together', a: find('Sena'), b: find('Viktor'), note: 'mentor & new hire' },
  ]
  return {
    name: 'Q4 Office Seating — 5th Floor',
    vocab: { person: 'Employee', people: 'Employees', container: 'Zone', containers: 'Zones' },
    guests,
    tables,
    constraints,
  }
}

// ---------------------------------------------------------------- corporate dinner

function corporate(): Seed {
  const companies: [string, string[]][] = [
    ['Vega Capital (hosts)', ['Leyla Vega', 'Mark Osei', 'Tina Larsson', 'Deniz Aksoy', 'Pablo Ruiz', 'Amara Chen']],
    ['Acme Robotics', ['Jon Hart', 'Mira Solak', 'Peter Vann', 'Lucy Kim', 'Omar Diallo']],
    ['Globex Energy', ['Rana Aziz', 'Tom Becker', 'Iris Novak', 'Sam Ortiz', 'Wei Zhang']],
    ['Initech Software', ['Bill Lum', 'Dana Cruz', 'Eren Polat', 'Faye Wong']],
    ['Umbrella Health', ['Ada Reyes', 'Karl Jensen', 'Nina Petit', 'Oscar Blom']],
    ['Stark Materials', ['Vera Holt', 'Yusuf Kaya', 'Zoe Marsh', 'Hugo Lind']],
  ]
  const guests: Guest[] = []
  for (const [company, names] of companies) for (const n of names) guests.push(G(n, company))
  guests.find((g) => g.name === 'Rana Aziz')!.diet = 'halal'
  guests.find((g) => g.name === 'Iris Novak')!.diet = 'vegetarian'
  guests.find((g) => g.name === 'Faye Wong')!.diet = 'vegan'
  guests.find((g) => g.name === 'Karl Jensen')!.accessibility = true

  const tables = grid(['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6'], 6, 3, 2)
  // one host anchors each table — pre-seated and pinned, like a real seating protocol
  const hosts = guests.filter((g) => g.group === 'Vega Capital (hosts)')
  hosts.forEach((h, i) => {
    h.tableId = tables[i].id
    h.pinned = true
  })

  const find = (n: string) => guests.find((g) => g.name === n)!.id
  const constraints: Constraint[] = [
    { id: uid('c'), kind: 'apart', a: find('Jon Hart'), b: find('Rana Aziz'), note: 'competing for the same contract' },
    { id: uid('c'), kind: 'apart', a: find('Bill Lum'), b: find('Vera Holt'), note: 'ongoing lawsuit' },
    { id: uid('c'), kind: 'together', a: find('Mira Solak'), b: find('Dana Cruz'), note: 'want an intro — potential partnership' },
    { id: uid('c'), kind: 'together', a: find('Wei Zhang'), b: find('Nina Petit'), note: 'asked to meet about the pilot' },
  ]
  const groupRules: GroupRule[] = [
    { group: 'Vega Capital (hosts)', mode: 'spread', maxPerTable: 1 },
    { group: 'Acme Robotics', mode: 'spread', maxPerTable: 2 },
    { group: 'Globex Energy', mode: 'spread', maxPerTable: 2 },
    { group: 'Initech Software', mode: 'spread', maxPerTable: 2 },
    { group: 'Umbrella Health', mode: 'spread', maxPerTable: 2 },
    { group: 'Stark Materials', mode: 'spread', maxPerTable: 2 },
  ]
  return {
    name: 'Vega Capital — Partner Networking Dinner',
    vocab: { person: 'Guest', people: 'Guests', container: 'Table', containers: 'Tables' },
    guests,
    tables,
    constraints,
    groupRules,
  }
}

// ---------------------------------------------------------------- classroom

function classroom(): Seed {
  const names =
    'Alex Bea Can Dara Eda Finn Gül Hugo Ida Jan Kira Leo Mert Nil Otto Pia Rui Sam Tuna Uma Vito Wren Yagmur Zoe Aras Bel Cem Dot'.split(' ')
  const guests = names.map((n, i) => G(n, ['red', 'blue', 'green', 'yellow'][i % 4] + ' reading group'))
  guests.find((g) => g.name === 'Ida')!.accessibility = true
  const tables = grid(
    ['Pod 1', 'Pod 2', 'Pod 3', 'Pod 4', 'Pod 5', 'Pod 6', 'Pod 7'],
    4,
    4,
    3
  )
  const find = (n: string) => guests.find((g) => g.name === n)!.id
  const constraints: Constraint[] = [
    { id: uid('c'), kind: 'apart', a: find('Can'), b: find('Leo'), note: 'chat nonstop' },
    { id: uid('c'), kind: 'apart', a: find('Finn'), b: find('Otto'), note: 'chat nonstop' },
    { id: uid('c'), kind: 'apart', a: find('Kira'), b: find('Zoe'), note: 'recent falling-out' },
    { id: uid('c'), kind: 'together', a: find('Ida'), b: find('Bea'), note: 'peer support buddy' },
  ]
  return {
    name: 'Class 6-B — Seating Plan',
    vocab: { person: 'Student', people: 'Students', container: 'Pod', containers: 'Pods' },
    guests,
    tables,
    constraints,
  }
}

// ---------------------------------------------------------------- registry

export const TEMPLATES: Template[] = [
  {
    id: 'wedding',
    title: 'Wedding reception',
    icon: '💍',
    blurb: '24 guests, feuding relatives, dietary needs, a head table.',
    build: wedding,
  },
  {
    id: 'gala',
    title: 'Fundraising gala',
    icon: '🥂',
    blurb: '120 guests, 15 tables, donors to host, press to manage.',
    build: gala,
  },
  {
    id: 'corporate',
    title: 'Corporate dinner',
    icon: '🤝',
    blurb: '6 companies, mixed for networking, a host at every table.',
    build: corporate,
  },
  {
    id: 'office',
    title: 'Office seating',
    icon: '🏢',
    blurb: '23 employees, quiet zones vs sales calls, team adjacency.',
    build: office,
  },
  {
    id: 'classroom',
    title: 'Classroom',
    icon: '🎓',
    blurb: '28 students, reading groups, chatty pairs to separate.',
    build: classroom,
  },
]

export function loadTemplate(id: string, actor: 'human' | 'agent' = 'human'): string | null {
  const t = TEMPLATES.find((t) => t.id === id)
  if (!t) return null
  const seed = t.build()
  update(
    (s) => ({
      ...s,
      event: { name: seed.name, template: t.id, vocab: seed.vocab },
      guests: seed.guests,
      tables: seed.tables,
      constraints: seed.constraints,
      groupRules: seed.groupRules ?? [],
      proposal: null,
      selection: null,
    }),
    {
      actor,
      describe: `loaded "${t.title}" (${seed.guests.length} ${seed.vocab.people.toLowerCase()}, ${seed.tables.length} ${seed.vocab.containers.toLowerCase()}, ${seed.constraints.length} constraints)`,
    }
  )
  return seed.name
}
