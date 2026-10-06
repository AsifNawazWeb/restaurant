import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Utensils, ImagePlus, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { api, unwrap } from '@/lib/api'
import { formatPKR } from '@shared/money'
import type { MenuCategory, MenuItem, MenuItemInput } from '@shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Sheet } from '@/components/ui/dialog'
import { Dialog, DialogHeader } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

export function MenuScreen() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')
  const [editorItem, setEditorItem] = useState<MenuItem | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [newCategory, setNewCategory] = useState(false)

  async function refresh() {
    const [i, c] = await Promise.all([unwrap(api.catalog.listItems({})), unwrap(api.catalog.listCategories(true))])
    setItems(i)
    setCategories(c)
  }
  useEffect(() => {
    refresh().catch(toast.error)
  }, [])

  const filtered = items.filter((i) => {
    if (categoryFilter !== 'all' && i.categoryId !== categoryFilter) return false
    if (!search) return true
    const term = search.toLowerCase()
    return i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term)
  })

  async function toggleAvailability(item: MenuItem, checked: boolean) {
    try {
      await unwrap(api.catalog.setAvailability({ id: item.id, isAvailable: checked }))
      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, isAvailable: checked } : x)))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[17px] font-bold tracking-tight">Menu Items</h1>
            <p className="text-[12px] text-foreground-muted">{items.length} items · {categories.length} categories</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setNewCategory(true)}>
              <Tag size={13} /> Categories
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditorItem(null)
                setEditorOpen(true)
              }}
            >
              <Plus size={13} /> Add Menu Item
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Item Registry</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or SKU…" className="h-8 w-56 pl-7" />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="h-8 rounded-lg border border-border bg-surface px-2 text-[12.5px]"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <EmptyState icon={<Utensils size={26} />} title="No menu items" hint="Add your first dish to start selling" />
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-foreground-muted">
                    <th className="py-2 font-medium">Item</th>
                    <th className="py-2 font-medium">SKU</th>
                    <th className="py-2 font-medium">Category</th>
                    <th className="py-2 text-right font-medium">Selling</th>
                    <th className="py-2 text-right font-medium">BOM Cost</th>
                    <th className="py-2 text-center font-medium">Margin</th>
                    <th className="py-2 text-center font-medium">GST</th>
                    <th className="py-2 text-center font-medium">Available</th>
                    <th className="py-2 text-right font-medium">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-2/60">
                      <td className="py-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-soft text-[11px] font-bold text-primary">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              item.name.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{item.name}</div>
                            <div className="text-[11px] text-foreground-muted">
                              {item.variants.length} variant{item.variants.length === 1 ? '' : 's'} ·{' '}
                              {item.variants.map((v) => v.name).join(', ')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 font-mono text-[11.5px] text-foreground-secondary">{item.sku}</td>
                      <td className="py-2">
                        <Badge variant="neutral">{item.categoryName}</Badge>
                      </td>
                      <td className="tabular py-2 text-right font-semibold">{formatPKR(item.minPriceCents)}</td>
                      <td className="tabular py-2 text-right text-foreground-secondary">{formatPKR(item.costCents)}</td>
                      <td className="py-2 text-center">
                        {item.minPriceCents > 0 ? (
                          <span
                            className={cn(
                              'tabular rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                              (item.minPriceCents - item.costCents) / item.minPriceCents >= 0.5
                                ? 'bg-success-soft text-success'
                                : (item.minPriceCents - item.costCents) / item.minPriceCents >= 0.3
                                  ? 'bg-warning-soft text-warning'
                                  : 'bg-danger-soft text-danger'
                            )}
                          >
                            {Math.round(((item.minPriceCents - item.costCents) / item.minPriceCents) * 100)}%
                          </span>
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        <Badge variant={item.taxEnabled ? 'default' : 'neutral'}>{item.taxEnabled ? 'GST' : 'Exempt'}</Badge>
                      </td>
                      <td className="py-2 text-center">
                        <Switch checked={item.isAvailable} onCheckedChange={(v) => toggleAvailability(item, v)} />
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditorItem(item); setEditorOpen(true) }}>
                            <Pencil size={13} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-danger"
                            onClick={async () => {
                              try {
                                await unwrap(api.catalog.deleteItem(item.id))
                                toast.success('Item deleted')
                                refresh()
                              } catch (err) {
                                // soft-deleted due to history
                                toast.info((err as Error).message)
                                refresh()
                              }
                            }}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Slide-over editor */}
      <ItemEditor
        key={editorItem?.id ?? 'new'}
        open={editorOpen}
        item={editorItem}
        categories={categories}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false)
          refresh()
        }}
      />

      <CategoryManager
        open={newCategory}
        categories={categories}
        onClose={() => setNewCategory(false)}
        onChanged={refresh}
      />
    </>
  )
}

/** ---------- Item slide-over editor ---------- */

