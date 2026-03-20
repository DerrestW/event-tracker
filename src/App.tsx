import {
  startTransition,
  useDeferredValue,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import './App.css'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  blankEventDetail,
  blankInvoice,
  contractStatusOptions,
  eventStatuses,
  expenseCategoryLabels,
  todoProgressOptions,
} from './defaults'
import {
  createEvent as createEventRecord,
  deleteDocument as deleteDocumentRecord,
  deleteEventRecord,
  getAnalytics as fetchAnalytics,
  getEvent as fetchEvent,
  getReminders as fetchReminders,
  listEvents,
  updateEventRecord,
  uploadDocument as uploadDocumentRecord,
} from './dataClient'
import type {
  AnalyticsSnapshot,
  ContractStatus,
  ContactEntry,
  EventDetail,
  EventInfo,
  EventSummary,
  ExpenseCategory,
  ExpenseItem,
  FlightEntry,
  HotelEntry,
  InvoiceDraft,
  InvoiceLineItem,
  PaymentEntry,
  ReminderItem,
  RentalEntry,
  RevenueItem,
  StaffEntry,
  TimeSlotEntry,
  TodoEntry,
  TodoProgress,
} from './types'

type TabKey =
  | 'analytics'
  | 'pnl'
  | 'payments'
  | 'contacts'
  | 'todos'
  | 'eventInfo'
  | 'staffing'
  | 'documents'
  | 'compare'

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'analytics', label: 'Analytics' },
  { key: 'pnl', label: 'P&L' },
  { key: 'payments', label: 'Payment Breakdown' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'todos', label: 'To-Do' },
  { key: 'eventInfo', label: 'Event Info' },
  { key: 'staffing', label: 'Staffing' },
  { key: 'documents', label: 'Documents' },
  { key: 'compare', label: 'Compare Events' },
]

const categoryOrder: ExpenseCategory[] = [
  'equipment',
  'workers',
  'lodgingTransportation',
  'insurance',
  'marketing',
  'tubes',
  'misc',
]

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
})

const createTempId = () => -Math.floor(Date.now() + Math.random() * 100000)

const parseNumber = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeMoneyInput = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const [whole = '', ...rest] = cleaned.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '')
  const decimal = rest.length ? `.${rest.join('').slice(0, 2)}` : ''

  return `${normalizedWhole}${decimal}`
}

const formatCurrency = (value: number) => currencyFormatter.format(value || 0)
const formatPercent = (value: number) => percentFormatter.format(value || 0)
const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0)

const calculateTotals = (event: EventDetail) => {
  const extraRevenue = event.revenueItems.reduce((sum, item) => sum + item.amount, 0)
  const totalExpenses = event.expenseItems.reduce((sum, item) => sum + item.amount, 0)
  const totalRevenue = event.contractRevenue + extraRevenue

  return {
    totalRevenue,
    totalExpenses,
    netReturn: totalRevenue - totalExpenses,
  }
}

const rowClass = (index: number) => (index % 2 === 0 ? 'sheet-row' : 'sheet-row alt')

const todayDate = () => new Date().toISOString().slice(0, 10)

function buildCalendarFile({
  title,
  description,
  date,
}: {
  title: string
  description: string
  date: string
}) {
  const day = date.replace(/-/g, '')
  const nextDay = new Date(`${date}T00:00:00`)
  nextDay.setDate(nextDay.getDate() + 1)
  const dayAfter = nextDay.toISOString().slice(0, 10).replace(/-/g, '')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Urban Slide Tracker//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${dayAfter}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT9H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n')
}

