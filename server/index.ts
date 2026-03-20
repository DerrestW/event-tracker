import express from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

type EventStatus = 'Planning' | 'Contracted' | 'In Progress' | 'Complete'
type TodoProgress = 'Not Started' | 'In Process' | 'Done' | 'Waiting On Stakeholder'
type ExpenseCategory =
  | 'equipment'
  | 'workers'
  | 'lodgingTransportation'
  | 'insurance'
  | 'marketing'
  | 'tubes'
  | 'misc'

interface EventInfo {
  overview: string
  paymentScheduleNotes: string
  meetingLocation: string
  staffingBreakdown: string
  parkingNotes: string
  waterUsageNotes: string
  cityResponsibilities: string
  weatherNotes: string
  generalNotes: string
}

interface InvoiceDraft {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  paymentTerms: string
  senderName: string
  senderAddress: string
  senderEmail: string
  senderPhone: string
  billToName: string
  billToAddress: string
  remitTo: string
  notes: string
  logoDataUrl: string
  lineItems: Array<{
    id: number
    description: string
    quantity: number
    rate: number
  }>
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const storageRoot = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : rootDir
const dataDir = path.join(storageRoot, 'data')
const uploadsDir = path.join(storageRoot, 'uploads')
const distDir = path.join(rootDir, 'dist')

fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(uploadsDir, { recursive: true })

const database = new DatabaseSync(path.join(dataDir, 'urban-slide-tracker.sqlite'))
database.exec('PRAGMA foreign_keys = ON')

database.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Planning',
    contract_revenue REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS event_info (
    event_id INTEGER PRIMARY KEY,
    overview TEXT NOT NULL DEFAULT '',
    payment_schedule_notes TEXT NOT NULL DEFAULT '',
    meeting_location TEXT NOT NULL DEFAULT '',
    staffing_breakdown TEXT NOT NULL DEFAULT '',
    parking_notes TEXT NOT NULL DEFAULT '',
    water_usage_notes TEXT NOT NULL DEFAULT '',
    city_responsibilities TEXT NOT NULL DEFAULT '',
    weather_notes TEXT NOT NULL DEFAULT '',
    general_notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS revenue_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expense_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    amount_owed REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0,
    paid_date TEXT NOT NULL DEFAULT '',
    check_number TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    quote_info TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    task TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    progress TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS flights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    trip_type TEXT NOT NULL DEFAULT '',
    person TEXT NOT NULL DEFAULT '',
    confirmation TEXT NOT NULL DEFAULT '',
    flight_time TEXT NOT NULL DEFAULT '',
    flight_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS hotels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    date_label TEXT NOT NULL DEFAULT '',
    confirmation_number TEXT NOT NULL DEFAULT '',
    hotel_name TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    vendor TEXT NOT NULL DEFAULT '',
    drop_off_address TEXT NOT NULL DEFAULT '',
    mobile TEXT NOT NULL DEFAULT '',
    office TEXT NOT NULL DEFAULT '',
    confirmation TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS time_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    day_label TEXT NOT NULL DEFAULT '',
    headcount TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    hours TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    assigned_shift TEXT NOT NULL DEFAULT '',
    arrival_date TEXT NOT NULL DEFAULT '',
    departure_date TEXT NOT NULL DEFAULT '',
    flight_summary TEXT NOT NULL DEFAULT '',
    contract_status TEXT NOT NULL DEFAULT 'Not Sent',
    contract_due_date TEXT NOT NULL DEFAULT '',
    contract_notes TEXT NOT NULL DEFAULT '',
    invite_notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    document_type TEXT NOT NULL DEFAULT '',
    original_name TEXT NOT NULL DEFAULT '',
    stored_name TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    uploaded_at TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invoice_settings (
    event_id INTEGER PRIMARY KEY,
    invoice_number TEXT NOT NULL DEFAULT '',
    invoice_date TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    payment_terms TEXT NOT NULL DEFAULT 'Due on receipt',
    sender_name TEXT NOT NULL DEFAULT 'The Urban Slide',
    sender_address TEXT NOT NULL DEFAULT '',
    sender_email TEXT NOT NULL DEFAULT '',
    sender_phone TEXT NOT NULL DEFAULT '',
    bill_to_name TEXT NOT NULL DEFAULT '',
    bill_to_address TEXT NOT NULL DEFAULT '',
    remit_to TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    logo_data_url TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invoice_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL DEFAULT 1,
    rate REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );
`)

const getEventRows = database.prepare(`
  SELECT
    events.id,
    events.name,
    events.city,
    events.state,
    events.start_date,
    events.end_date,
    events.status,
    events.contract_revenue,
    COALESCE((SELECT SUM(amount) FROM revenue_items WHERE event_id = events.id), 0) AS extra_revenue,
    COALESCE((SELECT SUM(amount) FROM expense_items WHERE event_id = events.id), 0) AS total_expenses
  FROM events
  ORDER BY COALESCE(events.start_date, ''), events.name
`)

const insertEvent = database.prepare(`
  INSERT INTO events (name, city, state, start_date, end_date, status, contract_revenue, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateEventRecord = database.prepare(`
  UPDATE events
  SET name = ?, city = ?, state = ?, start_date = ?, end_date = ?, status = ?, contract_revenue = ?, updated_at = ?
  WHERE id = ?
`)

const insertEventInfo = database.prepare(`
  INSERT INTO event_info (
    event_id,
    overview,
    payment_schedule_notes,
    meeting_location,
    staffing_breakdown,
    parking_notes,
    water_usage_notes,
    city_responsibilities,
    weather_notes,
    general_notes
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id) DO UPDATE SET
    overview = excluded.overview,
    payment_schedule_notes = excluded.payment_schedule_notes,
    meeting_location = excluded.meeting_location,
    staffing_breakdown = excluded.staffing_breakdown,
    parking_notes = excluded.parking_notes,
    water_usage_notes = excluded.water_usage_notes,
    city_responsibilities = excluded.city_responsibilities,
    weather_notes = excluded.weather_notes,
    general_notes = excluded.general_notes
`)

const deleteEventRecord = database.prepare(`DELETE FROM events WHERE id = ?`)
const getEventBase = database.prepare(`SELECT * FROM events WHERE id = ?`)
const getEventInfo = database.prepare(`SELECT * FROM event_info WHERE event_id = ?`)
const getRevenueItems = database.prepare(`SELECT id, label, amount FROM revenue_items WHERE event_id = ? ORDER BY sort_order, id`)
const getExpenseItems = database.prepare(`SELECT id, category, label, amount, notes FROM expense_items WHERE event_id = ? ORDER BY category, sort_order, id`)
const getPayments = database.prepare(`SELECT id, description, due_date, amount_owed, amount_paid, paid_date, check_number, notes FROM payments WHERE event_id = ? ORDER BY sort_order, id`)
const getContacts = database.prepare(`SELECT id, name, company, role, phone, email, quote_info, notes FROM contacts WHERE event_id = ? ORDER BY sort_order, id`)
const getTodos = database.prepare(`SELECT id, task, owner, notes, progress, due_date, completed FROM todos WHERE event_id = ? ORDER BY sort_order, id`)
const getFlights = database.prepare(`SELECT id, trip_type, person, confirmation, flight_time, flight_date, notes FROM flights WHERE event_id = ? ORDER BY sort_order, id`)
const getHotels = database.prepare(`SELECT id, date_label, confirmation_number, hotel_name, notes FROM hotels WHERE event_id = ? ORDER BY sort_order, id`)
const getRentals = database.prepare(`SELECT id, vendor, drop_off_address, mobile, office, confirmation, email, notes FROM rentals WHERE event_id = ? ORDER BY sort_order, id`)
const getTimeSlots = database.prepare(`SELECT id, day_label, headcount, details, hours, notes FROM time_slots WHERE event_id = ? ORDER BY sort_order, id`)
const getStaff = database.prepare(`SELECT id, name, role, email, phone, assigned_shift, arrival_date, departure_date, flight_summary, contract_status, contract_due_date, contract_notes, invite_notes FROM staff WHERE event_id = ? ORDER BY sort_order, id`)
const getDocuments = database.prepare(`SELECT id, document_type, original_name, stored_name, size, notes, uploaded_at FROM documents WHERE event_id = ? ORDER BY uploaded_at DESC, id DESC`)
const getInvoiceSettings = database.prepare(`SELECT * FROM invoice_settings WHERE event_id = ?`)
const getInvoiceLineItems = database.prepare(`SELECT id, description, quantity, rate FROM invoice_line_items WHERE event_id = ? ORDER BY sort_order, id`)
const getDocument = database.prepare(`SELECT * FROM documents WHERE id = ? AND event_id = ?`)
const insertDocument = database.prepare(`
  INSERT INTO documents (event_id, document_type, original_name, stored_name, mime_type, size, notes, uploaded_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const deleteDocumentRecord = database.prepare(`DELETE FROM documents WHERE id = ? AND event_id = ?`)

const deleteRevenueItems = database.prepare(`DELETE FROM revenue_items WHERE event_id = ?`)
const deleteExpenseItems = database.prepare(`DELETE FROM expense_items WHERE event_id = ?`)
const deletePayments = database.prepare(`DELETE FROM payments WHERE event_id = ?`)
const deleteContacts = database.prepare(`DELETE FROM contacts WHERE event_id = ?`)
const deleteTodos = database.prepare(`DELETE FROM todos WHERE event_id = ?`)
const deleteFlights = database.prepare(`DELETE FROM flights WHERE event_id = ?`)
const deleteHotels = database.prepare(`DELETE FROM hotels WHERE event_id = ?`)
const deleteRentals = database.prepare(`DELETE FROM rentals WHERE event_id = ?`)
const deleteTimeSlots = database.prepare(`DELETE FROM time_slots WHERE event_id = ?`)
const deleteStaff = database.prepare(`DELETE FROM staff WHERE event_id = ?`)
const deleteInvoiceLineItems = database.prepare(`DELETE FROM invoice_line_items WHERE event_id = ?`)

const insertRevenueItem = database.prepare(`INSERT INTO revenue_items (event_id, label, amount, sort_order) VALUES (?, ?, ?, ?)`)
const insertExpenseItem = database.prepare(`INSERT INTO expense_items (event_id, category, label, amount, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
const insertPayment = database.prepare(`INSERT INTO payments (event_id, description, due_date, amount_owed, amount_paid, paid_date, check_number, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const insertContact = database.prepare(`INSERT INTO contacts (event_id, name, company, role, phone, email, quote_info, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const insertTodo = database.prepare(`INSERT INTO todos (event_id, task, owner, notes, progress, due_date, completed, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
const insertFlight = database.prepare(`INSERT INTO flights (event_id, trip_type, person, confirmation, flight_time, flight_date, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
const insertHotel = database.prepare(`INSERT INTO hotels (event_id, date_label, confirmation_number, hotel_name, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
const insertRental = database.prepare(`INSERT INTO rentals (event_id, vendor, drop_off_address, mobile, office, confirmation, email, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const insertTimeSlot = database.prepare(`INSERT INTO time_slots (event_id, day_label, headcount, details, hours, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`)
const insertStaff = database.prepare(`INSERT INTO staff (event_id, name, role, email, phone, assigned_shift, arrival_date, departure_date, flight_summary, contract_status, contract_due_date, contract_notes, invite_notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const insertInvoiceSettings = database.prepare(`
  INSERT INTO invoice_settings (
    event_id,
    invoice_number,
    invoice_date,
    due_date,
    payment_terms,
    sender_name,
    sender_address,
    sender_email,
    sender_phone,
    bill_to_name,
    bill_to_address,
    remit_to,
    notes,
    logo_data_url
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id) DO UPDATE SET
    invoice_number = excluded.invoice_number,
    invoice_date = excluded.invoice_date,
    due_date = excluded.due_date,
    payment_terms = excluded.payment_terms,
    sender_name = excluded.sender_name,
    sender_address = excluded.sender_address,
    sender_email = excluded.sender_email,
    sender_phone = excluded.sender_phone,
    bill_to_name = excluded.bill_to_name,
    bill_to_address = excluded.bill_to_address,
    remit_to = excluded.remit_to,
    notes = excluded.notes,
    logo_data_url = excluded.logo_data_url
`)
const insertInvoiceLineItem = database.prepare(`INSERT INTO invoice_line_items (event_id, description, quantity, rate, sort_order) VALUES (?, ?, ?, ?, ?)`)

const expenseSeed: Array<{ category: ExpenseCategory; label: string }> = [
  { category: 'equipment', label: '25K Generator' },
  { category: 'equipment', label: '2 Fork Lifts' },
  { category: 'equipment', label: '4 Cord Tempower' },
  { category: 'equipment', label: 'Transporation Surcharge' },
  { category: 'workers', label: 'TT' },
  { category: 'workers', label: 'Robbie' },
  { category: 'workers', label: 'Labor Ready - Setup / Breakdown' },
  { category: 'lodgingTransportation', label: 'Hotel' },
  { category: 'lodgingTransportation', label: 'Rental Car' },
  { category: 'lodgingTransportation', label: 'Flights' },
  { category: 'insurance', label: 'General Liability' },
  { category: 'insurance', label: 'Accident Policy' },
  { category: 'marketing', label: 'Video' },
  { category: 'tubes', label: 'Tubes' },
  { category: 'tubes', label: 'Shipment / Broker' },
  { category: 'misc', label: 'Amazon' },
  { category: 'misc', label: 'HomeDepot' },
]

const todoSeed = [
  'Contract Signed',
  'Tube Pricing',
  'Trailer Inspected',
  'Down Payment',
  'Send Invoices For All Payments',
  'Event Insurance',
  'Book Trailer Shipment',
  'Book Flights',
  'Book Labor Ready',
  'Book Rental Equipment',
  'Ship Tubes',
]

const defaultTodoProgress: TodoProgress = 'Not Started'

const timeSlotSeed = [
  { dayLabel: 'Setup', headcount: '8 people', details: 'Heavy lifters hard labor', hours: '10:30am - 6:30pm', notes: '' },
  { dayLabel: 'Friday Shift Slide Event', headcount: '6 people', details: 'Water shoes and slide support', hours: '6:00pm - 10:00pm', notes: '' },
  { dayLabel: 'Saturday Shift 1', headcount: '6 people', details: 'Slide support', hours: '9:30am - 3:45pm', notes: '' },
  { dayLabel: 'Saturday Shift 2', headcount: '6 people', details: 'Slide support', hours: '3:30pm - 10:00pm', notes: '' },
  { dayLabel: 'Sunday Shift 1', headcount: '6 people', details: 'Slide support', hours: '11:30am - 6:00pm', notes: '' },
  { dayLabel: 'Sunday Shift 2 & Breakdown', headcount: '8 people', details: 'Breakdown and heavy lifting', hours: '6:00pm - 1:00am', notes: '' },
]

const staffSeed = [
  { name: 'Derrest', role: 'Lead', assignedShift: 'Setup / Event Lead', contractStatus: 'Signed' },
  { name: 'Shawn', role: 'Operations', assignedShift: 'Setup / Breakdown', contractStatus: 'Not Sent' },
  { name: 'TT', role: 'Slide Crew', assignedShift: 'Event Shift', contractStatus: 'Not Sent' },
]

const defaultInfo: EventInfo = {
  overview: '',
  paymentScheduleNotes: '',
  meetingLocation: '',
  staffingBreakdown: '',
  parkingNotes: '',
  waterUsageNotes: '',
  cityResponsibilities: '',
  weatherNotes: '',
  generalNotes: '',
}

const emptyInfoRow: Record<string, unknown> = {
  overview: '',
  payment_schedule_notes: '',
  meeting_location: '',
  staffing_breakdown: '',
  parking_notes: '',
  water_usage_notes: '',
  city_responsibilities: '',
  weather_notes: '',
  general_notes: '',
}

const defaultInvoice: InvoiceDraft = {
  invoiceNumber: '',
  invoiceDate: '',
  dueDate: '',
  paymentTerms: 'Due on receipt',
  senderName: 'The Urban Slide',
  senderAddress: '',
  senderEmail: '',
  senderPhone: '',
  billToName: '',
  billToAddress: '',
  remitTo: '',
  notes: '',
  logoDataUrl: '',
  lineItems: [
    { id: -1, description: 'Deposit', quantity: 1, rate: 0 },
  ],
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function booleanValue(value: unknown) {
  return value === true || value === 1
}

function uploadsPathForEvent(eventId: number) {
  return path.join(uploadsDir, String(eventId))
}

function relativeDocumentUrl(eventId: number, storedName: string) {
  return `/uploads/${eventId}/${encodeURIComponent(storedName)}`
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function setEventChildren(eventId: number, payload: Record<string, unknown>) {
  deleteRevenueItems.run(eventId)
  deleteExpenseItems.run(eventId)
  deletePayments.run(eventId)
  deleteContacts.run(eventId)
  deleteTodos.run(eventId)
  deleteFlights.run(eventId)
  deleteHotels.run(eventId)
  deleteRentals.run(eventId)
  deleteTimeSlots.run(eventId)
  deleteStaff.run(eventId)
  deleteInvoiceLineItems.run(eventId)

  const revenueItems = Array.isArray(payload.revenueItems) ? payload.revenueItems : []
  revenueItems.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertRevenueItem.run(eventId, stringValue(row.label), numberValue(row.amount), index)
  })

  const expenseItems = Array.isArray(payload.expenseItems) ? payload.expenseItems : []
  expenseItems.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertExpenseItem.run(
      eventId,
      stringValue(row.category),
      stringValue(row.label),
      numberValue(row.amount),
      stringValue(row.notes),
      index,
    )
  })

  const payments = Array.isArray(payload.payments) ? payload.payments : []
  payments.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertPayment.run(
      eventId,
      stringValue(row.description),
      stringValue(row.dueDate),
      numberValue(row.amountOwed),
      numberValue(row.amountPaid),
      stringValue(row.paidDate),
      stringValue(row.checkNumber),
      stringValue(row.notes),
      index,
    )
  })

  const contacts = Array.isArray(payload.contacts) ? payload.contacts : []
  contacts.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertContact.run(
      eventId,
      stringValue(row.name),
      stringValue(row.company),
      stringValue(row.role),
      stringValue(row.phone),
      stringValue(row.email),
      stringValue(row.quoteInfo),
      stringValue(row.notes),
      index,
    )
  })

  const todos = Array.isArray(payload.todos) ? payload.todos : []
  todos.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertTodo.run(
      eventId,
      stringValue(row.task),
      stringValue(row.owner),
      stringValue(row.notes),
      stringValue(row.progress),
      stringValue(row.dueDate),
      booleanValue(row.completed) ? 1 : 0,
      index,
    )
  })

  const flights = Array.isArray(payload.flights) ? payload.flights : []
  flights.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertFlight.run(
      eventId,
      stringValue(row.tripType),
      stringValue(row.person),
      stringValue(row.confirmation),
      stringValue(row.flightTime),
      stringValue(row.flightDate),
      stringValue(row.notes),
      index,
    )
  })

  const hotels = Array.isArray(payload.hotels) ? payload.hotels : []
  hotels.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertHotel.run(
      eventId,
      stringValue(row.dateLabel),
      stringValue(row.confirmationNumber),
      stringValue(row.hotelName),
      stringValue(row.notes),
      index,
    )
  })

  const rentals = Array.isArray(payload.rentals) ? payload.rentals : []
  rentals.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertRental.run(
      eventId,
      stringValue(row.vendor),
      stringValue(row.dropOffAddress),
      stringValue(row.mobile),
      stringValue(row.office),
      stringValue(row.confirmation),
      stringValue(row.email),
      stringValue(row.notes),
      index,
    )
  })

  const timeSlots = Array.isArray(payload.timeSlots) ? payload.timeSlots : []
  timeSlots.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertTimeSlot.run(
      eventId,
      stringValue(row.dayLabel),
      stringValue(row.headcount),
      stringValue(row.details),
      stringValue(row.hours),
      stringValue(row.notes),
      index,
    )
  })

  const staff = Array.isArray(payload.staff) ? payload.staff : []
  staff.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertStaff.run(
      eventId,
      stringValue(row.name),
      stringValue(row.role),
      stringValue(row.email),
      stringValue(row.phone),
      stringValue(row.assignedShift),
      stringValue(row.arrivalDate),
      stringValue(row.departureDate),
      stringValue(row.flightSummary),
      stringValue(row.contractStatus),
      stringValue(row.contractDueDate),
      stringValue(row.contractNotes),
      stringValue(row.inviteNotes),
      index,
    )
  })

  const invoice = (payload.invoice as Record<string, unknown> | undefined) ?? {}
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : []
  lineItems.forEach((item, index) => {
    const row = item as Record<string, unknown>
    insertInvoiceLineItem.run(
      eventId,
      stringValue(row.description),
      numberValue(row.quantity) || 0,
      numberValue(row.rate),
      index,
    )
  })
}

function createSeedEvent() {
  const now = new Date().toISOString()
  const result = insertEvent.run('New Event', '', '', '', '', 'Planning', 0, now, now)
  const eventId = Number(result.lastInsertRowid)

  insertEventInfo.run(
    eventId,
    defaultInfo.overview,
    defaultInfo.paymentScheduleNotes,
    defaultInfo.meetingLocation,
    defaultInfo.staffingBreakdown,
    defaultInfo.parkingNotes,
    defaultInfo.waterUsageNotes,
    defaultInfo.cityResponsibilities,
    defaultInfo.weatherNotes,
    defaultInfo.generalNotes,
  )

  ;[
    { label: 'Tube Charge', amount: 0 },
    { label: 'Additional Insurance', amount: 0 },
  ].forEach((item, index) => insertRevenueItem.run(eventId, item.label, item.amount, index))

  expenseSeed.forEach((item, index) => insertExpenseItem.run(eventId, item.category, item.label, 0, '', index))

  ;[
    { description: 'Down Payment', dueDate: 'Contract Signed' },
    { description: 'Installment Payment 2', dueDate: '60 days before event' },
    { description: 'Installment Payment 3', dueDate: '30 days before event' },
    { description: 'Installment Payment 4', dueDate: 'Trailer arrival' },
  ].forEach((item, index) =>
    insertPayment.run(eventId, item.description, item.dueDate, 0, 0, '', '', '', index),
  )

  todoSeed.forEach((task, index) => insertTodo.run(eventId, task, '', '', defaultTodoProgress, '', 0, index))

  ;[
    { name: 'Labor Ready', company: 'People Ready', role: 'Labor', phone: '', email: '', quoteInfo: '', notes: '' },
    { name: 'Sunbelt', company: 'Sunbelt Rentals', role: 'Equipment', phone: '', email: '', quoteInfo: '', notes: '' },
    { name: 'Insurance Quote Contact', company: '', role: 'Insurance', phone: '', email: '', quoteInfo: '', notes: '' },
  ].forEach((item, index) =>
    insertContact.run(eventId, item.name, item.company, item.role, item.phone, item.email, item.quoteInfo, item.notes, index),
  )

  timeSlotSeed.forEach((item, index) =>
    insertTimeSlot.run(eventId, item.dayLabel, item.headcount, item.details, item.hours, item.notes, index),
  )

  staffSeed.forEach((item, index) =>
    insertStaff.run(
      eventId,
      item.name,
      item.role,
      '',
      '',
      item.assignedShift,
      '',
      '',
      '',
      item.contractStatus,
      '',
      '',
      '',
      index,
    ),
  )

  insertInvoiceSettings.run(
    eventId,
    defaultInvoice.invoiceNumber,
    defaultInvoice.invoiceDate,
    defaultInvoice.dueDate,
    defaultInvoice.paymentTerms,
    defaultInvoice.senderName,
    defaultInvoice.senderAddress,
    defaultInvoice.senderEmail,
    defaultInvoice.senderPhone,
    defaultInvoice.billToName,
    defaultInvoice.billToAddress,
    defaultInvoice.remitTo,
    defaultInvoice.notes,
    defaultInvoice.logoDataUrl,
  )

  defaultInvoice.lineItems.forEach((item, index) =>
    insertInvoiceLineItem.run(eventId, item.description, item.quantity, item.rate, index),
  )

  return eventId
}

function getSummaries() {
  const rows = getEventRows.all() as Array<Record<string, unknown>>
  return rows.map((row) => {
    const totalRevenue = numberValue(row.contract_revenue) + numberValue(row.extra_revenue)
    const totalExpenses = numberValue(row.total_expenses)

    return {
      id: numberValue(row.id),
      name: stringValue(row.name),
      city: stringValue(row.city),
      state: stringValue(row.state),
      startDate: stringValue(row.start_date),
      endDate: stringValue(row.end_date),
      status: stringValue(row.status) as EventStatus,
      contractRevenue: numberValue(row.contract_revenue),
      totalRevenue,
      totalExpenses,
      netReturn: totalRevenue - totalExpenses,
    }
  })
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function compareDateOnly(left: string, right: string) {
  return left.localeCompare(right)
}

function eventYear(event: { startDate: string; endDate: string }) {
  const dateSource = isIsoDate(event.startDate)
    ? event.startDate
    : isIsoDate(event.endDate)
      ? event.endDate
      : ''

  return dateSource ? Number(dateSource.slice(0, 4)) : null
}

function getFullEvent(eventId: number) {
  const base = getEventBase.get(eventId) as Record<string, unknown> | undefined
  if (!base) {
    return null
  }

  const info = (getEventInfo.get(eventId) as Record<string, unknown> | undefined) ?? emptyInfoRow
  const invoiceSettings = (getInvoiceSettings.get(eventId) as Record<string, unknown> | undefined) ?? {}

  const revenueItems = (getRevenueItems.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    label: stringValue(row.label),
    amount: numberValue(row.amount),
  }))

  const expenseItems = (getExpenseItems.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    category: stringValue(row.category),
    label: stringValue(row.label),
    amount: numberValue(row.amount),
    notes: stringValue(row.notes),
  }))

  const payments = (getPayments.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    description: stringValue(row.description),
    dueDate: stringValue(row.due_date),
    amountOwed: numberValue(row.amount_owed),
    amountPaid: numberValue(row.amount_paid),
    paidDate: stringValue(row.paid_date),
    checkNumber: stringValue(row.check_number),
    notes: stringValue(row.notes),
  }))

  const contacts = (getContacts.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    name: stringValue(row.name),
    company: stringValue(row.company),
    role: stringValue(row.role),
    phone: stringValue(row.phone),
    email: stringValue(row.email),
    quoteInfo: stringValue(row.quote_info),
    notes: stringValue(row.notes),
  }))

  const todos = (getTodos.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    task: stringValue(row.task),
    owner: stringValue(row.owner),
    notes: stringValue(row.notes),
    progress: stringValue(row.progress),
    dueDate: stringValue(row.due_date),
    completed: booleanValue(row.completed),
  }))

  const flights = (getFlights.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    tripType: stringValue(row.trip_type),
    person: stringValue(row.person),
    confirmation: stringValue(row.confirmation),
    flightTime: stringValue(row.flight_time),
    flightDate: stringValue(row.flight_date),
    notes: stringValue(row.notes),
  }))

  const hotels = (getHotels.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    dateLabel: stringValue(row.date_label),
    confirmationNumber: stringValue(row.confirmation_number),
    hotelName: stringValue(row.hotel_name),
    notes: stringValue(row.notes),
  }))

  const rentals = (getRentals.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    vendor: stringValue(row.vendor),
    dropOffAddress: stringValue(row.drop_off_address),
    mobile: stringValue(row.mobile),
    office: stringValue(row.office),
    confirmation: stringValue(row.confirmation),
    email: stringValue(row.email),
    notes: stringValue(row.notes),
  }))

  const timeSlots = (getTimeSlots.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    dayLabel: stringValue(row.day_label),
    headcount: stringValue(row.headcount),
    details: stringValue(row.details),
    hours: stringValue(row.hours),
    notes: stringValue(row.notes),
  }))

  const staff = (getStaff.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    name: stringValue(row.name),
    role: stringValue(row.role),
    email: stringValue(row.email),
    phone: stringValue(row.phone),
    assignedShift: stringValue(row.assigned_shift),
    arrivalDate: stringValue(row.arrival_date),
    departureDate: stringValue(row.departure_date),
    flightSummary: stringValue(row.flight_summary),
    contractStatus: stringValue(row.contract_status),
    contractDueDate: stringValue(row.contract_due_date),
    contractNotes: stringValue(row.contract_notes),
    inviteNotes: stringValue(row.invite_notes),
  }))

  const documents = (getDocuments.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    documentType: stringValue(row.document_type),
    originalName: stringValue(row.original_name),
    notes: stringValue(row.notes),
    uploadedAt: stringValue(row.uploaded_at),
    size: numberValue(row.size),
    url: relativeDocumentUrl(eventId, stringValue(row.stored_name)),
  }))
  const invoiceLineItems = (getInvoiceLineItems.all(eventId) as Array<Record<string, unknown>>).map((row) => ({
    id: numberValue(row.id),
    description: stringValue(row.description),
    quantity: numberValue(row.quantity),
    rate: numberValue(row.rate),
  }))

  const extraRevenue = revenueItems.reduce((sum, item) => sum + item.amount, 0)
  const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0)
  const totalRevenue = numberValue(base.contract_revenue) + extraRevenue

  return {
    id: numberValue(base.id),
    name: stringValue(base.name),
    city: stringValue(base.city),
    state: stringValue(base.state),
    startDate: stringValue(base.start_date),
    endDate: stringValue(base.end_date),
    status: stringValue(base.status),
    contractRevenue: numberValue(base.contract_revenue),
    totalRevenue,
    totalExpenses,
    netReturn: totalRevenue - totalExpenses,
    overview: stringValue(info.overview),
    meetingLocation: stringValue(info.meeting_location),
    generalNotes: stringValue(info.general_notes),
    revenueItems,
    expenseItems,
    payments,
    contacts,
    todos,
    info: {
      overview: stringValue(info.overview),
      paymentScheduleNotes: stringValue(info.payment_schedule_notes),
      meetingLocation: stringValue(info.meeting_location),
      staffingBreakdown: stringValue(info.staffing_breakdown),
      parkingNotes: stringValue(info.parking_notes),
      waterUsageNotes: stringValue(info.water_usage_notes),
      cityResponsibilities: stringValue(info.city_responsibilities),
      weatherNotes: stringValue(info.weather_notes),
      generalNotes: stringValue(info.general_notes),
    },
    flights,
    hotels,
    rentals,
    timeSlots,
    staff,
    invoice: {
      invoiceNumber: stringValue(invoiceSettings.invoice_number),
      invoiceDate: stringValue(invoiceSettings.invoice_date),
      dueDate: stringValue(invoiceSettings.due_date),
      paymentTerms: stringValue(invoiceSettings.payment_terms) || defaultInvoice.paymentTerms,
      senderName: stringValue(invoiceSettings.sender_name) || defaultInvoice.senderName,
      senderAddress: stringValue(invoiceSettings.sender_address),
      senderEmail: stringValue(invoiceSettings.sender_email),
      senderPhone: stringValue(invoiceSettings.sender_phone),
      billToName: stringValue(invoiceSettings.bill_to_name),
      billToAddress: stringValue(invoiceSettings.bill_to_address),
      remitTo: stringValue(invoiceSettings.remit_to),
      notes: stringValue(invoiceSettings.notes),
      logoDataUrl: stringValue(invoiceSettings.logo_data_url),
      lineItems: invoiceLineItems.length ? invoiceLineItems : defaultInvoice.lineItems,
    },
    documents,
  }
}

const saveEventTransaction = () =>
  database.exec('BEGIN')

const upload = multer({
  storage: multer.diskStorage({
    destination(req, _file, callback) {
      const eventId = Number(req.params.id)
      const dir = uploadsPathForEvent(eventId)
      fs.mkdirSync(dir, { recursive: true })
      callback(null, dir)
    },
    filename(_req, file, callback) {
      const unique = `${Date.now()}-${sanitizeFilename(file.originalname)}`
      callback(null, unique)
    },
  }),
})

const app = express()
app.use(express.json({ limit: '8mb' }))
app.use('/uploads', express.static(uploadsDir))

app.get('/api/events', (_req, res) => {
  res.json(getSummaries())
})

app.get('/api/analytics', (_req, res) => {
  const comparison = getSummaries()
  const currentYear = new Date().getFullYear()
  const yearMap = new Map<number, { year: number; eventCount: number; totalRevenue: number; totalExpenses: number }>()

  const yearly = comparison.filter((event) => {
    const year = eventYear(event)
    if (!year) {
      return false
    }

    const existing = yearMap.get(year) ?? {
      year,
      eventCount: 0,
      totalRevenue: 0,
      totalExpenses: 0,
    }

    existing.eventCount += 1
    existing.totalRevenue += event.totalRevenue
    existing.totalExpenses += event.totalExpenses
    yearMap.set(year, existing)

    return year === currentYear
  })

  const allTimeRevenue = comparison.reduce((sum, event) => sum + event.totalRevenue, 0)
  const allTimeExpenses = comparison.reduce((sum, event) => sum + event.totalExpenses, 0)
  const yearlyRevenue = yearly.reduce((sum, event) => sum + event.totalRevenue, 0)
  const yearlyExpenses = yearly.reduce((sum, event) => sum + event.totalExpenses, 0)
  const yearlyBreakdown = [...yearMap.values()]
    .map((entry) => ({
      ...entry,
      netReturn: entry.totalRevenue - entry.totalExpenses,
    }))
    .sort((left, right) => right.year - left.year)

  res.json({
    yearlyRevenue,
    yearlyExpenses,
    yearlyNet: yearlyRevenue - yearlyExpenses,
    allTimeRevenue,
    allTimeExpenses,
    allTimeNet: allTimeRevenue - allTimeExpenses,
    yearlyBreakdown,
    comparison,
  })
})

app.get('/api/reminders', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  const reminders: Array<Record<string, unknown>> = []

  getSummaries().forEach((event) => {
    const detail = getFullEvent(event.id)
    if (!detail) {
      return
    }

    detail.payments.forEach((payment) => {
      if (!isIsoDate(payment.dueDate) || payment.amountOwed <= payment.amountPaid) {
        return
      }

      const comparison = compareDateOnly(payment.dueDate, today)
      if (comparison > 0) {
        return
      }

      reminders.push({
        id: `payment-${event.id}-${payment.id}`,
        eventId: event.id,
        eventName: event.name,
        type: 'payment',
        title: payment.description || 'Payment due',
        dueDate: payment.dueDate,
        status: comparison === 0 ? 'dueToday' : 'overdue',
      })
    })

    detail.todos.forEach((todo) => {
      if (!isIsoDate(todo.dueDate) || todo.completed || todo.progress === 'Done') {
        return
      }

      const comparison = compareDateOnly(todo.dueDate, today)
      if (comparison > 0) {
        return
      }

      reminders.push({
        id: `todo-${event.id}-${todo.id}`,
        eventId: event.id,
        eventName: event.name,
        type: 'todo',
        title: todo.task || 'To-do item due',
        dueDate: todo.dueDate,
        status: comparison === 0 ? 'dueToday' : 'overdue',
      })
    })
  })

  res.json(reminders)
})

app.post('/api/events', (_req, res) => {
  const eventId = createSeedEvent()
  const event = getFullEvent(eventId)
  res.status(201).json(event)
})

app.get('/api/events/:id', (req, res) => {
  const event = getFullEvent(Number(req.params.id))
  if (!event) {
    res.status(404).send('Event not found.')
    return
  }

  res.json(event)
})

app.put('/api/events/:id', (req, res) => {
  const eventId = Number(req.params.id)
  if (!getEventBase.get(eventId)) {
    res.status(404).send('Event not found.')
    return
  }

  const payload = req.body as Record<string, unknown>
  const info = (payload.info as Record<string, unknown> | undefined) ?? {}
  const invoice = (payload.invoice as Record<string, unknown> | undefined) ?? {}
  const now = new Date().toISOString()

  try {
    saveEventTransaction()
    updateEventRecord.run(
      stringValue(payload.name),
      stringValue(payload.city),
      stringValue(payload.state),
      stringValue(payload.startDate),
      stringValue(payload.endDate),
      stringValue(payload.status),
      numberValue(payload.contractRevenue),
      now,
      eventId,
    )

    insertEventInfo.run(
      eventId,
      stringValue(info.overview),
      stringValue(info.paymentScheduleNotes),
      stringValue(info.meetingLocation),
      stringValue(info.staffingBreakdown),
      stringValue(info.parkingNotes),
      stringValue(info.waterUsageNotes),
      stringValue(info.cityResponsibilities),
      stringValue(info.weatherNotes),
      stringValue(info.generalNotes),
    )

    insertInvoiceSettings.run(
      eventId,
      stringValue(invoice.invoiceNumber),
      stringValue(invoice.invoiceDate),
      stringValue(invoice.dueDate),
      stringValue(invoice.paymentTerms) || defaultInvoice.paymentTerms,
      stringValue(invoice.senderName) || defaultInvoice.senderName,
      stringValue(invoice.senderAddress),
      stringValue(invoice.senderEmail),
      stringValue(invoice.senderPhone),
      stringValue(invoice.billToName),
      stringValue(invoice.billToAddress),
      stringValue(invoice.remitTo),
      stringValue(invoice.notes),
      stringValue(invoice.logoDataUrl),
    )

    setEventChildren(eventId, payload)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    res.status(500).send(error instanceof Error ? error.message : 'Unable to save event.')
    return
  }

  res.json(getFullEvent(eventId))
})

app.delete('/api/events/:id', (req, res) => {
  const eventId = Number(req.params.id)
  const folder = uploadsPathForEvent(eventId)
  deleteEventRecord.run(eventId)
  fs.rmSync(folder, { recursive: true, force: true })
  res.status(204).send()
})

app.post('/api/events/:id/documents', upload.single('file'), (req, res) => {
  const eventId = Number(req.params.id)
  if (!getEventBase.get(eventId)) {
    res.status(404).send('Event not found.')
    return
  }

  if (!req.file) {
    res.status(400).send('No document uploaded.')
    return
  }

  const uploadedAt = new Date().toISOString().slice(0, 10)
  const documentType = stringValue(req.body.documentType)
  const notes = stringValue(req.body.notes)

  const result = insertDocument.run(
    eventId,
    documentType,
    req.file.originalname,
    req.file.filename,
    req.file.mimetype,
    req.file.size,
    notes,
    uploadedAt,
  )

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    documentType,
    originalName: req.file.originalname,
    notes,
    uploadedAt,
    size: req.file.size,
    url: relativeDocumentUrl(eventId, req.file.filename),
  })
})

app.delete('/api/events/:id/documents/:documentId', (req, res) => {
  const eventId = Number(req.params.id)
  const documentId = Number(req.params.documentId)
  const document = getDocument.get(documentId, eventId) as Record<string, unknown> | undefined

  if (!document) {
    res.status(404).send('Document not found.')
    return
  }

  deleteDocumentRecord.run(documentId, eventId)
  fs.rmSync(path.join(uploadsPathForEvent(eventId), stringValue(document.stored_name)), { force: true })
  res.status(204).send()
})

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api|\/uploads).*/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next()
      return
    }

    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const port = Number(process.env.PORT || 4000)
app.listen(port, () => {
  console.log(`Urban Slide Tracker running at http://localhost:${port}`)
})