function ItemEditor({
  open,
  item,
  categories,
  onClose,
  onSaved
}: {
  open: boolean
  item: MenuItem | null
  categories: MenuCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const [sku, setSku] = useState(item?.sku ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [categoryId, setCategoryId] = useState<number>(item?.categoryId ?? categories[0]?.id ?? 0)
  const [taxEnabled, setTaxEnabled] = useState(item?.taxEnabled ?? true)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(item?.imageUrl ?? null)
  const [variants, setVariants] = useState(
    item?.variants.map((v) => ({ name: v.name, priceRupees: String(v.priceCents / 100) })) ?? [
      { name: 'Regular', priceRupees: '' }
    ]
  )
  const [busy, setBusy] = useState(false)

  async function onPickImage(file: File | null) {
    if (!file) return
    // Downscale to keep the DB payload small (max 320px square)
    const dataUrl = await downscaleImage(file, 320)
    setImageDataUrl(dataUrl)
  }

  async function save() {
    if (!name.trim() || !sku.trim() || !categoryId) {
      toast.error('Name, SKU and category are required')
      return
    }
    const cleaned = variants.filter((v) => v.name.trim() && Number(v.priceRupees) > 0)
    if (cleaned.length === 0) {
      toast.error('At least one variant with a price is required')
      return
    }
    setBusy(true)
    try {
      const payload: MenuItemInput = {
        id: item?.id,
        sku: sku.trim(),
        name: name.trim(),
        categoryId,
        imageUrl: imageDataUrl,
        taxEnabled,
        isAvailable: item?.isAvailable ?? true,
        variants: cleaned.map((v) => ({ name: v.name.trim(), priceCents: Math.round(Number(v.priceRupees) * 100) }))
      }
      await unwrap(api.catalog.saveItem(payload))
      toast.success(item ? 'Menu item updated' : 'Menu item created')
      onSaved()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">{item ? `Edit — ${item.name}` : 'New Menu Item'}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* Image */}
        <div className="flex items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface-2">
            {imageDataUrl ? (
              <img src={imageDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus size={20} className="text-foreground-muted" />
            )}
          </div>
          <div className="space-y-1.5 text-[12px]">
            <label className="block">
              <span className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium hover:bg-surface-2">
                Choose image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                />
              </span>
            </label>
            {imageDataUrl && (
              <button className="block text-[11px] text-danger" onClick={() => setImageDataUrl(null)}>
                Remove image
              </button>
            )}
            <p className="text-[11px] text-foreground-muted">Stored locally — works fully offline</p>
          </div>
        </div>

        <EditorField label="Dish name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken Biryani" />
        </EditorField>
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="SKU / item code">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="KT-001" />
          </EditorField>
          <EditorField label="Category">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-[13px]"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </EditorField>
        </div>

        <EditorField label="GST applies to this item">
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
            <span className="text-[12px] text-foreground-secondary">{taxEnabled ? 'Taxable (GST applies)' : 'GST exempt'}</span>
          </div>
        </EditorField>

        {/* Variants */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground-secondary">Variants & pricing</span>
            <Button size="sm" variant="ghost" onClick={() => setVariants((v) => [...v, { name: '', priceRupees: '' }])}>
              <Plus size={12} /> Variant
            </Button>
          </div>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="h-8 flex-1"
                  placeholder="Small / Medium / Large"
                  value={v.name}
                  onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <Input
                  className="tabular h-8 w-28"
                  type="number"
                  placeholder="Price Rs."
                  value={v.priceRupees}
                  onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, priceRupees: e.target.value } : x)))}
                />
                <Button size="icon" variant="ghost" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-border p-4">
        <Button size="xl" className="w-full" disabled={busy} onClick={save}>
          {item ? 'Save Changes' : 'Create Menu Item'}
        </Button>
      </div>
    </Sheet>
  )
}

function EditorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-foreground-secondary">{label}</span>
      {children}
    </label>
  )
}

/** ---------- Category manager ---------- */

function CategoryManager({
  open,
  categories,
  onClose,
  onChanged
}: {
  open: boolean
  categories: MenuCategory[]
  onClose: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  return (
    <Dialog open={open} onClose={onClose} width="max-w-sm">
      <DialogHeader title="Menu Categories" onClose={onClose} />
      <div className="space-y-3 p-4">
        <ul className="space-y-1.5">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[12.5px]">
              <span className="font-medium">{c.name}</span>
              <Badge variant={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Active' : 'Hidden'}</Badge>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
          <Button
            onClick={async () => {
              if (!name.trim()) return
              try {
                await unwrap(api.catalog.createCategory({ name: name.trim(), sortOrder: categories.length + 1 }))
                setName('')
                onChanged()
                toast.success('Category added')
              } catch (err) {
                toast.error((err as Error).message)
              }
            }}
          >
            <Plus size={13} /> Add
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** ---------- image helper ---------- */

function downscaleImage(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = reject
      img.src = String(reader.result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
