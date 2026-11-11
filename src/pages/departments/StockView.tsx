import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './PriceView.css'

type Branch = 'kalpetta' | 'bathery'

type StockItem = {
  slno: string
  barcode: string
  itemName: string
  itemCode: string
  stock: number
}

type CSVRow = Record<string, string | undefined>

type BranchStock = StockItem & { id: string }

const BATCH_SIZE = 450
const BRANCHES: Branch[] = ['kalpetta', 'bathery']

// Header matching ignores spaces, underscores, punctuation and letter case.
// Barcode is intentionally optional; all other listed columns are expected.
const REQUIRED_HEADERS = [
  'slno',
  'itemname',
  'itemcode',
  'stock',
  'salerate',
  'salevalue',
  'avgprate',
  'stockvalue',
]

const normalizeHeader = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '')

const readCell = (row: CSVRow, normalizedHeader: string) => {
  const key = Object.keys(row).find(
    header => normalizeHeader(header) === normalizedHeader,
  )
  return key ? String(row[key] ?? '').trim() : ''
}

const parseStockNumber = (value: string) => {
  const parsed = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

const formatStock = (value: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)

const formatUpdatedAt = (date: Date | null) =>
  date
    ? date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Never'

function StockView() {
  const kalpettaInputRef = useRef<HTMLInputElement>(null)
  const batheryInputRef = useRef<HTMLInputElement>(null)

  const [kalpettaItems, setKalpettaItems] = useState<BranchStock[]>([])
  const [batheryItems, setBatheryItems] = useState<BranchStock[]>([])
  const [updatedAt, setUpdatedAt] = useState<Record<Branch, Date | null>>({
    kalpetta: null,
    bathery: null,
  })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<Record<Branch, boolean>>({
    kalpetta: false,
    bathery: false,
  })
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  const getStockCollection = (branch: Branch) =>
    collection(db, branch === 'kalpetta' ? 'stockKalpetta' : 'stockBathery')

  const getMetaRef = (branch: Branch) => doc(db, 'stockUploadMeta', branch)

  const fetchBranch = useCallback(async (branch: Branch) => {
    const [snapshot, metaSnapshot] = await Promise.all([
      getDocs(getStockCollection(branch)),
      getDoc(getMetaRef(branch)),
    ])

    const items: BranchStock[] = snapshot.docs.map(stockDoc => {
      const data = stockDoc.data()
      return {
        id: stockDoc.id,
        slno: String(data.slno ?? ''),
        barcode: String(data.barcode ?? ''),
        itemName: String(data.itemName ?? ''),
        itemCode: String(data.itemCode ?? stockDoc.id),
        stock: Number(data.stock ?? 0),
      }
    })

    const meta = metaSnapshot.exists()
      ? (metaSnapshot.data() as { lastUpdated?: Timestamp })
      : null
    const timestamp = meta?.lastUpdated

    setUpdatedAt(previous => ({
      ...previous,
      [branch]: timestamp instanceof Timestamp ? timestamp.toDate() : null,
    }))

    if (branch === 'kalpetta') setKalpettaItems(items)
    else setBatheryItems(items)
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all(BRANCHES.map(fetchBranch))
    } catch (error) {
      console.error('Error loading stock data:', error)
      setMessage('Failed to load stock data from Firestore.')
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }, [fetchBranch])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const openFilePicker = (branch: Branch) => {
    if (branch === 'kalpetta') kalpettaInputRef.current?.click()
    else batheryInputRef.current?.click()
  }

  const parseFiles = async (files: FileList): Promise<StockItem[]> => {
    const combined = new Map<string, StockItem>()

    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        throw new Error(`"${file.name}" is not a CSV file.`)
      }

      const parsed = await new Promise<Papa.ParseResult<CSVRow>>((resolve, reject) => {
        Papa.parse<CSVRow>(file, {
          header: true,
          skipEmptyLines: 'greedy',
          transformHeader: header => header.trim(),
          complete: resolve,
          error: reject,
        })
      })

      if (parsed.errors.length > 0) {
        throw new Error(`${file.name}: ${parsed.errors[0].message}`)
      }

      const headers = (parsed.meta.fields ?? []).map(normalizeHeader)
      const missing = REQUIRED_HEADERS.filter(header => !headers.includes(header))
      if (missing.length > 0) {
        throw new Error(
          `${file.name} is missing required column(s): ${missing.join(', ')}. Barcode is optional.`,
        )
      }

      parsed.data.forEach((row, index) => {
        const itemCode = readCell(row, 'itemcode')
        if (!itemCode) return

        const stockItem: StockItem = {
          slno: readCell(row, 'slno') || String(index + 1),
          barcode: readCell(row, 'barcode'),
          itemName: readCell(row, 'itemname'),
          itemCode,
          stock: parseStockNumber(readCell(row, 'stock')),
        }

        // If an item appears in more than one CSV, combine its stock quantity.
        const existing = combined.get(itemCode)
        if (existing) {
          existing.stock += stockItem.stock
          if (!existing.barcode && stockItem.barcode) existing.barcode = stockItem.barcode
          if (!existing.itemName && stockItem.itemName) existing.itemName = stockItem.itemName
        } else {
          combined.set(itemCode, stockItem)
        }
      })
    }

    if (combined.size === 0) {
      throw new Error('No valid stock rows found. Check that Item Code and stock values are present.')
    }

    return Array.from(combined.values())
  }

  const replaceBranchStock = async (branch: Branch, items: StockItem[]) => {
    const stockCollection = getStockCollection(branch)
    const oldSnapshot = await getDocs(stockCollection)

    // Write the new records first. This avoids deleting the previous stock list
    // before the replacement records have been successfully saved.
    const newDocumentIds = new Set(items.map(item => encodeURIComponent(item.itemCode)))

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      items.slice(i, i + BATCH_SIZE).forEach(item => {
        batch.set(doc(stockCollection, encodeURIComponent(item.itemCode)), item)
      })
      await batch.commit()
    }

    // Remove records that are no longer present in the uploaded CSV files.
    const staleDocuments = oldSnapshot.docs.filter(stockDoc => !newDocumentIds.has(stockDoc.id))
    for (let i = 0; i < staleDocuments.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      staleDocuments.slice(i, i + BATCH_SIZE).forEach(stockDoc => {
        batch.delete(stockDoc.ref)
      })
      await batch.commit()
    }

    await setDoc(getMetaRef(branch), { lastUpdated: Timestamp.now() })
  }

  const handleFileChange = async (
    branch: Branch,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files
    if (!files?.length) return

    setMessage('')
    setUploading(previous => ({ ...previous, [branch]: true }))

    try {
      const items = await parseFiles(files)
      await replaceBranchStock(branch, items)
      await fetchBranch(branch)
      setMessage(
        `${branch === 'kalpetta' ? 'Kalpetta' : 'Bathery'} stock updated successfully with ${items.length} unique items.`,
      )
      setMessageType('success')
    } catch (error) {
      console.error(`${branch} stock upload failed:`, error)
      setMessage(
        error instanceof Error ? `Upload failed: ${error.message}` : 'Stock upload failed.',
      )
      setMessageType('error')
      // Reload the branch in case a Firestore batch had already completed.
      try {
        await fetchBranch(branch)
      } catch (refreshError) {
        console.error('Could not refresh branch stock:', refreshError)
      }
    } finally {
      setUploading(previous => ({ ...previous, [branch]: false }))
      event.target.value = ''
    }
  }

  const combinedItems = useMemo(() => {
    const stockMap = new Map<string, {
      slno: string
      itemCode: string
      barcode: string
      kalpettaStock: number
      batheryStock: number
    }>()

    kalpettaItems.forEach(item => {
      stockMap.set(item.itemCode, {
        slno: item.slno,
        itemCode: item.itemCode,
        barcode: item.barcode,
        kalpettaStock: item.stock,
        batheryStock: 0,
      })
    })

    batheryItems.forEach(item => {
      const existing = stockMap.get(item.itemCode)
      if (existing) {
        existing.batheryStock = item.stock
        if (!existing.barcode && item.barcode) existing.barcode = item.barcode
      } else {
        stockMap.set(item.itemCode, {
          slno: item.slno,
          itemCode: item.itemCode,
          barcode: item.barcode,
          kalpettaStock: 0,
          batheryStock: item.stock,
        })
      }
    })

    return Array.from(stockMap.values())
      .map(item => ({
        ...item,
        totalStock: item.kalpettaStock + item.batheryStock,
      }))
      .sort((a, b) => {
        // Numeric-aware ascending Sl No sort; blank values go to the end.
        const slNoA = a.slno.trim()
        const slNoB = b.slno.trim()

        if (!slNoA && !slNoB) {
          return a.itemCode.localeCompare(b.itemCode, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        }
        if (!slNoA) return 1
        if (!slNoB) return -1

        return (
          slNoA.localeCompare(slNoB, undefined, {
            numeric: true,
            sensitivity: 'base',
          }) ||
          a.itemCode.localeCompare(b.itemCode, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        )
      })
  }, [kalpettaItems, batheryItems])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return combinedItems
    return combinedItems.filter(item =>
      [item.slno, item.itemCode, item.barcode].some(value =>
        value.toLowerCase().includes(query),
      ),
    )
  }, [combinedItems, search])

  return (
    <div className="price-page">
      <div className="price-container">
        <div className="price-header">
          <div>
            <h1>Stock View</h1>
            <p>Upload branch stock CSV files and compare available quantities.</p>
          </div>
          <div className="stock-refresh-area">
            <button
              type="button"
              className="price-upload-button"
              onClick={() => void refreshAll()}
              disabled={loading || uploading.kalpetta || uploading.bathery}
            >
              {loading ? 'Refreshing...' : 'Refresh Stock'}
            </button>
          </div>
        </div>

        <div className="stock-branch-grid">
          {BRANCHES.map(branch => {
            const isKalpetta = branch === 'kalpetta'
            const branchName = isKalpetta ? 'Kalpetta' : 'Bathery'
            const inputRef = isKalpetta ? kalpettaInputRef : batheryInputRef

            return (
              <section className="stock-branch-card" key={branch}>
                <div className="stock-branch-heading">
                  <h2>{branchName}</h2>
                  <span className="stock-branch-count">
                    {(isKalpetta ? kalpettaItems : batheryItems).length} items
                  </span>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  hidden
                  onChange={event => void handleFileChange(branch, event)}
                />
                <button
                  type="button"
                  className="price-upload-button stock-branch-upload"
                  onClick={() => openFilePicker(branch)}
                  disabled={uploading[branch]}
                >
                  {uploading[branch] ? 'Uploading...' : `Upload ${branchName} CSV`}
                </button>
                <p className="stock-updated-at">
                  Last updated on: <strong>{formatUpdatedAt(updatedAt[branch])}</strong>
                </p>
                <p className="stock-upload-hint">Select one or more CSV files for this branch.</p>
              </section>
            )
          })}
        </div>

        {message && (
          <div className={messageType === 'success' ? 'price-success-message' : 'price-error-message'}>
            {message}
          </div>
        )}

        <div className="price-toolbar">
          <div className="price-search">
            <input
              type="text"
              placeholder="Search item code or barcode..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <div className="price-count">
            {filteredItems.length} / {combinedItems.length} Items
          </div>
        </div>

        <div className="price-table-container">
          {loading ? (
            <div className="price-empty">Loading stock data...</div>
          ) : (
            <table className="price-table stock-table">
              <thead>
                <tr>
                  <th>Sl No</th>
                  <th>Item Code</th>
                  <th>Barcode</th>
                  <th>Kalpetta Stock</th>
                  <th>Bathery Stock</th>
                  <th>Total Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length > 0 ? (
                  filteredItems.map((item, index) => (
                    <tr key={item.itemCode}>
                      <td>{item.slno || index + 1}</td>
                      <td className="stock-item-code">{item.itemCode}</td>
                      <td>{item.barcode || '—'}</td>
                      <td>{formatStock(item.kalpettaStock)}</td>
                      <td>{formatStock(item.batheryStock)}</td>
                      <td className="stock-total">{formatStock(item.totalStock)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="price-no-data">
                      {search
                        ? 'No matching items found.'
                        : 'No stock data available. Upload CSV files for a branch.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        .stock-branch-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-bottom: 22px;
        }
        .stock-branch-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 20px;
          min-width: 0;
        }
        .stock-branch-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .stock-branch-heading h2 {
          margin: 0;
          color: #1e293b;
          font-size: 19px;
        }
        .stock-branch-count {
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
        }
        .stock-branch-upload { width: 100%; }
        .stock-updated-at {
          margin: 14px 0 4px;
          color: #64748b;
          font-size: 13px;
        }
        .stock-updated-at strong { color: #334155; }
        .stock-upload-hint {
          margin: 0;
          color: #94a3b8;
          font-size: 12px;
        }
        .stock-table { min-width: 850px; }
        .stock-item-code { font-weight: 600; color: #1e293b !important; }
        .stock-total { font-weight: 700; color: #1d4ed8 !important; }
        @media (max-width: 768px) {
          .stock-branch-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

export default StockView
