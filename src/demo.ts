import { update, uid, type Guest, type Table, type Constraint, type Diet } from './model'

const G = (
  name: string,
  group?: string,
  diet: Diet = 'none',
  accessibility = false
): Guest => ({ id: uid('g'), name, group, diet, accessibility, tableId: null })

export function seedDemo() {
  const guests: Guest[] = [
    G('Deniz', 'couple'),
    G('Mia', 'couple'),
    G('Aunt Feride', 'deniz family', 'vegetarian'),
    G('Uncle Cem', 'deniz family'),
    G('Grandma Leyla', 'deniz family', 'none', true),
    G('Kerem', 'deniz family'),
    G('Zeynep', 'deniz family', 'gluten-free'),
    G('Robert', 'mia family'),
    G('Susan', 'mia family', 'vegan'),
    G('Grandpa Joe', 'mia family', 'none', true),
    G('Emily', 'mia family'),
    G('Jack', 'mia family'),
    G('Arda', 'college friends'),
    G('Selin', 'college friends', 'vegetarian'),
    G('Tomas', 'college friends'),
    G('Nadia', 'college friends', 'halal'),
    G('Chris', 'work friends'),
    G('Priya', 'work friends', 'vegetarian'),
    G('Marco', 'work friends'),
    G('Yuki', 'work friends'),
    G('Ex-colleague Dave', 'work friends'),
    G('Aunt Nuran', 'deniz family'),
    G('Cousin Bora', 'deniz family'),
    G('Lena', 'mia family', 'gluten-free'),
  ]

  const T = (label: string, capacity: number, x: number, y: number, accessible = false): Table => ({
    id: uid('t'),
    label,
    shape: 'round',
    capacity,
    x,
    y,
    accessible,
  })

  const tables: Table[] = [
    T('Head Table', 4, 430, 60, true),
    T('Table 1', 8, 160, 300),
    T('Table 2', 8, 460, 300, true),
    T('Table 3', 8, 760, 300),
    T('Table 4', 6, 300, 560),
    T('Table 5', 6, 620, 560),
  ]

  const byName = (n: string) => guests.find((g) => g.name === n)!.id
  const constraints: Constraint[] = [
    { id: uid('c'), kind: 'apart', a: byName('Uncle Cem'), b: byName('Robert'), note: 'old business dispute' },
    { id: uid('c'), kind: 'apart', a: byName('Ex-colleague Dave'), b: byName('Priya'), note: 'awkward history' },
    { id: uid('c'), kind: 'together', a: byName('Grandma Leyla'), b: byName('Aunt Feride') },
    { id: uid('c'), kind: 'together', a: byName('Deniz'), b: byName('Mia') },
    { id: uid('c'), kind: 'together', a: byName('Grandpa Joe'), b: byName('Susan') },
  ]

  update(
    (s) => ({ ...s, guests, tables, constraints }),
    { actor: 'human', describe: 'loaded sample event (24 guests, 6 tables, 5 constraints)' }
  )
}
