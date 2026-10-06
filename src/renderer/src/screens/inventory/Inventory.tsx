import { useEffect, useMemo, useState } from 'react'
import { Plus, Package, ShoppingCart, ChefHat, Trash2, Wrench, TrendingDown, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useUi } from '@/stores/ui'
import { api, unwrap } from '@/lib/api'
import { formatPKR } from '@shared/money'
import type {
  MenuItem,
  RawMaterial,
  PurchaseRecord,
  RecipeLine,
  WastageEntry
} from '@shared/types'
import type { WasteReason } from '@shared/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { Dialog, DialogHeader } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'stock', label: 'Raw Materials', icon: <Package size={13} /> },
  { id: 'purchases', label: 'Goods Received', icon: <ShoppingCart size={13} /> },
  { id: 'recipes', label: 'Recipe Mapping (BOM)', icon: <ChefHat size={13} /> },
  { id: 'wastage', label: 'Wastage Log', icon: <TrendingDown size={13} /> }
]

export function InventoryScreen() {
  const { user } = useUi()
  const [tab, setTab] = useState('stock')

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight">Raw Stock & Inventory</h1>
          <p className="text-[12px] text-foreground-muted">BOM engine — stock levels, purchases, recipes and wastage</p>
        </div>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {tab === 'stock' && <StockTab />}
      {tab === 'purchases' && <PurchasesTab userName={user?.name ?? 'system'} />}
      {tab === 'recipes' && <RecipesTab />}
      {tab === 'wastage' && <WastageTab userName={user?.name ?? 'system'} />}
    </div>
  )
}

/** ---------- Stock tab ---------- */

function StockTab() {
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [editMaterial, setEditMaterial] = useState<Partial<RawMaterial> & { id?: number } | null>(null)
  const [adjustMaterial, setAdjustMaterial] = useState<RawMaterial | null>(null)

  async function refresh() {
    setMaterials(await unwrap(api.inventory.listMaterials()))
  }
  useEffect(() => {
    refresh().catch(toast.error)
  }, [])

  async function save() {
    if (!editMaterial?.name || !editMaterial?.baseUnit) return
    try {
      await unwrap(
        api.inventory.saveMaterial({
          id: editMaterial.id,
          name: editMaterial.name,
          baseUnit: editMaterial.baseUnit,
          stockQty: editMaterial.stockQty ?? 0,
          safetyThreshold: editMaterial.safetyThreshold ?? 0,
          initialCostCents: Math.round((editMaterial.avgUnitCostCents ?? 0))
        })
      )
      toast.success('Material saved')
      setEditMaterial(null)
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Raw Materials Stock</CardTitle>
          <Button size="sm" onClick={() => setEditMaterial({ baseUnit: 'kg', stockQty: 0, safetyThreshold: 0, avgUnitCostCents: 0 })}>
            <Plus size={13} /> Add Material
          </Button>
        </CardHeader>
        <CardContent>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-foreground-muted">
                <th className="py-2 font-medium">Material</th>
                <th className="py-2 font-medium">Unit</th>
                <th className="py-2 text-right font-medium">Stock</th>
                <th className="py-2 text-right font-medium">Threshold</th>
                <th className="py-2 text-right font-medium">Avg Unit Cost</th>
                <th className="py-2 text-center font-medium">Level</th>
                <th className="py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {materials.map((m) => (
                <tr key={m.id} className="hover:bg-surface-2/60">
                  <td className="py-2 font-medium">{m.name}</td>
                  <td className="py-2 text-foreground-muted">{m.baseUnit}</td>
                  <td className="tabular py-2 text-right font-semibold">{m.stockQty}</td>
                  <td className="tabular py-2 text-right text-foreground-secondary">{m.safetyThreshold}</td>
                  <td className="tabular py-2 text-right">{formatPKR(m.avgUnitCostCents)}</td>
                  <td className="py-2 text-center">
                    <span
                      className={cn(
                        'inline-flex h-2.5 w-2.5 rounded-full',
                        m.status === 'healthy' && 'bg-success',
                        m.status === 'low' && 'bg-warning',
                        m.status === 'critical' && 'bg-danger animate-pulse'
                      )}
                      title={m.status}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setAdjustMaterial(m)}>
                        <Wrench size={12} /> Adjust
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditMaterial(m)}>
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {materials.length === 0 && <EmptyState title="No raw materials" hint="Add your first ingredient" />}
        </CardContent>
      </Card>

      {/* Material editor */}
      <Dialog open={!!editMaterial} onClose={() => setEditMaterial(null)} width="max-w-sm">
        <DialogHeader title={editMaterial?.id ? 'Edit Material' : 'New Raw Material'} onClose={() => setEditMaterial(null)} />
        <div className="space-y-3 p-4">
          <Field label="Name">
            <Input value={editMaterial?.name ?? ''} onChange={(e) => setEditMaterial((m) => ({ ...m, name: e.target.value }))} placeholder="e.g. Raw Chicken" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base unit">
              <Input value={editMaterial?.baseUnit ?? ''} onChange={(e) => setEditMaterial((m) => ({ ...m, baseUnit: e.target.value }))} placeholder="kg / l / g / ml / pcs" />
            </Field>
            <Field label="Safety threshold">
              <Input type="number" value={editMaterial?.safetyThreshold ?? 0} onChange={(e) => setEditMaterial((m) => ({ ...m, safetyThreshold: Number(e.target.value) }))} />
            </Field>
          </div>
          {!editMaterial?.id && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening stock">
                <Input type="number" value={editMaterial?.stockQty ?? 0} onChange={(e) => setEditMaterial((m) => ({ ...m, stockQty: Number(e.target.value) }))} />
              </Field>
              <Field label="Unit cost (Rs.)">
                <Input type="number" value={(editMaterial?.avgUnitCostCents ?? 0) / 100} onChange={(e) => setEditMaterial((m) => ({ ...m, avgUnitCostCents: Math.round(Number(e.target.value) * 100) }))} />
              </Field>
            </div>
          )}
          <Button className="w-full" size="lg" onClick={save}>
            <Check size={14} /> Save Material
          </Button>
        </div>
      </Dialog>

      {/* Manual adjustment */}
      <Dialog open={!!adjustMaterial} onClose={() => setAdjustMaterial(null)} width="max-w-xs">
        <DialogHeader title={`Adjust — ${adjustMaterial?.name ?? ''}`} onClose={() => setAdjustMaterial(null)} />
        <AdjustModal material={adjustMaterial} onDone={() => { setAdjustMaterial(null); refresh() }} />
      </Dialog>
    </>
  )
}