function downloadCalendarEntry(input: { title: string; description: string; date: string; filename: string }) {
  const blob = new Blob([buildCalendarFile(input)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = input.filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const invoiceLineTotal = (item: InvoiceLineItem) => item.quantity * item.rate
const invoiceTotal = (invoice: InvoiceDraft) =>
  invoice.lineItems.reduce((sum, item) => sum + invoiceLineTotal(item), 0)

function App() {
  const [summaries, setSummaries] = useState<EventSummary[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null)
  const [reminders, setReminders] = useState<ReminderItem[]>([])
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('analytics')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('Ready')
  const [documentType, setDocumentType] = useState('Insurance')
  const [documentNotes, setDocumentNotes] = useState('')
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [analyticsCategoryFilter, setAnalyticsCategoryFilter] = useState<'all' | ExpenseCategory>('all')
  const [analyticsExpenseSearch, setAnalyticsExpenseSearch] = useState('')

  const filteredSummaries = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase()
    if (!term) {
      return summaries
    }

    return summaries.filter((event) =>
      [event.name, event.city, event.state, event.status]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [deferredSearch, summaries])

  const loadEvent = useCallback(async (eventId: number) => {
    const detail = await fetchEvent(eventId)
    startTransition(() => {
      setSelectedId(eventId)
      setSelectedEvent(detail)
      setDirty(false)
      setDocumentFile(null)
      setDocumentNotes('')
      setDocumentType('Insurance')
    })
  }, [])

  const loadAnalytics = useCallback(async () => {
    try {
      const snapshot = await fetchAnalytics()
      setAnalytics(snapshot)
      setSummaries(snapshot.comparison)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load analytics.')
    }
  }, [])

  const loadReminders = useCallback(async () => {
    try {
      const items = await fetchReminders()
      setReminders(items)
    } catch {
      // Keep reminder fetch silent if it fails.
    }
  }, [])

  const loadEvents = useCallback(async (nextSelectedId?: number | null) => {
    setLoading(true)
    try {
      const data = await listEvents()
      setSummaries(data)

      const targetId =
        nextSelectedId ?? (selectedId && data.some((item) => item.id === selectedId) ? selectedId : null)

      if (targetId) {
        await loadEvent(targetId)
      } else {
        setSelectedId(null)
        setSelectedEvent(null)
      }

      await loadAnalytics()
      await loadReminders()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load events.')
    } finally {
      setLoading(false)
    }
  }, [loadAnalytics, loadEvent, loadReminders, selectedId])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadReminders()
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [loadReminders])

  const saveEvent = useCallback(async (nextEvent?: EventDetail, showSavedMessage = true) => {
    const event = nextEvent ?? selectedEvent
    if (!event) {
      return
    }

    setSaving(true)
    try {
      const saved = await updateEventRecord(event)

      setSelectedEvent(saved)
      setDirty(false)
      setMessage(showSavedMessage ? 'Changes saved.' : 'Auto-saved.')

      await loadAnalytics()
      await loadReminders()
      const nextSummaries = await listEvents()
      setSummaries(nextSummaries)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save event.')
    } finally {
      setSaving(false)
    }
  }, [loadAnalytics, loadReminders, selectedEvent])

  const handleSelectEvent = useCallback(async (eventId: number) => {
    if (eventId === selectedId) {
      return
    }

    if (selectedEvent && dirty) {
      await saveEvent(selectedEvent, false)
    }

    try {
      setLoading(true)
      await loadEvent(eventId)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to open event.')
    } finally {
      setLoading(false)
    }
  }, [dirty, loadEvent, saveEvent, selectedEvent, selectedId])

  useEffect(() => {
    if (notificationPermission !== 'granted' || typeof Notification === 'undefined') {
      return
    }

    reminders.forEach((reminder) => {
      const storageKey = `urban-slide-reminder:${reminder.id}:${reminder.dueDate}:${reminder.status}`
      if (window.localStorage.getItem(storageKey)) {
        return
      }

      const prefix = reminder.status === 'overdue' ? 'Overdue' : 'Due today'
      const notification = new Notification(`${prefix}: ${reminder.title}`, {
        body: `${reminder.eventName} • ${reminder.dueDate}`,
      })
      notification.onclick = () => {
        void handleSelectEvent(reminder.eventId)
        window.focus()
      }
      window.localStorage.setItem(storageKey, 'sent')
    })
  }, [handleSelectEvent, notificationPermission, reminders])

  async function handleCreateEvent() {
    try {
      setSaving(true)
      const created = await createEventRecord()
      const nextSummaries = await listEvents()
      setSummaries(nextSummaries)
      setSelectedId(created.id)
      setSelectedEvent(created)
      setActiveTab('analytics')
      setDirty(false)
      setMessage('New event created.')
      await loadAnalytics()
      await loadReminders()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create event.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteEvent() {
    if (!selectedEvent) {
      return
    }

    const confirmed = window.confirm(`Delete "${selectedEvent.name || 'Untitled Event'}"?`)
    if (!confirmed) {
      return
    }

    try {
      setSaving(true)
      await deleteEventRecord(selectedEvent.id)
      setMessage('Event deleted.')
      await loadEvents(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete event.')
    } finally {
      setSaving(false)
    }
  }

  function handleGoHome() {
    setSelectedId(null)
    setSelectedEvent(null)
    setActiveTab('analytics')
    setDirty(false)
    setMessage('Viewing yearly totals.')
  }

  async function handleDocumentUpload() {
    if (!selectedEvent || !documentFile) {
      setMessage('Choose a file before uploading.')
      return
    }

    try {
      setSaving(true)
      const document = await uploadDocumentRecord(selectedEvent.id, documentType, documentNotes, documentFile)
      setSelectedEvent({
        ...selectedEvent,
        documents: [document, ...selectedEvent.documents],
      })
      setDocumentFile(null)
      setDocumentNotes('')
      setMessage('Document uploaded.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload document.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteDocument(documentId: number) {
    if (!selectedEvent) {
      return
    }

    try {
      setSaving(true)
      await deleteDocumentRecord(selectedEvent.id, documentId)
      setSelectedEvent({
        ...selectedEvent,
        documents: selectedEvent.documents.filter((item) => item.id !== documentId),
      })
      setMessage('Document removed.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove document.')
    } finally {
      setSaving(false)
    }
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') {
      setMessage('This browser does not support notifications.')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    setMessage(permission === 'granted' ? 'Notifications enabled.' : 'Notifications were not enabled.')
  }

  function exportEventWorkbook() {
    if (!selectedEvent) {
      return
    }

    const workbook = XLSX.utils.book_new()

    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['Event', selectedEvent.name],
      ['City', selectedEvent.city],
      ['State', selectedEvent.state],
      ['Start Date', selectedEvent.startDate],
      ['End Date', selectedEvent.endDate],
      ['Status', selectedEvent.status],
      ['Contract Revenue', selectedEvent.contractRevenue],
      ['Total Revenue', calculateTotals(selectedEvent).totalRevenue],
      ['Total Expenses', calculateTotals(selectedEvent).totalExpenses],
      ['Net Return', calculateTotals(selectedEvent).netReturn],
    ])
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

    const pnlRows = [
      ['Revenue Item', 'Amount'],
      ['Contract Revenue', selectedEvent.contractRevenue],
      ...selectedEvent.revenueItems.map((item) => [item.label, item.amount]),
      [],
      ['Expense Category', 'Description', 'Amount', 'Notes'],
      ...selectedEvent.expenseItems.map((item) => [
        expenseCategoryLabels[item.category],
        item.label,
        item.amount,
        item.notes,
      ]),
    ]
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(pnlRows), 'P&L')

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        selectedEvent.payments.map((item) => ({
          Description: item.description,
          DueDate: item.dueDate,
          AmountOwed: item.amountOwed,
          AmountPaid: item.amountPaid,
          Remaining: item.amountOwed - item.amountPaid,
          PaidDate: item.paidDate,
          CheckNumber: item.checkNumber,
          Notes: item.notes,
        })),
      ),
      'Payments',
    )

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(selectedEvent.contacts),
      'Contacts',
    )

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(selectedEvent.todos),
      'ToDo',
    )

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(selectedEvent.staff),
      'Staffing',
    )

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Invoice Number', selectedEvent.invoice.invoiceNumber],
        ['Invoice Date', selectedEvent.invoice.invoiceDate],
        ['Due Date', selectedEvent.invoice.dueDate],
        ['Payment Terms', selectedEvent.invoice.paymentTerms],
        ['Sender Name', selectedEvent.invoice.senderName],
        ['Sender Address', selectedEvent.invoice.senderAddress],
        ['Sender Email', selectedEvent.invoice.senderEmail],
        ['Sender Phone', selectedEvent.invoice.senderPhone],
        ['Bill To Name', selectedEvent.invoice.billToName],
        ['Bill To Address', selectedEvent.invoice.billToAddress],
        ['Remit To', selectedEvent.invoice.remitTo],
        ['Notes', selectedEvent.invoice.notes],
        [],
        ['Description', 'Quantity', 'Rate', 'Amount'],
        ...selectedEvent.invoice.lineItems.map((item) => [
          item.description,
          item.quantity,
          item.rate,
          invoiceLineTotal(item),
        ]),
        [],
        ['Invoice Total', invoiceTotal(selectedEvent.invoice)],
      ]),
      'Invoice',
    )

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Overview', selectedEvent.info.overview],
        ['Payment Schedule Notes', selectedEvent.info.paymentScheduleNotes],
        ['Meeting Location', selectedEvent.info.meetingLocation],
        ['Staffing Breakdown', selectedEvent.info.staffingBreakdown],
        ['Parking Notes', selectedEvent.info.parkingNotes],
        ['Water Usage', selectedEvent.info.waterUsageNotes],
        ['City Responsibilities', selectedEvent.info.cityResponsibilities],
        ['Weather Notes', selectedEvent.info.weatherNotes],
        ['General Notes', selectedEvent.info.generalNotes],
      ]),
      'Event Info',
    )

    XLSX.writeFile(workbook, `${selectedEvent.name || 'event-workbook'}.xlsx`)
    setMessage('Excel export downloaded.')
  }

  function exportEventPdf() {
    if (!selectedEvent) {
      return
    }

    const doc = new jsPDF()
    const totals = calculateTotals(selectedEvent)

    doc.setFontSize(18)
    doc.text(selectedEvent.name || 'Event Workbook', 14, 18)
    doc.setFontSize(11)
    doc.text(`Location: ${[selectedEvent.city, selectedEvent.state].filter(Boolean).join(', ') || 'TBD'}`, 14, 28)
    doc.text(`Dates: ${[selectedEvent.startDate, selectedEvent.endDate].filter(Boolean).join(' to ') || 'TBD'}`, 14, 35)
    doc.text(`Status: ${selectedEvent.status}`, 14, 42)

    autoTable(doc, {
      startY: 50,
      head: [['Metric', 'Value']],
      body: [
        ['Contract Revenue', formatCurrency(selectedEvent.contractRevenue)],
        ['Total Revenue', formatCurrency(totals.totalRevenue)],
        ['Total Expenses', formatCurrency(totals.totalExpenses)],
        ['Net Return', formatCurrency(totals.netReturn)],
      ],
    })

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
        ? ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 10
        : 92,
      head: [['Category', 'Description', 'Amount']],
      body: selectedEvent.expenseItems.map((item) => [
        expenseCategoryLabels[item.category],
        item.label,
        formatCurrency(item.amount),
      ]),
    })

    doc.addPage()
    autoTable(doc, {
      head: [['Payment', 'Due Date', 'Owed', 'Paid', 'Check #']],
      body: selectedEvent.payments.map((item) => [
        item.description,
        item.dueDate,
        formatCurrency(item.amountOwed),
        formatCurrency(item.amountPaid),
        item.checkNumber,
      ]),
    })

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ? ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40) + 10
        : 110,
      head: [['Task', 'Owner', 'Progress', 'Due Date']],
      body: selectedEvent.todos.map((item) => [item.task, item.owner, item.progress, item.dueDate]),
    })

    doc.save(`${selectedEvent.name || 'event-workbook'}.pdf`)
    setMessage('PDF export downloaded.')
  }

  function updateEvent(patch: Partial<EventDetail>) {
    setSelectedEvent((current) => {
      if (!current) {
        return current
      }

      return { ...current, ...patch }
    })
    setDirty(true)
  }

  function updateInfo(patch: Partial<EventInfo>) {
    setSelectedEvent((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        info: {
          ...current.info,
          ...patch,
        },
      }
    })
    setDirty(true)
  }

  function updateInvoice(patch: Partial<InvoiceDraft>) {
    setSelectedEvent((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        invoice: {
          ...current.invoice,
          ...patch,
        },
      }
    })
    setDirty(true)
  }

  function replaceRows<K extends keyof EventDetail>(key: K, value: EventDetail[K]) {
    updateEvent({ [key]: value } as Partial<EventDetail>)
  }

  function updateRevenueRow(id: number, patch: Partial<RevenueItem>) {
    if (!selectedEvent) return
    replaceRows('revenueItems', selectedEvent.revenueItems.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateExpenseRow(id: number, patch: Partial<ExpenseItem>) {
    if (!selectedEvent) return
    replaceRows('expenseItems', selectedEvent.expenseItems.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updatePaymentRow(id: number, patch: Partial<PaymentEntry>) {
    if (!selectedEvent) return
    replaceRows('payments', selectedEvent.payments.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateContactRow(id: number, patch: Partial<ContactEntry>) {
    if (!selectedEvent) return
    replaceRows('contacts', selectedEvent.contacts.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateTodoRow(id: number, patch: Partial<TodoEntry>) {
    if (!selectedEvent) return
    replaceRows('todos', selectedEvent.todos.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateFlightRow(id: number, patch: Partial<FlightEntry>) {
    if (!selectedEvent) return
    replaceRows('flights', selectedEvent.flights.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateHotelRow(id: number, patch: Partial<HotelEntry>) {
    if (!selectedEvent) return
    replaceRows('hotels', selectedEvent.hotels.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateRentalRow(id: number, patch: Partial<RentalEntry>) {
    if (!selectedEvent) return
    replaceRows('rentals', selectedEvent.rentals.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateTimeSlotRow(id: number, patch: Partial<TimeSlotEntry>) {
    if (!selectedEvent) return
    replaceRows('timeSlots', selectedEvent.timeSlots.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateStaffRow(id: number, patch: Partial<StaffEntry>) {
    if (!selectedEvent) return
    replaceRows('staff', selectedEvent.staff.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function updateInvoiceLineRow(id: number, patch: Partial<InvoiceLineItem>) {
    if (!selectedEvent) return
    updateInvoice({
      lineItems: selectedEvent.invoice.lineItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })
  }

  async function handleInvoiceLogoUpload(file: File | null) {
    if (!file) {
      updateInvoice({ logoDataUrl: '' })
      return
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

    updateInvoice({ logoDataUrl: dataUrl })
    setMessage('Invoice logo added.')
  }

  function exportInvoicePdf() {
    if (!selectedEvent) {
      return
    }

    const { invoice } = selectedEvent
    const doc = new jsPDF()
    let currentY = 18
    const lineItemRows = invoice.lineItems.filter((item) => item.description.trim() || item.quantity || item.rate)
    const safeLineItems = lineItemRows.length ? lineItemRows : blankInvoice.lineItems
    const total = safeLineItems.reduce((sum, item) => sum + invoiceLineTotal(item), 0)

    if (invoice.logoDataUrl) {
      try {
        const imageFormat = invoice.logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'
        doc.addImage(invoice.logoDataUrl, imageFormat, 14, 14, 36, 20)
        currentY = 40
      } catch {
        currentY = 18
      }
    }

    doc.setFontSize(22)
    doc.text('INVOICE', 196, 20, { align: 'right' })
    doc.setFontSize(10)
    doc.text(`Invoice #: ${invoice.invoiceNumber || selectedEvent.id}`, 196, 28, { align: 'right' })
    doc.text(`Invoice Date: ${invoice.invoiceDate || todayDate()}`, 196, 34, { align: 'right' })
    doc.text(`Due Date: ${invoice.dueDate || 'TBD'}`, 196, 40, { align: 'right' })

    doc.setFontSize(13)
    doc.text(invoice.senderName || 'The Urban Slide', 14, currentY)
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(invoice.senderAddress || '', 70), 14, currentY + 7)
    doc.text(doc.splitTextToSize([invoice.senderEmail, invoice.senderPhone].filter(Boolean).join(' • '), 70), 14, currentY + 19)

    doc.setFontSize(11)
    doc.text('Bill To', 126, currentY)
    doc.setFontSize(10)
    doc.text(invoice.billToName || 'Client Name', 126, currentY + 7)
    doc.text(doc.splitTextToSize(invoice.billToAddress || '', 68), 126, currentY + 13)

    doc.setDrawColor(220, 226, 229)
    doc.line(14, currentY + 28, 196, currentY + 28)

    autoTable(doc, {
      startY: currentY + 34,
      head: [['Description', 'Qty', 'Rate', 'Amount']],
      body: safeLineItems.map((item) => [
        item.description || 'Line Item',
        String(item.quantity || 0),
        formatCurrency(item.rate),
        formatCurrency(invoiceLineTotal(item)),
      ]),
      foot: [['', '', 'Total', formatCurrency(total)]],
      headStyles: { fillColor: [15, 118, 110] },
      footStyles: { fillColor: [16, 67, 61] },
    })

    const nextY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? currentY + 92) + 12
    doc.setFontSize(11)
    doc.text('Payment Terms', 14, nextY)
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(invoice.paymentTerms || blankInvoice.paymentTerms, 82), 14, nextY + 7)

    doc.setFontSize(11)
    doc.text('Remit To', 110, nextY)
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(invoice.remitTo || invoice.senderAddress || '', 86), 110, nextY + 7)

    if (invoice.notes) {
      const notesY = Math.max(nextY + 30, nextY + 14)
      doc.setFontSize(11)
      doc.text('Notes', 14, notesY)
      doc.setFontSize(10)
      doc.text(doc.splitTextToSize(invoice.notes, 182), 14, notesY + 7)
    }

    doc.save(`${selectedEvent.name || 'event'}-invoice.pdf`)
    setMessage('Invoice PDF downloaded.')
  }

  const detail = selectedEvent ?? blankEventDetail()
  const totals = calculateTotals(detail)
  const currentInvoiceTotal = invoiceTotal(detail.invoice)
  const currentYear = new Date().getFullYear()
  const filteredExpenseItems = useMemo(() => {
    const searchTerm = analyticsExpenseSearch.trim().toLowerCase()

    return detail.expenseItems.filter((item) => {
      if (analyticsCategoryFilter !== 'all' && item.category !== analyticsCategoryFilter) {
        return false
      }

      if (!searchTerm) {
        return true
      }

      return [item.label, item.notes, expenseCategoryLabels[item.category]]
        .join(' ')
        .toLowerCase()
        .includes(searchTerm)
    })
  }, [analyticsCategoryFilter, analyticsExpenseSearch, detail.expenseItems])
  const filteredExpenseTotal = filteredExpenseItems.reduce((sum, item) => sum + item.amount, 0)
  const filteredSpendBreakdown = categoryOrder
    .map((category) => {
      const amount = filteredExpenseItems
        .filter((item) => item.category === category)
        .reduce((sum, item) => sum + item.amount, 0)

      return {
        category,
        label: expenseCategoryLabels[category],
        amount,
        percent: filteredExpenseTotal ? amount / filteredExpenseTotal : 0,
      }
    })
    .filter((item) => item.amount > 0)
    .sort((left, right) => right.amount - left.amount)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div>
            <p className="eyebrow">Urban Slide</p>
            <h1>Event Workbook</h1>
          </div>
          <button className="primary-button" onClick={handleCreateEvent} disabled={saving}>
            New Event
          </button>
        </div>

        <label className="search-box">
          <span>Search events</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Lynchburg, Austin, Hampton..." />
        </label>

        <div className="reminder-panel">
          <div className="panel-header compact">
            <h3>Due Now</h3>
            <button className="secondary-button compact-button" onClick={() => void enableNotifications()}>
              {notificationPermission === 'granted' ? 'Notifications On' : 'Enable Alerts'}
            </button>
          </div>
          <div className="reminder-list">
            {reminders.slice(0, 6).map((item) => (
              <button key={item.id} className="reminder-item" onClick={() => void handleSelectEvent(item.eventId)}>
                <strong>{item.title}</strong>
                <span>{item.eventName}</span>
                <em>{item.status === 'overdue' ? 'Overdue' : 'Due today'} • {item.dueDate}</em>
              </button>
            ))}
            {!reminders.length && <div className="empty-panel">No due reminders right now.</div>}
          </div>
        </div>

        <div className="event-list">
          {filteredSummaries.map((event) => (
            <button
              key={event.id}
              className={event.id === selectedId ? 'event-card active' : 'event-card'}
              onClick={() => void handleSelectEvent(event.id)}
            >
              <div className="event-card-head">
                <strong>{event.name || 'Untitled Event'}</strong>
                <span className="status-pill">{event.status}</span>
              </div>
              <p>{[event.city, event.state].filter(Boolean).join(', ') || 'Location TBD'}</p>
              <p>{[event.startDate, event.endDate].filter(Boolean).join(' to ') || 'Dates TBD'}</p>
              <div className="event-metrics">
                <span>Revenue {formatCurrency(event.totalRevenue)}</span>
                <span>Net {formatCurrency(event.netReturn)}</span>
              </div>
            </button>
          ))}

          {!filteredSummaries.length && <div className="empty-panel">No events match this search yet.</div>}
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Local-first workbook</p>
            <h2>{selectedEvent ? detail.name || 'Event Workspace' : 'Yearly Totals'}</h2>
            <p className="header-meta">
              {loading ? 'Loading...' : message}
              {dirty ? ' Unsaved edits.' : ''}
            </p>
          </div>

          <div className="header-actions">
            <button className="secondary-button" onClick={handleGoHome}>
              Home
            </button>
            <button className="secondary-button" onClick={exportEventWorkbook} disabled={!selectedEvent}>
              Export Excel
            </button>
            <button className="secondary-button" onClick={exportEventPdf} disabled={!selectedEvent}>
              Export PDF
            </button>
            <button className="secondary-button" onClick={exportInvoicePdf} disabled={!selectedEvent}>
              Invoice PDF
            </button>
            <button className="ghost-button" onClick={handleDeleteEvent} disabled={!selectedEvent || saving}>
              Delete Event
            </button>
            <button className="primary-button" onClick={() => void saveEvent()} disabled={!selectedEvent || saving || !dirty}>
              {saving ? 'Saving...' : 'Save Event'}
            </button>
          </div>
        </header>

        {!selectedEvent ? (
          <div className="stack">
            <section className="summary-strip analytics-strip">
              <SummaryCard label={`${currentYear} Revenue`} value={formatCurrency(analytics?.yearlyRevenue ?? 0)} />
              <SummaryCard label={`${currentYear} Expenses`} value={formatCurrency(analytics?.yearlyExpenses ?? 0)} />
              <SummaryCard label="All-Time Revenue" value={formatCurrency(analytics?.allTimeRevenue ?? 0)} />
              <SummaryCard label="All-Time Expenses" value={formatCurrency(analytics?.allTimeExpenses ?? 0)} />
            </section>

            <TableSection title="Revenue And Expenses By Year">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Events</th>
                    <th>Total Revenue</th>
                    <th>Total Expenses</th>
                    <th>Net Return</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.yearlyBreakdown ?? []).map((year, index) => (
                    <tr key={year.year} className={rowClass(index)}>
                      <td>{year.year}</td>
                      <td>{year.eventCount}</td>
                      <td>{formatCurrency(year.totalRevenue)}</td>
                      <td>{formatCurrency(year.totalExpenses)}</td>
                      <td>{formatCurrency(year.netReturn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(analytics?.yearlyBreakdown?.length) && (
                <div className="empty-panel light-empty">
                  Add start or end dates to events and they will roll into the matching year here.
                </div>
              )}
            </TableSection>

            <TableSection title="Event By Event Comparison">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Location</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th>Total Revenue</th>
                    <th>Total Expenses</th>
                    <th>Net Return</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.comparison ?? summaries).map((event, index) => (
                    <tr key={event.id} className={rowClass(index)}>
                      <td>{event.name}</td>
                      <td>{[event.city, event.state].filter(Boolean).join(', ')}</td>
                      <td>{[event.startDate, event.endDate].filter(Boolean).join(' to ')}</td>
                      <td>{event.status}</td>
                      <td>{formatCurrency(event.totalRevenue)}</td>
                      <td>{formatCurrency(event.totalExpenses)}</td>
                      <td>{formatCurrency(event.netReturn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableSection>
          </div>
        ) : (
          <>
            <section className="overview-grid">
              <label>
                <span>Event name</span>
                <input value={detail.name} onChange={(event) => updateEvent({ name: event.target.value })} />
              </label>
              <label>
                <span>City</span>
                <input value={detail.city} onChange={(event) => updateEvent({ city: event.target.value })} />
              </label>
              <label>
                <span>State</span>
                <input value={detail.state} onChange={(event) => updateEvent({ state: event.target.value })} />
              </label>
              <label>
                <span>Status</span>
                <select value={detail.status} onChange={(event) => updateEvent({ status: event.target.value as EventDetail['status'] })}>
                  {eventStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Start date</span>
                <input type="date" value={detail.startDate} onChange={(event) => updateEvent({ startDate: event.target.value })} />
              </label>
              <label>
                <span>End date</span>
                <input type="date" value={detail.endDate} onChange={(event) => updateEvent({ endDate: event.target.value })} />
              </label>
            </section>

            <section className="summary-strip">
              <SummaryCard label="Contract Revenue" value={formatCurrency(detail.contractRevenue)} />
              <SummaryCard label="Total Revenue" value={formatCurrency(totals.totalRevenue)} />
              <SummaryCard label="Total Expenses" value={formatCurrency(totals.totalExpenses)} />
              <SummaryCard label="Net Return" value={formatCurrency(totals.netReturn)} accent />
            </section>

            <nav className="tab-bar wide-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={tab.key === activeTab ? 'tab-button active' : 'tab-button'}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <section className="sheet">
              {activeTab === 'pnl' && (
                <div className="stack">
                  <div className="sheet-panel">
                    <div className="panel-header">
                      <h3>Revenue</h3>
                    </div>
                    <div className="split-grid">
                      <label>
                        <span>Contract Revenue</span>
                        <MoneyInput value={detail.contractRevenue} onValueChange={(value) => updateEvent({ contractRevenue: value })} />
                      </label>
                      <label>
                        <span>Meeting Location</span>
                        <input value={detail.info.meetingLocation} onChange={(event) => updateInfo({ meetingLocation: event.target.value })} />
                      </label>
                    </div>

                    <table className="sheet-table">
                      <thead>
                        <tr>
                          <th>Extra Revenue Item</th>
                          <th>Amount</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.revenueItems.map((item, index) => (
                          <tr key={item.id} className={rowClass(index)}>
                            <td>
                              <input value={item.label} onChange={(event) => updateRevenueRow(item.id, { label: event.target.value })} />
                            </td>
                            <td>
                              <MoneyInput value={item.amount} onValueChange={(value) => updateRevenueRow(item.id, { amount: value })} />
                            </td>
                            <td>
                              <button
                                className="row-button"
                                onClick={() =>
                                  replaceRows(
                                    'revenueItems',
                                    detail.revenueItems.filter((entry) => entry.id !== item.id),
                                  )
                                }
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        replaceRows('revenueItems', [
                          ...detail.revenueItems,
                          { id: createTempId(), label: '', amount: 0 },
                        ])
                      }
                    >
                      Add Revenue Row
                    </button>
                  </div>

                  {categoryOrder.map((category) => {
                    const rows = detail.expenseItems.filter((item) => item.category === category)
                    const subtotal = rows.reduce((sum, item) => sum + item.amount, 0)

                    return (
                      <div key={category} className="sheet-panel">
                        <div className="panel-header">
                          <h3>{expenseCategoryLabels[category]}</h3>
                          <strong>{formatCurrency(subtotal)}</strong>
                        </div>
                        <table className="sheet-table">
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th>Amount</th>
                              <th>Notes</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((item, index) => (
                              <tr key={item.id} className={rowClass(index)}>
                                <td>
                                  <input value={item.label} onChange={(event) => updateExpenseRow(item.id, { label: event.target.value })} />
                                </td>
                                <td>
                                  <MoneyInput value={item.amount} onValueChange={(value) => updateExpenseRow(item.id, { amount: value })} />
                                </td>
                                <td>
                                  <input value={item.notes} onChange={(event) => updateExpenseRow(item.id, { notes: event.target.value })} />
                                </td>
                                <td>
                                  <button
                                    className="row-button"
                                    onClick={() =>
                                      replaceRows(
                                        'expenseItems',
                                        detail.expenseItems.filter((entry) => entry.id !== item.id),
                                      )
                                    }
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          className="secondary-button"
                          onClick={() =>
                            replaceRows('expenseItems', [
                              ...detail.expenseItems,
                              { id: createTempId(), category, label: '', amount: 0, notes: '' },
                            ])
                          }
                        >
                          Add {expenseCategoryLabels[category]} Row
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {activeTab === 'payments' && (
                <div className="stack">
                  <TableSection title="Payment Breakdown">
                    <table className="sheet-table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th>Due Date</th>
                          <th>Amount Owed</th>
                          <th>Paid Amount</th>
                          <th>Remainder</th>
                          <th>Paid Date</th>
                          <th>Check #</th>
                          <th>What was it for?</th>
                          <th>Calendar</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payments.map((item, index) => (
                          <tr key={item.id} className={rowClass(index)}>
                            <td><input value={item.description} onChange={(event) => updatePaymentRow(item.id, { description: event.target.value })} /></td>
                            <td><input type="date" value={item.dueDate} onChange={(event) => updatePaymentRow(item.id, { dueDate: event.target.value })} /></td>
                            <td><MoneyInput value={item.amountOwed} onValueChange={(value) => updatePaymentRow(item.id, { amountOwed: value })} /></td>
                            <td><MoneyInput value={item.amountPaid} onValueChange={(value) => updatePaymentRow(item.id, { amountPaid: value })} /></td>
                            <td><output>{formatCurrency(item.amountOwed - item.amountPaid)}</output></td>
                            <td><input type="date" value={item.paidDate} onChange={(event) => updatePaymentRow(item.id, { paidDate: event.target.value })} /></td>
                            <td><input value={item.checkNumber} onChange={(event) => updatePaymentRow(item.id, { checkNumber: event.target.value })} /></td>
                            <td><input value={item.notes} onChange={(event) => updatePaymentRow(item.id, { notes: event.target.value })} /></td>
                            <td>
                              <button
                                className="row-button"
                                disabled={!item.dueDate}
                                onClick={() =>
                                  downloadCalendarEntry({
                                    title: `${detail.name}: ${item.description || 'Payment due'}`,
                                    description: `Payment reminder for ${detail.name}. Check number: ${item.checkNumber || 'TBD'}. ${item.notes}`,
                                    date: item.dueDate || todayDate(),
                                    filename: `${detail.name}-payment-${item.id}.ics`,
                                  })
                                }
                              >
                                Add
                              </button>
                            </td>
                            <td>
                              <button
                                className="row-button"
                                onClick={() =>
                                  replaceRows('payments', detail.payments.filter((entry) => entry.id !== item.id))
                                }
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="invoice-actions">
                      <button
                        className="secondary-button"
                        onClick={() =>
                          replaceRows('payments', [
                            ...detail.payments,
                            {
                              id: createTempId(),
                              description: '',
                              dueDate: '',
                              amountOwed: 0,
                              amountPaid: 0,
                              paidDate: '',
                              checkNumber: '',
                              notes: '',
                            },
                          ])
                        }
                      >
                        Add Payment Row
                      </button>
                    </div>
                  </TableSection>

                  <div className="sheet-panel">
                    <div className="panel-header">
                      <h3>Invoice Builder</h3>
                      <div className="invoice-actions">
                        <strong>{formatCurrency(currentInvoiceTotal)}</strong>
                        <button className="primary-button" onClick={exportInvoicePdf}>
                          Generate Invoice PDF
                        </button>
                      </div>
                    </div>

                    <div className="invoice-grid">
                      <label>
                        <span>Invoice Number</span>
                        <input value={detail.invoice.invoiceNumber} onChange={(event) => updateInvoice({ invoiceNumber: event.target.value })} />
                      </label>
                      <label>
                        <span>Invoice Date</span>
                        <input type="date" value={detail.invoice.invoiceDate} onChange={(event) => updateInvoice({ invoiceDate: event.target.value })} />
                      </label>
                      <label>
                        <span>Due Date</span>
                        <input type="date" value={detail.invoice.dueDate} onChange={(event) => updateInvoice({ dueDate: event.target.value })} />
                      </label>
                      <label>
                        <span>Payment Terms</span>
                        <input value={detail.invoice.paymentTerms} onChange={(event) => updateInvoice({ paymentTerms: event.target.value })} placeholder="Due on receipt, Net 15, 50% deposit..." />
                      </label>
                      <label>
                        <span>From / Business Name</span>
                        <input value={detail.invoice.senderName} onChange={(event) => updateInvoice({ senderName: event.target.value })} />
                      </label>
                      <label>
                        <span>Business Email</span>
                        <input value={detail.invoice.senderEmail} onChange={(event) => updateInvoice({ senderEmail: event.target.value })} />
                      </label>
                      <label>
                        <span>Business Phone</span>
                        <input value={detail.invoice.senderPhone} onChange={(event) => updateInvoice({ senderPhone: event.target.value })} />
                      </label>
                      <label>
                        <span>Charge To Name</span>
                        <input value={detail.invoice.billToName} onChange={(event) => updateInvoice({ billToName: event.target.value })} />
                      </label>
                      <label className="full-span">
                        <span>Business Address</span>
                        <textarea value={detail.invoice.senderAddress} onChange={(event) => updateInvoice({ senderAddress: event.target.value })} />
                      </label>
                      <label className="full-span">
                        <span>Charge To Address</span>
                        <textarea value={detail.invoice.billToAddress} onChange={(event) => updateInvoice({ billToAddress: event.target.value })} />
                      </label>
                      <label className="full-span">
                        <span>Remit To / Payment Instructions</span>
                        <textarea value={detail.invoice.remitTo} onChange={(event) => updateInvoice({ remitTo: event.target.value })} placeholder="Mail checks to, ACH instructions, Venmo, wire info..." />
                      </label>
                      <label className="full-span">
                        <span>Notes</span>
                        <textarea value={detail.invoice.notes} onChange={(event) => updateInvoice({ notes: event.target.value })} placeholder="Thank you, event name, deposit language, late fee note..." />
                      </label>
                      <label className="full-span">
                        <span>Logo</span>
                        <input type="file" accept="image/*" onChange={(event) => void handleInvoiceLogoUpload(event.target.files?.[0] ?? null)} />
                      </label>
                    </div>

                    {detail.invoice.logoDataUrl ? (
                      <div className="logo-preview-wrap">
                        <img className="logo-preview" src={detail.invoice.logoDataUrl} alt="Invoice logo preview" />
                        <button className="row-button" onClick={() => updateInvoice({ logoDataUrl: '' })}>
                          Remove Logo
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <TableSection title="Invoice Line Items">
                    <table className="sheet-table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th>Quantity</th>
                          <th>Rate</th>
                          <th>Amount</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.invoice.lineItems.map((item, index) => (
                          <tr key={item.id} className={rowClass(index)}>
                            <td>
                              <input value={item.description} onChange={(event) => updateInvoiceLineRow(item.id, { description: event.target.value })} />
                            </td>
                            <td>
                              <MoneyInput value={item.quantity} onValueChange={(value) => updateInvoiceLineRow(item.id, { quantity: value })} />
                            </td>
                            <td>
                              <MoneyInput value={item.rate} onValueChange={(value) => updateInvoiceLineRow(item.id, { rate: value })} />
                            </td>
                            <td><output>{formatCurrency(invoiceLineTotal(item))}</output></td>
                            <td>
                              <button
                                className="row-button"
                                onClick={() =>
                                  updateInvoice({
                                    lineItems: detail.invoice.lineItems.filter((entry) => entry.id !== item.id),
                                  })
                                }
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="invoice-actions">
                      <button
                        className="secondary-button"
                        onClick={() =>
                          updateInvoice({
                            lineItems: [
                              ...detail.invoice.lineItems,
                              { id: createTempId(), description: '', quantity: 1, rate: 0 },
                            ],
                          })
                        }
                      >
                        Add Line Item
                      </button>
                    </div>
                  </TableSection>
                </div>
              )}

              {activeTab === 'contacts' && (
                <TableSection title="Contacts">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Company</th>
                        <th>Role</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Quote / Info</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.contacts.map((item, index) => (
                        <tr key={item.id} className={rowClass(index)}>
                          <td><input value={item.name} onChange={(event) => updateContactRow(item.id, { name: event.target.value })} /></td>
                          <td><input value={item.company} onChange={(event) => updateContactRow(item.id, { company: event.target.value })} /></td>
                          <td><input value={item.role} onChange={(event) => updateContactRow(item.id, { role: event.target.value })} /></td>
                          <td><input value={item.phone} onChange={(event) => updateContactRow(item.id, { phone: event.target.value })} /></td>
                          <td><input value={item.email} onChange={(event) => updateContactRow(item.id, { email: event.target.value })} /></td>
                          <td><input value={item.quoteInfo} onChange={(event) => updateContactRow(item.id, { quoteInfo: event.target.value })} /></td>
                          <td><input value={item.notes} onChange={(event) => updateContactRow(item.id, { notes: event.target.value })} /></td>
                          <td>
                            <button className="row-button" onClick={() => replaceRows('contacts', detail.contacts.filter((entry) => entry.id !== item.id))}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      replaceRows('contacts', [
                        ...detail.contacts,
                        { id: createTempId(), name: '', company: '', role: '', phone: '', email: '', quoteInfo: '', notes: '' },
                      ])
                    }
                  >
                    Add Contact Row
                  </button>
                </TableSection>
              )}

              {activeTab === 'todos' && (
                <TableSection title="To-Do">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Done</th>
                        <th>Task</th>
                        <th>Owner</th>
                        <th>Progress</th>
                        <th>Due Date</th>
                        <th>Notes</th>
                        <th>Calendar</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.todos.map((item, index) => (
                        <tr key={item.id} className={rowClass(index)}>
                          <td>
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={(event) =>
                                updateTodoRow(item.id, {
                                  completed: event.target.checked,
                                  progress: event.target.checked ? 'Done' : 'Not Started',
                                })
                              }
                            />
                          </td>
                          <td><input value={item.task} onChange={(event) => updateTodoRow(item.id, { task: event.target.value })} /></td>
                          <td><input value={item.owner} onChange={(event) => updateTodoRow(item.id, { owner: event.target.value })} /></td>
                          <td>
                            <select
                              value={item.progress}
                              onChange={(event) =>
                                updateTodoRow(item.id, {
                                  progress: event.target.value as TodoProgress,
                                  completed: event.target.value === 'Done',
                                })
                              }
                            >
                              {todoProgressOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td><input type="date" value={item.dueDate} onChange={(event) => updateTodoRow(item.id, { dueDate: event.target.value })} /></td>
                          <td><input value={item.notes} onChange={(event) => updateTodoRow(item.id, { notes: event.target.value })} /></td>
                          <td>
                            <button
                              className="row-button"
                              disabled={!item.dueDate}
                              onClick={() =>
                                downloadCalendarEntry({
                                  title: `${detail.name}: ${item.task || 'To-do reminder'}`,
                                  description: `Owner: ${item.owner || 'TBD'}\nProgress: ${item.progress}\n${item.notes}`,
                                  date: item.dueDate || todayDate(),
                                  filename: `${detail.name}-todo-${item.id}.ics`,
                                })
                              }
                            >
                              Add
                            </button>
                          </td>
                          <td>
                            <button className="row-button" onClick={() => replaceRows('todos', detail.todos.filter((entry) => entry.id !== item.id))}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      replaceRows('todos', [
                        ...detail.todos,
                        {
                          id: createTempId(),
                          task: '',
                          owner: '',
                          notes: '',
                          progress: 'Not Started',
                          dueDate: '',
                          completed: false,
                        },
                      ])
                    }
                  >
                    Add To-Do Row
                  </button>
                </TableSection>
              )}

              {activeTab === 'eventInfo' && (
                <div className="stack">
                  <div className="sheet-panel">
                    <div className="panel-header">
                      <h3>Core Notes</h3>
                    </div>
                    <div className="notes-grid">
                      <label>
                        <span>Overview</span>
                        <textarea value={detail.info.overview} onChange={(event) => updateInfo({ overview: event.target.value })} />
                      </label>
                      <label>
                        <span>Payment Schedule Notes</span>
                        <textarea value={detail.info.paymentScheduleNotes} onChange={(event) => updateInfo({ paymentScheduleNotes: event.target.value })} />
                      </label>
                      <label>
                        <span>Meeting Location</span>
                        <textarea value={detail.info.meetingLocation} onChange={(event) => updateInfo({ meetingLocation: event.target.value })} />
                      </label>
                      <label>
                        <span>Staffing Breakdown</span>
                        <textarea value={detail.info.staffingBreakdown} onChange={(event) => updateInfo({ staffingBreakdown: event.target.value })} />
                      </label>
                      <label>
                        <span>Parking Notes</span>
                        <textarea value={detail.info.parkingNotes} onChange={(event) => updateInfo({ parkingNotes: event.target.value })} />
                      </label>
                      <label>
                        <span>Water Usage</span>
                        <textarea value={detail.info.waterUsageNotes} onChange={(event) => updateInfo({ waterUsageNotes: event.target.value })} />
                      </label>
                      <label>
                        <span>City Responsibilities</span>
                        <textarea value={detail.info.cityResponsibilities} onChange={(event) => updateInfo({ cityResponsibilities: event.target.value })} />
                      </label>
                      <label>
                        <span>Weather Notes</span>
                        <textarea value={detail.info.weatherNotes} onChange={(event) => updateInfo({ weatherNotes: event.target.value })} />
                      </label>
                      <label className="full-span">
                        <span>General Notes</span>
                        <textarea value={detail.info.generalNotes} onChange={(event) => updateInfo({ generalNotes: event.target.value })} />
                      </label>
                    </div>
                  </div>

                  <EditableInfoTable
                    title="Flights"
                    headers={['Type', 'Person', 'Confirmation #', 'Time', 'Date', 'Notes']}
                    rows={detail.flights}
                    onAdd={() =>
                      replaceRows('flights', [...detail.flights, { id: createTempId(), tripType: '', person: '', confirmation: '', flightTime: '', flightDate: '', notes: '' }])
                    }
                    renderRow={(item, index) => (
                      <tr key={item.id} className={rowClass(index)}>
                        <td><input value={item.tripType} onChange={(event) => updateFlightRow(item.id, { tripType: event.target.value })} /></td>
                        <td><input value={item.person} onChange={(event) => updateFlightRow(item.id, { person: event.target.value })} /></td>
                        <td><input value={item.confirmation} onChange={(event) => updateFlightRow(item.id, { confirmation: event.target.value })} /></td>
                        <td><input value={item.flightTime} onChange={(event) => updateFlightRow(item.id, { flightTime: event.target.value })} /></td>
                        <td><input value={item.flightDate} onChange={(event) => updateFlightRow(item.id, { flightDate: event.target.value })} /></td>
                        <td><input value={item.notes} onChange={(event) => updateFlightRow(item.id, { notes: event.target.value })} /></td>
                        <td><button className="row-button" onClick={() => replaceRows('flights', detail.flights.filter((entry) => entry.id !== item.id))}>Remove</button></td>
                      </tr>
                    )}
                  />

                  <EditableInfoTable
                    title="Hotels"
                    headers={['Date', 'Confirmation #', 'Hotel', 'Notes']}
                    rows={detail.hotels}
                    onAdd={() => replaceRows('hotels', [...detail.hotels, { id: createTempId(), dateLabel: '', confirmationNumber: '', hotelName: '', notes: '' }])}
                    renderRow={(item, index) => (
                      <tr key={item.id} className={rowClass(index)}>
                        <td><input value={item.dateLabel} onChange={(event) => updateHotelRow(item.id, { dateLabel: event.target.value })} /></td>
                        <td><input value={item.confirmationNumber} onChange={(event) => updateHotelRow(item.id, { confirmationNumber: event.target.value })} /></td>
                        <td><input value={item.hotelName} onChange={(event) => updateHotelRow(item.id, { hotelName: event.target.value })} /></td>
                        <td><input value={item.notes} onChange={(event) => updateHotelRow(item.id, { notes: event.target.value })} /></td>
                        <td><button className="row-button" onClick={() => replaceRows('hotels', detail.hotels.filter((entry) => entry.id !== item.id))}>Remove</button></td>
                      </tr>
                    )}
                  />

                  <EditableInfoTable
                    title="Rental Equipment"
                    headers={['Vendor', 'Drop Off Address', 'Mobile', 'Office', 'Confirmation #', 'Email', 'Notes']}
                    rows={detail.rentals}
                    onAdd={() =>
                      replaceRows('rentals', [...detail.rentals, { id: createTempId(), vendor: '', dropOffAddress: '', mobile: '', office: '', confirmation: '', email: '', notes: '' }])
                    }
                    renderRow={(item, index) => (
                      <tr key={item.id} className={rowClass(index)}>
                        <td><input value={item.vendor} onChange={(event) => updateRentalRow(item.id, { vendor: event.target.value })} /></td>
                        <td><input value={item.dropOffAddress} onChange={(event) => updateRentalRow(item.id, { dropOffAddress: event.target.value })} /></td>
                        <td><input value={item.mobile} onChange={(event) => updateRentalRow(item.id, { mobile: event.target.value })} /></td>
                        <td><input value={item.office} onChange={(event) => updateRentalRow(item.id, { office: event.target.value })} /></td>
                        <td><input value={item.confirmation} onChange={(event) => updateRentalRow(item.id, { confirmation: event.target.value })} /></td>
                        <td><input value={item.email} onChange={(event) => updateRentalRow(item.id, { email: event.target.value })} /></td>
                        <td><input value={item.notes} onChange={(event) => updateRentalRow(item.id, { notes: event.target.value })} /></td>
                        <td><button className="row-button" onClick={() => replaceRows('rentals', detail.rentals.filter((entry) => entry.id !== item.id))}>Remove</button></td>
                      </tr>
                    )}
                  />

                  <EditableInfoTable
                    title="Event Time Slots"
                    headers={['Day / Shift', 'Headcount', 'Details', 'Hours', 'Notes']}
                    rows={detail.timeSlots}
                    onAdd={() =>
                      replaceRows('timeSlots', [...detail.timeSlots, { id: createTempId(), dayLabel: '', headcount: '', details: '', hours: '', notes: '' }])
                    }
                    renderRow={(item, index) => (
                      <tr key={item.id} className={rowClass(index)}>
                        <td><input value={item.dayLabel} onChange={(event) => updateTimeSlotRow(item.id, { dayLabel: event.target.value })} /></td>
                        <td><input value={item.headcount} onChange={(event) => updateTimeSlotRow(item.id, { headcount: event.target.value })} /></td>
                        <td><input value={item.details} onChange={(event) => updateTimeSlotRow(item.id, { details: event.target.value })} /></td>
                        <td><input value={item.hours} onChange={(event) => updateTimeSlotRow(item.id, { hours: event.target.value })} /></td>
                        <td><input value={item.notes} onChange={(event) => updateTimeSlotRow(item.id, { notes: event.target.value })} /></td>
                        <td><button className="row-button" onClick={() => replaceRows('timeSlots', detail.timeSlots.filter((entry) => entry.id !== item.id))}>Remove</button></td>
                      </tr>
                    )}
                  />
                </div>
              )}

              {activeTab === 'staffing' && (
                <TableSection title="Staffing, Contracts, And Invites">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Assigned Shift</th>
                        <th>Arrival</th>
                        <th>Departure</th>
                        <th>Flight / Travel</th>
                        <th>Contract Status</th>
                        <th>Contract Due</th>
                        <th>Contract Notes</th>
                        <th>Invite Notes</th>
                        <th>Shift Invite</th>
                        <th>Contract Invite</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.staff.map((item, index) => (
                        <tr key={item.id} className={rowClass(index)}>
                          <td><input value={item.name} onChange={(event) => updateStaffRow(item.id, { name: event.target.value })} /></td>
                          <td><input value={item.role} onChange={(event) => updateStaffRow(item.id, { role: event.target.value })} /></td>
                          <td><input value={item.email} onChange={(event) => updateStaffRow(item.id, { email: event.target.value })} /></td>
                          <td><input value={item.phone} onChange={(event) => updateStaffRow(item.id, { phone: event.target.value })} /></td>
                          <td><input value={item.assignedShift} onChange={(event) => updateStaffRow(item.id, { assignedShift: event.target.value })} /></td>
                          <td><input type="date" value={item.arrivalDate} onChange={(event) => updateStaffRow(item.id, { arrivalDate: event.target.value })} /></td>
                          <td><input type="date" value={item.departureDate} onChange={(event) => updateStaffRow(item.id, { departureDate: event.target.value })} /></td>
                          <td><input value={item.flightSummary} onChange={(event) => updateStaffRow(item.id, { flightSummary: event.target.value })} /></td>
                          <td>
                            <select value={item.contractStatus} onChange={(event) => updateStaffRow(item.id, { contractStatus: event.target.value as ContractStatus })}>
                              {contractStatusOptions.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td><input type="date" value={item.contractDueDate} onChange={(event) => updateStaffRow(item.id, { contractDueDate: event.target.value })} /></td>
                          <td><input value={item.contractNotes} onChange={(event) => updateStaffRow(item.id, { contractNotes: event.target.value })} /></td>
                          <td><input value={item.inviteNotes} onChange={(event) => updateStaffRow(item.id, { inviteNotes: event.target.value })} /></td>
                          <td>
                            <button
                              className="row-button"
                              disabled={!item.arrivalDate}
                              onClick={() =>
                                downloadCalendarEntry({
                                  title: `${detail.name}: ${item.name || 'Staff'} shift / travel`,
                                  description: `Role: ${item.role}\nShift: ${item.assignedShift}\nTravel: ${item.flightSummary}\n${item.inviteNotes}`,
                                  date: item.arrivalDate || todayDate(),
                                  filename: `${detail.name}-staff-shift-${item.id}.ics`,
                                })
                              }
                            >
                              Add
                            </button>
                          </td>
                          <td>
                            <button
                              className="row-button"
                              disabled={!item.contractDueDate}
                              onClick={() =>
                                downloadCalendarEntry({
                                  title: `${detail.name}: ${item.name || 'Staff'} contract due`,
                                  description: `Contract status: ${item.contractStatus}\n${item.contractNotes}`,
                                  date: item.contractDueDate || todayDate(),
                                  filename: `${detail.name}-staff-contract-${item.id}.ics`,
                                })
                              }
                            >
                              Add
                            </button>
                          </td>
                          <td>
                            <button className="row-button" onClick={() => replaceRows('staff', detail.staff.filter((entry) => entry.id !== item.id))}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      replaceRows('staff', [
                        ...detail.staff,
                        {
                          id: createTempId(),
                          name: '',
                          role: '',
                          email: '',
                          phone: '',
                          assignedShift: '',
                          arrivalDate: '',
                          departureDate: '',
                          flightSummary: '',
                          contractStatus: 'Not Sent',
                          contractDueDate: '',
                          contractNotes: '',
                          inviteNotes: '',
                        },
                      ])
                    }
                  >
                    Add Staff Row
                  </button>
                </TableSection>
              )}

              {activeTab === 'documents' && (
                <div className="stack">
                  <div className="sheet-panel">
                    <div className="panel-header">
                      <h3>Upload Documents</h3>
                    </div>
                    <div className="document-upload-grid">
                      <label>
                        <span>Document Type</span>
                        <input value={documentType} onChange={(event) => setDocumentType(event.target.value)} />
                      </label>
                      <label>
                        <span>Notes</span>
                        <input value={documentNotes} onChange={(event) => setDocumentNotes(event.target.value)} placeholder="Insurance policy, signed contract, map..." />
                      </label>
                      <label className="full-span">
                        <span>File</span>
                        <input type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} />
                      </label>
                    </div>
                    <button className="primary-button" onClick={() => void handleDocumentUpload()} disabled={saving || !documentFile}>
                      Upload Document
                    </button>
                  </div>

                  <TableSection title="Attached Documents">
                    <table className="sheet-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Name</th>
                          <th>Notes</th>
                          <th>Uploaded</th>
                          <th>Size</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.documents.map((item, index) => (
                          <tr key={item.id} className={rowClass(index)}>
                            <td>{item.documentType}</td>
                            <td><a href={item.url} target="_blank" rel="noreferrer">{item.originalName}</a></td>
                            <td>{item.notes}</td>
                            <td>{item.uploadedAt}</td>
                            <td>{Math.round(item.size / 1024)} KB</td>
                            <td>
                              <button className="row-button" onClick={() => void handleDeleteDocument(item.id)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableSection>
                </div>
              )}

              {activeTab === 'analytics' && (
                <div className="stack">
                  <div className="sheet-panel">
                    <div className="panel-header">
                      <h3>Expense BI View</h3>
                      <strong>{formatCurrency(filteredExpenseTotal || totals.totalExpenses)}</strong>
                    </div>

                    <div className="analytics-filter-grid">
                      <label>
                        <span>Expense Category</span>
                        <select
                          value={analyticsCategoryFilter}
                          onChange={(event) => setAnalyticsCategoryFilter(event.target.value as 'all' | ExpenseCategory)}
                        >
                          <option value="all">All Categories</option>
                          {categoryOrder.map((category) => (
                            <option key={category} value={category}>
                              {expenseCategoryLabels[category]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Find Expense</span>
                        <input
                          value={analyticsExpenseSearch}
                          onChange={(event) => setAnalyticsExpenseSearch(event.target.value)}
                          placeholder="Hotel, insurance, TT, Amazon..."
                        />
                      </label>
                    </div>

                    <div className="analytics-mini-strip">
                      <article className="mini-card">
                        <span>Filtered Expenses</span>
                        <strong>{formatCurrency(filteredExpenseTotal)}</strong>
                      </article>
                      <article className="mini-card">
                        <span>Matching Rows</span>
                        <strong>{filteredExpenseItems.length}</strong>
                      </article>
                      <article className="mini-card">
                        <span>Share Of Event Spend</span>
                        <strong>{formatPercent(totals.totalExpenses ? filteredExpenseTotal / totals.totalExpenses : 0)}</strong>
                      </article>
                    </div>

                    <div className="bi-visual-grid">
                      <div className="viz-card">
                        <h4>Category Spend Mix</h4>
                        <div className="spend-list">
                          {filteredSpendBreakdown.map((item) => (
                            <div key={item.category} className="spend-item">
                              <div className="spend-head">
                                <strong>{item.label}</strong>
                                <span>{formatCurrency(item.amount)} • {formatPercent(item.percent)}</span>
                              </div>
                              <div className="spend-bar">
                                <div className="spend-fill" style={{ width: `${Math.max(item.percent * 100, 4)}%` }} />
                              </div>
                            </div>
                          ))}
                          {!filteredSpendBreakdown.length && <div className="empty-panel light-empty">No matching expenses for this filter.</div>}
                        </div>
                      </div>

                      <div className="viz-card">
                        <h4>Largest Expense Rows</h4>
                        <div className="top-expense-list">
                          {filteredExpenseItems
                            .slice()
                            .sort((left, right) => right.amount - left.amount)
                            .slice(0, 6)
                            .map((item) => {
                              const share = filteredExpenseTotal ? item.amount / filteredExpenseTotal : 0
                              return (
                                <div key={item.id} className="top-expense-item">
                                  <div>
                                    <strong>{item.label || 'Untitled Expense'}</strong>
                                    <span>{expenseCategoryLabels[item.category]}</span>
                                  </div>
                                  <div className="top-expense-metric">
                                    <strong>{formatCurrency(item.amount)}</strong>
                                    <em>{formatPercent(share)}</em>
                                  </div>
                                  <div className="top-expense-track">
                                    <div className="top-expense-fill" style={{ width: `${Math.max(share * 100, 4)}%` }} />
                                  </div>
                                </div>
                              )
                            })}
                          {!filteredExpenseItems.length && <div className="empty-panel light-empty">Add expenses to generate visuals.</div>}
                        </div>
                      </div>
                    </div>

                    <div className="sheet-panel inner-panel">
                      <div className="panel-header">
                        <h3>Filtered Expense Table</h3>
                        <strong>{formatCompactCurrency(filteredExpenseTotal)}</strong>
                      </div>
                      <table className="sheet-table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Description</th>
                            <th>Amount</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredExpenseItems.map((item, index) => (
                            <tr key={item.id} className={rowClass(index)}>
                              <td>{expenseCategoryLabels[item.category]}</td>
                              <td>{item.label}</td>
                              <td>{formatCurrency(item.amount)}</td>
                              <td>{item.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!filteredExpenseItems.length && <div className="empty-panel light-empty">No expenses match the current analytics filter.</div>}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'compare' && (
                <TableSection title="Event By Event Comparison">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Location</th>
                        <th>Dates</th>
                        <th>Status</th>
                        <th>Total Revenue</th>
                        <th>Total Expenses</th>
                        <th>Net Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.comparison ?? summaries).map((event, index) => (
                        <tr key={event.id} className={rowClass(index)}>
                          <td>{event.name}</td>
                          <td>{[event.city, event.state].filter(Boolean).join(', ')}</td>
                          <td>{[event.startDate, event.endDate].filter(Boolean).join(' to ')}</td>
                          <td>{event.status}</td>
                          <td>{formatCurrency(event.totalRevenue)}</td>
                          <td>{formatCurrency(event.totalExpenses)}</td>
                          <td>{formatCurrency(event.netReturn)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableSection>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function SummaryCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <article className={accent ? 'summary-card accent' : 'summary-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function TableSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sheet-panel">
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function EditableInfoTable<T>({
  title,
  headers,
  rows,
  onAdd,
  renderRow,
}: {
  title: string
  headers: string[]
  rows: T[]
  onAdd: () => void
  renderRow: (row: T, index: number) => ReactNode
}) {
  return (
    <div className="sheet-panel">
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <table className="sheet-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>{rows.map((row, index) => renderRow(row, index))}</tbody>
      </table>
      <button className="secondary-button" onClick={onAdd}>
        Add {title} Row
      </button>
    </div>
  )
}

function MoneyInput({
  value,
  onValueChange,
}: {
  value: number
  onValueChange: (value: number) => void
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value === 0 ? '0' : String(value)}
      onChange={(event) => {
        const normalized = normalizeMoneyInput(event.target.value)
        onValueChange(parseNumber(normalized))
      }}
    />
  )
}

export default App
