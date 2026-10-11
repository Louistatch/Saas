import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('Lomé Life renders and completes a market/needs cycle on desktop and Android viewport',async({page},testInfo)=>{
  const errors:string[]=[]
  page.on('pageerror',(error)=>errors.push(error.message))
  await page.goto('/haroolife/territoire/lome',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:/LOMÉ LIFE/i})).toBeVisible()
  await expect(page.getByText('Quartier de Lomé')).toBeVisible()
  await expect(page.getByRole('button',{name:'Se déplacer'})).toBeVisible()
  await expect(page.getByText('Mon argent')).toBeVisible()
  await expect(page.getByRole('button',{name:/Marché de quartier/i})).toBeVisible()
  await page.getByRole('button',{name:/Marché de quartier/i}).click()
  await expect(page.getByText(/Trajet commencé/i).first()).toBeVisible()
  await page.getByRole('button',{name:'+1 h'}).click()
  await page.getByRole('button',{name:/Acheter un repas/i}).click()
  await expect(page.getByText(/Un repas acheté/i).first()).toBeVisible()
  await page.getByRole('button',{name:'Manger',exact:true}).click()
  await expect(page.getByText(/Tu as mangé/i).first()).toBeVisible()
  await page.getByRole('button',{name:/Faire mon service/i}).click()
  await expect(page.getByText(/Service terminé/i).first()).toBeVisible()
  // If WebGL2 works in this environment, verify actual PlayCanvas canvas (not a 2D placeholder).
  const webgl2 = await page.evaluate(()=>{
    try{return !!document.createElement('canvas').getContext('webgl2')}catch{return false}
  })
  expect(webgl2,'Software WebGL2 is required in Chromium QA').toBeTruthy()
  await expect(page.locator('canvas').first()).toBeVisible({timeout:30000})
  await page.waitForTimeout(1600)
  const dest=path.join('test-results','lome-visual',testInfo.project.name+'.png')
  fs.mkdirSync(path.dirname(dest),{recursive:true})
  await page.screenshot({path:dest,fullPage:true})
  expect(errors,'No uncaught errors during game loop').toEqual([])
})