function AdjustModal({ material, onDone }: { material: RawMaterial | null; onDone: () => void }) {
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  return (
    <div className="space-y-3 p-4">
      <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12px]">
        Current stock: <b className="tabular">{material?.stockQty} {material?.baseUnit}</b>
      </div>
      <Field label="Delta (+ stock in / - shrink)">
        <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. -0.5 or 10" />
      </Field>
      <Field label="Note">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="reason" />
      </Field>
      <Button
        className="w-full"
        disabled={!delta}
        onClick={async () => {
          try {
            await unwrap(api.inventory.adjustStock({ materialId: material!.id, deltaQty: Number(delta), note: note || 'manual' }))
            toast.success('Stock adjusted')
            onDone()
          } catch (err) {
            toast.error((err as Error).message)
          }
        }}
      >
        Apply Adjustment
      </Button>
    </div>
  )
}

/** ---------- Purchases tab ---------- */

function PurchasesTab({ userName }: { userName: string }) {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [modal, setModal] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [invoice, setInvoice] = useState('')
  const [lines, setLines] = useState<{ materialId: number; qty: string; lineCost: string }[]>([
    { materialId: 0, qty: '', lineCost: '' }
  ])

  async function refresh() {
    const [p, m] = await Promise.all([unwrap(api.inventory.listPurchases()), unwrap(api.inventory.listMaterials())])
    setPurchases(p)
    setMaterials(m)
  }
  useEffect(() => {
    refresh().catch(toast.error)
  }, [])

  async function submit() {
    try {
      await unwrap(
        api.inventory.createPurchase({
          supplierName: supplier,
          invoiceRef: invoice,
          lines: lines.map((l) => ({
            materialId: Number(l.materialId),
            qty: Number(l.qty),
            lineCostCents: Math.round(Number(l.lineCost) * 100)
          }))
        })
      )
      toast.success('Goods received — stock and weighted-average cost updated')
      setModal(false)
      setSupplier('')
      setInvoice('')
      setLines([{ materialId: 0, qty: '', lineCost: '' }])
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Goods Received (Purchases)</CardTitle>
          <Button size="sm" onClick={() => setModal(true)}>
            <Plus size={13} /> New Purchase
          </Button>
        </CardHeader>
        <CardContent>
          {purchases.length === 0 ? (
            <EmptyState title="No purchases recorded" hint="Log supplier deliveries to keep costs accurate" />
          ) : (
            <div className="space-y-2">
              {purchases.map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[12.5px] font-semibold">{p.supplierName}</span>
                      {p.invoiceRef && <span className="ml-2 text-[11px] text-foreground-muted">{p.invoiceRef}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular text-[12.5px] font-bold">{formatPKR(p.totalCents)}</span>
                      <Badge variant="neutral">{new Date(p.receivedAt).toLocaleDateString()}</Badge>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-foreground-muted">
                    {p.lines.map((l) => (
                      <span key={l.materialId}>
                        {l.materialName}: {l.qty} @ {formatPKR(l.unitCostCents)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modal} onClose={() => setModal(false)} width="max-w-xl">
        <DialogHeader title="New Purchase — Goods Received" description="Stock increases and weighted-average unit costs recalculate automatically." onClose={() => setModal(false)} />
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier">
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Peshawar Fresh Foods" />
            </Field>
            <Field label="Invoice ref">
              <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="INV-..." />
            </Field>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={l.materialId}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, materialId: Number(e.target.value) } : x)))}
                  className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-[12.5px]"
                >
                  <option value={0}>Select material…</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.baseUnit})
                    </option>
                  ))}
                </select>
                <Input type="number" className="w-24" placeholder="Qty" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                <Input type="number" className="w-32" placeholder="Total Rs." value={l.lineCost} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, lineCost: e.target.value } : x)))} />
                <Button size="icon" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { materialId: 0, qty: '', lineCost: '' }])}>
            <Plus size={12} /> Add line
          </Button>
          <Button className="w-full" size="lg" variant="success" onClick={submit}>
            <Check size={14} /> Receive & Update Stock
          </Button>
        </div>
      </Dialog>
    </>
  )
}

