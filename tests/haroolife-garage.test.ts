import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  OWN_VEHICLES,
  buyOwnVehicle,
  decodeGarage,
  garageOf,
  resellOwnVehicle,
  vehicleOut,
} from '../lib/haroolife/city/garage'
import { restoreServiceVehicle } from '../lib/haroolife/city/jobs'
import { type CityLife, decodeCityLife, initialCityLife } from '../lib/haroolife/city/life'

const rich = (wallet: number): CityLife => {
  const s = initialCityLife()
  return { ...s, life: { ...s.life, wallet } }
}
const price = (id: string) => OWN_VEHICLES.find((v) => v.id === id)?.price ?? 0

test('les prix des motos et voitures sont ceux de Lomé (ordres de grandeur)', () => {
  assert.ok(price('moto-neuve') >= 500_000 && price('moto-neuve') <= 900_000)
  assert.ok(price('voiture-occasion') >= 1_500_000 && price('voiture-occasion') <= 4_000_000)
  assert.ok(price('voiture-recente') >= 6_000_000)
  assert.ok(price('moto-occasion') < price('moto-neuve'))
})

test('acheter sa moto : débité, une seule fois, pas sans l’argent', () => {
  const s = buyOwnVehicle(rich(1_000_000), 'moto-neuve')
  assert.equal(s.life.wallet, 1_000_000 - price('moto-neuve'))
  assert.deepEqual(garageOf(s), { owned: ['moto-neuve'], out: null })
  assert.equal(buyOwnVehicle(s, 'moto-neuve').life.wallet, s.life.wallet)
  assert.equal(buyOwnVehicle(rich(100_000), 'moto-neuve').garage, undefined)
  assert.equal(buyOwnVehicle(rich(10_000_000), 'avion').garage, undefined)
})

test('le véhicule personnel dans la rue, jamais confondu avec celui du métier', () => {
  const s = buyOwnVehicle(rich(10_000_000), 'voiture-occasion')
  const out: CityLife = { ...s, garage: { ...garageOf(s), out: 'voiture-occasion' } }
  assert.equal(vehicleOut(out)?.kind, 'car')
  assert.equal(vehicleOut({ ...out, duty: 'taxi' }), undefined)
})

test('revendre : 60 % du prix, le véhicule sorti quitte la rue', () => {
  let s = buyOwnVehicle(rich(10_000_000), 'voiture-occasion')
  s = {
    ...s,
    garage: { ...garageOf(s), out: 'voiture-occasion' },
    vehicle: { x: 1, z: 2, heading: 0 },
  }
  const before = s.life.wallet
  s = resellOwnVehicle(s, 'voiture-occasion')
  assert.equal(s.life.wallet, before + 1_680_000)
  assert.deepEqual(garageOf(s), { owned: [], out: null })
  assert.equal(s.vehicle, null)
})

test('sauvegarde : le garage revient, une sauvegarde trafiquée est nettoyée', () => {
  const s = buyOwnVehicle(rich(10_000_000), 'moto-neuve')
  assert.deepEqual(decodeCityLife(JSON.parse(JSON.stringify(s)))?.garage, s.garage)
  assert.deepEqual(
    decodeGarage({ owned: ['moto-neuve', 'moto-neuve', 'fusee', 3], out: 'fusee' }),
    {
      owned: ['moto-neuve'],
      out: null,
    },
  )
  assert.equal(decodeGarage(null), undefined)
})

test('au chargement, le véhicule personnel sorti est regaré sur une route', () => {
  const s = buyOwnVehicle(rich(10_000_000), 'moto-neuve')
  const out: CityLife = {
    ...s,
    garage: { ...garageOf(s), out: 'moto-neuve' },
    vehicle: { x: -999, z: -999, heading: 0 },
  }
  const restored = restoreServiceVehicle(out)
  assert.notDeepEqual(restored.vehicle, out.vehicle)
  // Rien ne bouge pour qui n'a ni métier ni véhicule sorti.
  assert.equal(restoreServiceVehicle(s), s)
})
