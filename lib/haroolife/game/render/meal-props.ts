import * as THREE from 'three'

/** Actual 3D bowl, rice and spoon attached to the existing rig's hands. Instance-owned. */
export function createMealProps(figure: THREE.Object3D) {
  const left = figure.getObjectByName('WristL')
  const right = figure.getObjectByName('WristR')
  const bowl = new THREE.Group()
  bowl.name = 'Repas · bol et ayimolou'
  const spoon = new THREE.Group()
  spoon.name = 'Repas · cuillère'
  const owned: THREE.Mesh[] = []
  const mesh = (geometry: THREE.BufferGeometry, color: string, parent: THREE.Group) => {
    const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }))
    parent.add(m)
    owned.push(m)
    return m
  }
  const shell = mesh(
    new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    '#f0dfb1',
    bowl,
  )
  shell.scale.y = 0.65
  const food = mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.02, 16), '#e9bf64', bowl)
  food.position.y = -0.01
  for (let i = 0; i < 9; i++) {
    const bean = mesh(new THREE.SphereGeometry(0.012, 5, 4), '#73452d', bowl)
    bean.position.set(Math.cos(i * 2.4) * 0.07 * (i % 2 ? 0.6 : 1), 0.006, Math.sin(i * 2.4) * 0.07)
  }
  const handle = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 6), '#c4d0d7', spoon)
  handle.rotation.x = Math.PI / 2
  handle.position.z = 0.06
  const tip = mesh(new THREE.SphereGeometry(0.025, 8, 5), '#c4d0d7', spoon)
  tip.scale.set(0.7, 0.25, 1)
  tip.position.z = 0.14
  // A phone for the toilet (scrolling WhatsApp), screen lit.
  const phone = new THREE.Group()
  phone.name = 'Téléphone'
  mesh(new THREE.BoxGeometry(0.075, 0.012, 0.15), '#1d2329', phone)
  const screen = mesh(new THREE.PlaneGeometry(0.066, 0.135), '#9fd4ff', phone)
  screen.rotation.x = -Math.PI / 2
  screen.position.y = 0.0065
  ;(screen.material as THREE.MeshStandardMaterial).emissive.set('#5aa9e6')
  phone.position.set(-0.04, 0.02, 0.05)
  left?.add(bowl)
  right?.add(spoon)
  right?.add(phone)
  bowl.visible = false
  spoon.visible = false
  phone.visible = false
  return {
    show(visible: boolean) {
      bowl.visible = visible
      spoon.visible = visible
      if (!visible) return
      // Keep the bowl upright in world space while it follows the hand's real translation.
      left?.updateWorldMatrix(true, false)
      if (left) bowl.quaternion.copy(left.getWorldQuaternion(new THREE.Quaternion()).invert())
    },
    phone(visible: boolean) {
      phone.visible = visible
      if (!visible) return
      // Screen up, towards the lowered face: level in world space like the bowl.
      right?.updateWorldMatrix(true, false)
      if (right) phone.quaternion.copy(right.getWorldQuaternion(new THREE.Quaternion()).invert())
    },
    dispose() {
      phone.removeFromParent()
      bowl.removeFromParent()
      spoon.removeFromParent()
      for (const m of owned) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    },
  }
}