/** ---------- Recipes tab ---------- */

function RecipesTab() {
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [lines, setLines] = useState<RecipeLine[]>([])
  const [newMaterialId, setNewMaterialId] = useState(0)
  const [newQty, setNewQty] = useState('')

  useEffect(() => {
    ;(async () => {
      const [m, i] = await Promise.all([unwrap(api.inventory.listMaterials()), unwrap(api.catalog.listItems({}))])
      setMaterials(m)
      setItems(i)
    })().catch(toast.error)
  }, [])

  useEffect(() => {
    if (!selectedItemId) return
    unwrap(api.catalog.getRecipe(selectedItemId))
      .then((r) => setLines(r))
      .catch(toast.error)
  }, [selectedItemId])

  async function save() {
    if (!selectedItemId) return
    try {
      await unwrap(
        api.catalog.setRecipe({
          menuItemId: selectedItemId,
          lines: lines.map((l) => ({ materialId: l.materialId, consumptionQty: l.consumptionQty }))
        })
      )
      toast.success('Recipe saved — BOM cost updated')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const selected = items.find((i) => i.id === selectedItemId)
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipe Mapping — Bill of Materials</CardTitle>
        <div className="flex items-center gap-2">
          <select
            value={selectedItemId ?? ''}
            onChange={(e) => setSelectedItemId(Number(e.target.value))}
            className="h-8 rounded-lg border border-border bg-surface px-2 text-[12.5px]"
          >
            <option value="">Select menu item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={!selectedItemId} onClick={save} variant="success">
            <Check size={13} /> Save Recipe
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!selectedItemId ? (
          <EmptyState icon={<ChefHat size={26} />} title="Pick a menu item" hint="Assign raw material consumption per unit sold" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px]">
              <span className="font-semibold">{selected?.name}</span>
              <span className="text-foreground-muted">BOM cost:</span>
              <span className="tabular font-bold text-primary">
                {formatPKR(lines.reduce((s, l) => s + Math.round(l.consumptionQty * (materialById.get(l.materialId)?.avgUnitCostCents ?? 0)), 0))}
              </span>
              {selected && selected.minPriceCents > 0 && (
                <span className="text-foreground-muted">
                  — margin {Math.round(((selected.minPriceCents - lines.reduce((s, l) => s + Math.round(l.consumptionQty * (materialById.get(l.materialId)?.avgUnitCostCents ?? 0)), 0)) / selected.minPriceCents) * 100)}%
                </span>
              )}
            </div>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-foreground-muted">
                  <th className="py-2 font-medium">Raw Material</th>
                  <th className="py-2 text-right font-medium">Consumption / unit</th>
                  <th className="py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2">
                      {l.materialName} <span className="text-foreground-muted">({l.materialUnit})</span>
                    </td>
                    <td className="py-2 text-right">
                      <Input
                        type="number"
                        className="ml-auto h-7 w-24 text-right"
                        value={l.consumptionQty}
                        onChange={(e) =>
                          setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, consumptionQty: Number(e.target.value) } : x)))
                        }
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>
                        <Trash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2.5">
              <select value={newMaterialId} onChange={(e) => setNewMaterialId(Number(e.target.value))} className="h-8 flex-1 rounded-lg border border-border bg-surface px-2 text-[12.5px]">
                <option value={0}>Add ingredient…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.baseUnit})
                  </option>
                ))}
              </select>
              <Input type="number" className="h-8 w-24" placeholder="Qty" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const m = materialById.get(newMaterialId)
                  if (!m || !newQty) return
                  setLines((ls) => [
                    ...ls,
                    { id: -Date.now(), menuItemId: selectedItemId!, materialId: m.id, materialName: m.name, materialUnit: m.baseUnit, consumptionQty: Number(newQty) }
                  ])
                  setNewQty('')
                  setNewMaterialId(0)
                }}
              >
                <Plus size={12} /> Add
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** ---------- Wastage tab ---------- */

