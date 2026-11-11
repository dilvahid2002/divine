
import { useEffect, useRef, useState, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore'

import Papa from 'papaparse'

import { db } from '../../firebase'

import './PriceView.css'


interface PriceItem {
  slno: string
  itemcode: string
  itemname: string
  retailRate: string
  pRate: string
  silverAgency: string
  goldenAgency: string
  platinumAgency: string
  mrp: string
  batchCode: string
  active: string
}

type CSVRow = Record<string, string>

const CSV_HEADERS = [
  'slno',
  'itemcode',
  'itemname',
  'Retail Rate',
  'PRate',
  'Silver Agency',
  'Golden Agnecy',
  'Platinum Agency',
  'MRP',
  'BatchCode',
  'Active',
]

const BATCH_SIZE = 450


function PriceView() {

  const navigate = useNavigate()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<PriceItem[]>([])

  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [message, setMessage] = useState('')

  const [messageType, setMessageType] =
    useState<'success' | 'error'>('success')


  // =========================================
  // FETCH PRICE LIST
  // =========================================

  const fetchPriceList = async () => {

    try {

      setLoading(true)

      const snapshot = await getDocs(
        collection(db, 'priceList'),
      )

      const fetchedItems: PriceItem[] =
        snapshot.docs.map(document => {

          const data = document.data()

          return {
            slno: String(data.slno ?? ''),
            itemcode: String(data.itemcode ?? ''),
            itemname: String(data.itemname ?? ''),
            retailRate: String(data.retailRate ?? ''),
            pRate: String(data.pRate ?? ''),
            silverAgency: String(data.silverAgency ?? ''),
            goldenAgency: String(data.goldenAgency ?? ''),
            platinumAgency: String(data.platinumAgency ?? ''),
            mrp: String(data.mrp ?? ''),
            batchCode: String(data.batchCode ?? ''),
            active: String(data.active ?? ''),
          }

        })

      setItems(fetchedItems)

    } catch (error) {

      console.error('Error fetching price list:', error)

      setMessage('Failed to load price list.')

      setMessageType('error')

    } finally {

      setLoading(false)

    }

  }


  useEffect(() => {

    fetchPriceList()

  }, [])


  // =========================================
  // OPEN FILE BROWSER
  // =========================================

  const handleUploadClick = () => {

    fileInputRef.current?.click()

  }


  // =========================================
  // CONVERT CSV ROW
  // =========================================

  const convertCSVRow = (row: CSVRow): PriceItem => {

    return {

      slno: String(row['slno'] ?? '').trim(),

      itemcode: String(row['itemcode'] ?? '').trim(),

      itemname: String(row['itemname'] ?? '').trim(),

      retailRate: String(row['Retail Rate'] ?? '').trim(),

      pRate: String(row['PRate'] ?? '').trim(),

      silverAgency: String(row['Silver Agency'] ?? '').trim(),

      goldenAgency: String(row['Golden Agnecy'] ?? '').trim(),

      platinumAgency: String(row['Platinum Agency'] ?? '').trim(),

      mrp: String(row['MRP'] ?? '').trim(),

      batchCode: String(row['BatchCode'] ?? '').trim(),

      active: String(row['Active'] ?? '').trim(),

    }

  }


  // =========================================
  // DELETE EXISTING PRICE LIST
  // =========================================

  const deleteExistingData = async () => {

    const snapshot = await getDocs(
      collection(db, 'priceList'),
    )

    const oldDocuments = snapshot.docs

    for (
      let i = 0;
      i < oldDocuments.length;
      i += BATCH_SIZE
    ) {

      const batch = writeBatch(db)

      const chunk = oldDocuments.slice(
        i,
        i + BATCH_SIZE,
      )

      chunk.forEach(document => {

        batch.delete(document.ref)

      })

      await batch.commit()

    }

  }


  // =========================================
  // SAVE NEW PRICE LIST
  // =========================================

  const saveNewData = async (newItems: PriceItem[]) => {

    for (
      let i = 0;
      i < newItems.length;
      i += BATCH_SIZE
    ) {

      const batch = writeBatch(db)

      const chunk = newItems.slice(
        i,
        i + BATCH_SIZE,
      )

      chunk.forEach(item => {

        const newDocument = doc(
          collection(db, 'priceList'),
        )

        batch.set(newDocument, item)

      })

      await batch.commit()

    }

  }


  // =========================================
  // UPLOAD CSV
  // =========================================

  const handleFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {

    const file = event.target.files?.[0]

    if (!file) return

    setMessage('')


    if (!file.name.toLowerCase().endsWith('.csv')) {

      setMessage('Only CSV files are allowed.')

      setMessageType('error')

      event.target.value = ''

      return

    }


    try {

      setSaving(true)


      // Parse CSV

      const parsed = await new Promise<Papa.ParseResult<CSVRow>>(
        (resolve, reject) => {

          Papa.parse<CSVRow>(file, {

            header: true,

            skipEmptyLines: 'greedy',

            transformHeader: header => header.trim(),

            complete: resolve,

            error: reject,

          })

        },
      )


      if (parsed.errors.length > 0) {

        throw new Error(
          parsed.errors[0].message,
        )

      }


      // Validate CSV columns

      const actualHeaders = parsed.meta.fields ?? []

      const missingHeaders = CSV_HEADERS.filter(
        header => !actualHeaders.includes(header),
      )


      if (missingHeaders.length > 0) {

        throw new Error(
          `Missing CSV columns: ${missingHeaders.join(', ')}`,
        )

      }


      // Convert CSV data

      const newItems = parsed.data.map(convertCSVRow)


      if (newItems.length === 0) {

        throw new Error('The CSV file contains no data.')

      }


      // Replace old data

      await deleteExistingData()

      await saveNewData(newItems)


      // Refresh UI

      await fetchPriceList()


      setMessage(
        `Successfully uploaded ${newItems.length} price records. Previous data has been replaced.`,
      )

      setMessageType('success')


    } catch (error) {

      console.error('CSV upload error:', error)

      setMessage(
        error instanceof Error
          ? `Upload failed: ${error.message}`
          : 'Failed to upload price list.',
      )

      setMessageType('error')

      await fetchPriceList()

    } finally {

      setSaving(false)

      event.target.value = ''

    }

  }


  // =========================================
  // SEARCH FILTER + SORT BY SL NO
  // =========================================

  const filteredItems = items
    .filter(item => {

      const searchValue = search.toLowerCase().trim()

      if (!searchValue) return true

      return Object.values(item).some(value =>
        value.toLowerCase().includes(searchValue),
      )

    })
    .sort((a, b) => {

      const slA = a.slno.trim()
      const slB = b.slno.trim()

      // Empty Sl No goes to bottom

      if (!slA && !slB) return 0

      if (!slA) return 1

      if (!slB) return -1

      // Numeric-aware ascending sorting

      return slA.localeCompare(slB, undefined, {
        numeric: true,
        sensitivity: 'base',
      })

    })


  // =========================================
  // RENDER
  // =========================================

  return (

    <div className="price-page">

      <div className="price-container">


        {/* HEADER */}

        <div className="price-header">

          <div>

            <h1>Price List</h1>

            <p>
              Upload and manage product pricing data.
            </p>

          </div>


          <div className="price-upload-area">

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              hidden
            />

            <button
              type="button"
              className="price-upload-button"
              onClick={handleUploadClick}
              disabled={saving}
            >

              {saving
                ? 'Uploading...'
                : 'Upload Data'}

            </button>

          </div>


          {/* STOCK REPORT BUTTON */}

          <button
            type="button"
            className="add-item-button"
            onClick={() =>
              navigate('/departments/StockView')
            }
          >
            Stock Report
          </button>

        </div>


        {/* MESSAGE */}

        {message && (

          <div
            className={
              messageType === 'success'
                ? 'price-success-message'
                : 'price-error-message'
            }
          >

            {message}

          </div>

        )}


        {/* SEARCH */}

        <div className="price-toolbar">

          <div className="price-search">

            <input
              type="text"
              placeholder="Search batch code, name..."
              value={search}
              onChange={event =>
                setSearch(event.target.value)
              }
            />

          </div>


          <div className="price-count">

            {filteredItems.length} / {items.length} Items

          </div>

        </div>


        {/* PRICE TABLE */}

        <div className="price-table-container">

          {loading ? (

            <div className="price-empty">

              Loading price list...

            </div>

          ) : (

            <table className="price-table">

              <thead>

                <tr>

                  <th>Sl No</th>

                  <th>Batch Code</th>

                  <th>Name</th>

                  <th>Retail Rate</th>

                  <th>PRate</th>

                  <th>Silver Agency</th>

                  <th>Golden Agency</th>

                  <th>Platinum Agency</th>

                  <th>MRP</th>

                </tr>

              </thead>


              <tbody>

                {filteredItems.length > 0 ? (

                  filteredItems.map((item, index) => (

                    <tr
                      key={`${item.slno}-${item.batchCode}-${index}`}
                    >

                      <td>{item.slno}</td>

                      <td>{item.batchCode}</td>

                      <td className="price-item-name">
                        {item.itemname}
                      </td>

                      <td>{item.retailRate}</td>

                      <td>{item.pRate}</td>

                      <td>{item.silverAgency}</td>

                      <td>{item.goldenAgency}</td>

                      <td>{item.platinumAgency}</td>

                      <td>{item.mrp}</td>

                    </tr>

                  ))

                ) : (

                  <tr>

                    <td
                      colSpan={9}
                      className="price-no-data"
                    >

                      {search
                        ? 'No matching items found.'
                        : 'No price data available. Upload a CSV file.'}

                    </td>

                  </tr>

                )}

              </tbody>

            </table>

          )}

        </div>


      </div>

    </div>

  )

}


export default PriceView
