import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('immersive 3D Lomé life completes navigation, shopping, meals and work on desktop and Android',async({page},testInfo)=>{
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto('/haroolife/territoire/lome',{waitUntil:'domcontentloaded'})
  const navigation=page.getByRole('navigation',{name:'Navigation du jeu'})
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole('button',{name:'Maison'})).toBeVisible()
  await expect(navigation.getByRole('button',{name:'Acheter'})).toBeVisible()
  await expect(navigation.getByRole('button',{name:'Carte'})).toBeVisible()
  await expect(navigation.getByRole('button',{name:'Téléphone'})).toBeVisible()
  const webgl2=await page.evaluate(()=>!!document.createElement('canvas').getContext('webgl2'))
  expect(webgl2,'Chromium QA must provide a true WebGL2 device').toBe(true)
  await expect(page.locator('canvas').first()).toBeVisible({timeout:30000})

  await navigation.getByRole('button',{name:'Carte'}).click()
  await expect(page.getByRole('dialog',{name:'Explorer Lomé'})).toBeVisible()
  await page.getByRole('button',{name:/Marché de quartier/}).click()
  // Automatic road movement must reach market without pressing +1 hour per tile.
  await expect.poll(async()=>{
    return page.evaluate(()=>{
      const save=localStorage.getItem('haroolife.lome-life.v1')
      return save?JSON.parse(save).route.length:99
    })
  },{timeout:15000}).toBe(0)
  await navigation.getByRole('button',{name:'Acheter'}).click()
  await expect(page.getByRole('dialog',{name:'Marché & commerces'})).toBeVisible()
  await page.getByRole('button',{name:/Acheter un repas · 650 FCFA/}).click()
  await page.getByRole('button',{name:/Manger ·/}).click()
  await page.getByRole('button',{name:'Fermer',exact:true}).click()

  await navigation.getByRole('button',{name:'Téléphone'}).click()
  await page.getByRole('button',{name:'Métiers'}).click()
  await page.getByRole('button',{name:'Faire mon service'}).click()
  await page.getByRole('button',{name:'Fermer',exact:true}).click()
  await page.getByRole('button',{name:'Voir mon argent'}).click()
  await expect.poll(async()=>page.evaluate(()=>{
    const save=localStorage.getItem('haroolife.lome-life.v1')
    return save?JSON.parse(save).wallet:0
  })).toBe(10750)
  await page.getByRole('button',{name:'Fermer',exact:true}).click()
  await navigation.getByRole('button',{name:'Maison'}).click()
  await page.getByRole('button',{name:'Entrer',exact:true}).click()
  await expect.poll(async()=>page.evaluate(()=>{
    const save=localStorage.getItem('haroolife.lome-life.v1')
    return save?JSON.parse(save).inside:null
  })).toBe('market')
  await expect(page.locator('canvas').first()).toBeVisible()
  await page.waitForTimeout(1200)
  const indoors=path.join('test-results','lome-visual',testInfo.project.name+'-interior.png')
  fs.mkdirSync(path.dirname(indoors),{recursive:true})
  await page.screenshot({path:indoors,fullPage:true})
  await navigation.getByRole('button',{name:'Maison'}).click()
  await page.getByRole('button',{name:'Sortir',exact:true}).click()

  await page.getByRole('button',{name:'Ouvrir les outils de construction'}).click()
  await expect(page.getByRole('dialog',{name:'Construire'})).toBeVisible()
  await page.getByRole('button',{name:/Maison.*85 FCFA/}).click()
  await expect(page.getByText(/Pose Maison en touchant un terrain/)).toBeVisible()
  // Return to free travel; selection is still connected to the existing construction engine.
  await page.getByRole('button',{name:'Terminer'}).click()

  await expect(page.locator('canvas').first()).toBeVisible()
  const screenshot=path.join('test-results','lome-visual',testInfo.project.name+'.png')
  fs.mkdirSync(path.dirname(screenshot),{recursive:true})
  await page.screenshot({path:screenshot,fullPage:true})
  expect(errors,'No uncaught client runtime errors').toEqual([])
})