function WastageTab({ userName }: { userName: string }) {
  const [entries, setEntries] = useState<WastageEntry[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [modal, setModal] = useState(false)
  const [materialId, setMaterialId] = useState(0)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState<WasteReason>('spoilage')

  async function refresh() {
    const [w, m] = await Promise.all([unwrap(api.inventory.listWastage()), unwrap(api.inventory.listMaterials())])
    setEntries(w)
    setMaterials(m)
  }
  useEffect(() => {
    refresh().catch(toast.error)
  }, [])

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Wastage Log</CardTitle>
          <Button size="sm" onClick={() => setModal(true)}>
            <Plus size={13} /> Log Wastage
          </Button>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <EmptyState title="No wastage recorded" />
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-foreground-muted">
                  <th className="py-2 font-medium">Material</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 font-medium">Reason</th>
                  <th className="py-2 text-right font-medium">Cost</th>
                  <th className="py-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((w) => (
                  <tr key={w.id} className="hover:bg-surface-2/60">
                    <td className="py-2 font-medium">{w.materialName}</td>
                    <td className="tabular py-2 text-right">-{w.qty}</td>
                    <td className="py-2">
                      <Badge variant={w.reason === 'spoilage' ? 'warning' : 'neutral'}>{w.reason}</Badge>
                    </td>
                    <td className="tabular py-2 text-right text-danger">{formatPKR(w.costCents)}</td>
                    <td className="py-2 text-right text-foreground-muted">{new Date(w.loggedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modal} onClose={() => setModal(false)} width="max-w-xs">
        <DialogHeader title="Log Wastage" onClose={() => setModal(false)} />
        <div className="space-y-3 p-4">
          <Field label="Material">
            <select value={materialId} onChange={(e) => setMaterialId(Number(e.target.value))} className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-[13px]">
              <option value={0}>Select…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.baseUnit})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity wasted">
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Reason">
            <select value={reason} onChange={(e) => setReason(e.target.value as WasteReason)} className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-[13px]">
              {(['spoilage', 'breakage', 'overproduction', 'expired', 'other'] as WasteReason[]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Button
            className="w-full"
            variant="danger"
            size="lg"
            onClick={async () => {
              try {
                await unwrap(api.inventory.logWastage({ materialId, qty: Number(qty), reason }))
                toast.success('Wastage logged — stock reduced')
                setModal(false)
                setQty('')
                refresh()
              } catch (err) {
                toast.error((err as Error).message)
              }
            }}
          >
            Log & Deduct Stock
          </Button>
          <p className="text-center text-[11px] text-foreground-muted">Logged by {userName}</p>
        </div>
      </Dialog>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-foreground-secondary">{label}</span>
      {children}
    </label>
  )
}
