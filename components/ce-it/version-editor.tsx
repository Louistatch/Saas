'use client'

import { useState } from 'react'
import { button, field } from './api'
import { DataForm } from './form'

export default function VersionEditor({
  product,
  onSaved,
}: { product: string; onSaved: () => void }) {
  const [costs, setCosts] = useState([0])
  const [steps, setSteps] = useState([0])
  const [sources, setSources] = useState([0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(form: FormData) {
    setBusy(true)
    setError('')
    const text = (key: string) => String(form.get(key) ?? '')
    const num = (key: string) => Number(form.get(key))
    const data = {
      context: text('context'),
      areaHa: num('area'),
      costs: costs.map((i) => ({
        id: `charge-${i}`,
        label: text(`label-${i}`),
        category: text(`category-${i}`),
        quantity: num(`quantity-${i}`),
        unitPrice: num(`price-${i}`),
        scaling: text(`scale-${i}`),
      })),
      scenarios: [
        {
          id: 'central',
          label: 'Scénario de référence',
          yieldTonnesPerHa: num('yield'),
          salePricePerTonne: num('sale') * 1000,
          lossRatePercent: num('loss'),
        },
      ],
      itinerary: steps.map((i) => ({
        dayStart: num(`start-${i}`),
        dayEnd: num(`end-${i}`),
        operation: text(`operation-${i}`),
        instructions: text(`instructions-${i}`),
        precautions: text(`precautions-${i}`),
      })),
      sources: sources.map((i) => ({
        title: text(`source-${i}`),
        url: text(`url-${i}`),
        rights: text(`rights-${i}`),
        checkedOn: text(`checked-${i}`),
        notes: text(`notes-${i}`),
      })),
    }
    const payload = new FormData()
    payload.set('product_id', product)
    payload.set('data', JSON.stringify(data))
    for (const key of ['ce', 'it']) {
      const file = form.get(key)
      if (file instanceof File && file.size) payload.set(key, file)
    }
    try {
      const result = await fetch('/api/ce-it/versions', { method: 'POST', body: payload })
      const value = await result.json()
      if (!result.ok) throw new Error(value.error ?? 'Dépôt impossible')
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const add = (rows: number[], set: (v: number[]) => void) => {
    if (rows.length < 30) set([...rows, Math.max(...rows) + 1])
  }
  return (
    <DataForm
      onData={submit}
      className="space-y-5 rounded-2xl border bg-white p-5"
      aria-label="Nouvelle version CE IT"
    >
      <h2 className="text-xl font-bold">Données et documents de la nouvelle version</h2>
      <p className="text-sm text-slate-600">
        Les champs ci-dessous sont réservés aux auteurs habilités. Les PDF restent privés jusqu’à la
        revue scientifique et à la publication.
      </p>
      <label className="block">
        Contexte agronomique et limites
        <textarea name="context" minLength={20} maxLength={3000} required className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          Superficie (ha)
          <input
            name="area"
            type="number"
            min="0.01"
            max="10000"
            step="any"
            defaultValue="1"
            required
            className={field}
          />
        </label>
        <label>
          Rendement (t/ha)
          <input
            name="yield"
            type="number"
            min="0"
            max="200"
            step="any"
            required
            className={field}
          />
        </label>
        <label>
          Prix de vente (FCFA/kg)
          <input
            name="sale"
            type="number"
            min="0"
            max="1000000"
            step="any"
            required
            className={field}
          />
        </label>
        <label>
          Pertes (%)
          <input
            name="loss"
            type="number"
            min="0"
            max="99.99"
            step="any"
            required
            className={field}
          />
        </label>
      </div>
      <fieldset className="space-y-3">
        <legend className="font-bold">Charges du compte d’exploitation</legend>
        {costs.map((i, index) => (
          <div key={i} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
            <label>
              Charge {index + 1}
              <input name={`label-${i}`} required minLength={2} className={field} />
            </label>
            <label>
              Catégorie
              <select name={`category-${i}`} className={field}>
                <option value="other">Autre</option>
                <option value="seed">Semences</option>
                <option value="labour">Main-d’œuvre</option>
                <option value="fertilizer">Fertilisation</option>
                <option value="transport">Transport</option>
                <option value="land">Foncier</option>
                <option value="crop_protection">Protection des cultures</option>
                <option value="harvest">Récolte</option>
                <option value="post_harvest">Après récolte</option>
                <option value="mechanization">Mécanisation</option>
              </select>
            </label>
            <label>
              Quantité
              <input
                type="number"
                name={`quantity-${i}`}
                required
                min="0"
                step="any"
                className={field}
              />
            </label>
            <label>
              Prix unitaire (FCFA)
              <input
                type="number"
                name={`price-${i}`}
                required
                min="0"
                step="any"
                className={field}
              />
            </label>
            <label>
              Application
              <select name={`scale-${i}`} className={field}>
                <option value="per_hectare">Par hectare</option>
                <option value="per_farm">Pour l’exploitation</option>
                <option value="per_tonne">Par tonne produite</option>
                <option value="per_kg">Par kg produit</option>
              </select>
            </label>
            {costs.length > 1 && (
              <button
                type="button"
                className="underline"
                onClick={() => setCosts(costs.filter((v) => v !== i))}
              >
                Retirer cette charge
              </button>
            )}
          </div>
        ))}
        <button type="button" className="underline" onClick={() => add(costs, setCosts)}>
          Ajouter une charge
        </button>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-bold">Itinéraire technique · jours après le semis</legend>
        {steps.map((i, index) => (
          <div key={i} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <label>
              Opération {index + 1}
              <input name={`operation-${i}`} minLength={3} required className={field} />
            </label>
            <div className="flex gap-2">
              <label>
                Début (jour)
                <input
                  name={`start-${i}`}
                  type="number"
                  required
                  min="-365"
                  max="1825"
                  className={field}
                />
              </label>
              <label>
                Fin (jour)
                <input
                  name={`end-${i}`}
                  type="number"
                  required
                  min="-365"
                  max="1825"
                  className={field}
                />
              </label>
            </div>
            <label>
              Instructions
              <textarea name={`instructions-${i}`} minLength={20} required className={field} />
            </label>
            <label>
              Précautions
              <textarea name={`precautions-${i}`} minLength={5} required className={field} />
            </label>
            {steps.length > 1 && (
              <button
                type="button"
                className="underline"
                onClick={() => setSteps(steps.filter((v) => v !== i))}
              >
                Retirer cette étape
              </button>
            )}
          </div>
        ))}
        <button type="button" className="underline" onClick={() => add(steps, setSteps)}>
          Ajouter une étape
        </button>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-bold">Références et droits de reproduction</legend>
        {sources.map((i, index) => (
          <div key={i} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <label>
              Source {index + 1}
              <input name={`source-${i}`} minLength={3} required className={field} />
            </label>
            <label>
              Adresse HTTPS
              <input type="url" name={`url-${i}`} pattern="https://.*" required className={field} />
            </label>
            <label>
              Droits
              <select name={`rights-${i}`} className={field}>
                <option value="open">Source ouverte</option>
                <option value="authorized">Autorisation obtenue</option>
              </select>
            </label>
            <label>
              Date de vérification
              <input type="date" name={`checked-${i}`} required className={field} />
            </label>
            <label className="sm:col-span-2">
              Référence précise et justification des droits
              <textarea name={`notes-${i}`} required minLength={5} className={field} />
            </label>
            {sources.length > 1 && (
              <button
                type="button"
                className="underline"
                onClick={() => setSources(sources.filter((v) => v !== i))}
              >
                Retirer cette référence
              </button>
            )}
          </div>
        ))}
        <button type="button" className="underline" onClick={() => add(sources, setSources)}>
          Ajouter une référence
        </button>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="font-bold">PDF existants (facultatif)</legend>
        <p className="text-sm sm:col-span-2">
          Sans fichiers, les deux PDF sont générés à partir du formulaire. Pour déposer des
          documents existants, joindre les deux PDF (2 Mo chacun au maximum).
        </p>
        <label>
          Compte d’exploitation
          <input type="file" name="ce" accept="application/pdf" className={field} />
        </label>
        <label>
          Itinéraire technique
          <input type="file" name="it" accept="application/pdf" className={field} />
        </label>
      </fieldset>
      <p role="alert">{error}</p>
      <button type="submit" className={button} disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer une version privée'}
      </button>
    </DataForm>
  )
}
