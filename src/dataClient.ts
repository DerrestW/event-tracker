import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AnalyticsSnapshot,
  EventDetail,
  EventDocument,
  EventSummary,
  ReminderItem,
} from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const storageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'event-documents'
const useSupabase = Boolean(supabaseUrl && supabaseAnonKey)

const supabase = useSupabase
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

const expenseSeed = [
  ['equipment', '25K Generator'],
  ['equipment', '2 Fork Lifts'],
  ['equipment', '4 Cord Tempower'],
  ['equipment', 'Transporation Surcharge'],
  ['workers', 'TT'],
  ['workers', 'Robbie'],
  ['workers', 'Labor Ready - Setup / Breakdown'],
  ['lodgingTransportation', 'Hotel'],
  ['lodgingTransportation', 'Rental Car'],
  ['lodgingTransportation', 'Flights'],
  ['insurance', 'General Liability'],
  ['insurance', 'Accident Policy'],
  ['marketing', 'Video'],
  ['tubes', 'Tubes'],
  ['tubes', 'Shipment / Broker'],
  ['misc', 'Amazon'],
  ['misc', 'HomeDepot'],
] as const

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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function sortByOrder<T extends { sort_order: number; id: number }>(rows: T[]) {
  return rows.slice().sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
}

function documentUrl(client: SupabaseClient, path: string) {
  return client.storage.from(storageBucket).getPublicUrl(path).data.publicUrl
}

async function listEventsSupabase() {
  const client = requireSupabase()
  const [eventsRes, revenuesRes, expensesRes] = await Promise.all([
    client.from('events').select('*').order('start_date', { ascending: true }).order('name', { ascending: true }),
    client.from('revenue_items').select('event_id, amount'),
    client.from('expense_items').select('event_id, amount'),
  ])

  if (eventsRes.error) throw eventsRes.error
  if (revenuesRes.error) throw revenuesRes.error
  if (expensesRes.error) throw expensesRes.error

  const revenueMap = new Map<number, number>()
  const expenseMap = new Map<number, number>()

  revenuesRes.data.forEach((row) => revenueMap.set(row.event_id, (revenueMap.get(row.event_id) ?? 0) + Number(row.amount || 0)))
  expensesRes.data.forEach((row) => expenseMap.set(row.event_id, (expenseMap.get(row.event_id) ?? 0) + Number(row.amount || 0)))

  return eventsRes.data.map((row) => {
    const totalRevenue = Number(row.contract_revenue || 0) + (revenueMap.get(row.id) ?? 0)
    const totalExpenses = expenseMap.get(row.id) ?? 0

    return {
      id: row.id,
      name: row.name,
      city: row.city,
      state: row.state,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      contractRevenue: Number(row.contract_revenue || 0),
      totalRevenue,
      totalExpenses,
      netReturn: totalRevenue - totalExpenses,
    } satisfies EventSummary
  })
}

async function getEventSupabase(eventId: number) {
  const client = requireSupabase()
  const [
    eventRes,
    infoRes,
    revenueRes,
    expenseRes,
    paymentsRes,
    contactsRes,
    todosRes,
    flightsRes,
    hotelsRes,
    rentalsRes,
    timeSlotsRes,
    staffRes,
    documentsRes,
  ] = await Promise.all([
    client.from('events').select('*').eq('id', eventId).single(),
    client.from('event_info').select('*').eq('event_id', eventId).maybeSingle(),
    client.from('revenue_items').select('*').eq('event_id', eventId),
    client.from('expense_items').select('*').eq('event_id', eventId),
    client.from('payments').select('*').eq('event_id', eventId),
    client.from('contacts').select('*').eq('event_id', eventId),
    client.from('todos').select('*').eq('event_id', eventId),
    client.from('flights').select('*').eq('event_id', eventId),
    client.from('hotels').select('*').eq('event_id', eventId),
    client.from('rentals').select('*').eq('event_id', eventId),
    client.from('time_slots').select('*').eq('event_id', eventId),
    client.from('staff').select('*').eq('event_id', eventId),
    client.from('documents').select('*').eq('event_id', eventId),
  ])

  ;[
    eventRes,
    infoRes,
    revenueRes,
    expenseRes,
    paymentsRes,
    contactsRes,
    todosRes,
    flightsRes,
    hotelsRes,
    rentalsRes,
    timeSlotsRes,
    staffRes,
    documentsRes,
  ].forEach((result) => {
    if (result.error) throw result.error
  })

  const event = eventRes.data
  const revenueItems = sortByOrder(revenueRes.data ?? []).map((row) => ({ id: row.id, label: row.label, amount: Number(row.amount || 0) }))
  const expenseItems = sortByOrder(expenseRes.data ?? []).map((row) => ({ id: row.id, category: row.category, label: row.label, amount: Number(row.amount || 0), notes: row.notes }))
  const payments = sortByOrder(paymentsRes.data ?? []).map((row) => ({
    id: row.id,
    description: row.description,
    dueDate: row.due_date,
    amountOwed: Number(row.amount_owed || 0),
    amountPaid: Number(row.amount_paid || 0),
    paidDate: row.paid_date,
    checkNumber: row.check_number,
    notes: row.notes,
  }))
  const contacts = sortByOrder(contactsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company,
    role: row.role,
    phone: row.phone,
    email: row.email,
    quoteInfo: row.quote_info,
    notes: row.notes,
  }))
  const todos = sortByOrder(todosRes.data ?? []).map((row) => ({
    id: row.id,
    task: row.task,
    owner: row.owner,
    notes: row.notes,
    progress: row.progress,
    dueDate: row.due_date,
    completed: row.completed,
  }))
  const flights = sortByOrder(flightsRes.data ?? []).map((row) => ({
    id: row.id,
    tripType: row.trip_type,
    person: row.person,
    confirmation: row.confirmation,
    flightTime: row.flight_time,
    flightDate: row.flight_date,
    notes: row.notes,
  }))
  const hotels = sortByOrder(hotelsRes.data ?? []).map((row) => ({
    id: row.id,
    dateLabel: row.date_label,
    confirmationNumber: row.confirmation_number,
    hotelName: row.hotel_name,
    notes: row.notes,
  }))
  const rentals = sortByOrder(rentalsRes.data ?? []).map((row) => ({
    id: row.id,
    vendor: row.vendor,
    dropOffAddress: row.drop_off_address,
    mobile: row.mobile,
    office: row.office,
    confirmation: row.confirmation,
    email: row.email,
    notes: row.notes,
  }))
  const timeSlots = sortByOrder(timeSlotsRes.data ?? []).map((row) => ({
    id: row.id,
    dayLabel: row.day_label,
    headcount: row.headcount,
    details: row.details,
    hours: row.hours,
    notes: row.notes,
  }))
  const staff = sortByOrder(staffRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    assignedShift: row.assigned_shift,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    flightSummary: row.flight_summary,
    contractStatus: row.contract_status,
    contractDueDate: row.contract_due_date,
    contractNotes: row.contract_notes,
    inviteNotes: row.invite_notes,
  }))
  const documents = sortByOrder(documentsRes.data ?? []).reverse().map((row) => ({
    id: row.id,
    documentType: row.document_type,
    originalName: row.original_name,
    notes: row.notes,
    uploadedAt: row.uploaded_at,
    size: row.size,
    url: documentUrl(client, row.storage_path),
  }))

  const totalRevenue = Number(event.contract_revenue || 0) + revenueItems.reduce((sum, item) => sum + item.amount, 0)
  const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0)

  return {
    id: event.id,
    name: event.name,
    city: event.city,
    state: event.state,
    startDate: event.start_date,
    endDate: event.end_date,
    status: event.status,
    contractRevenue: Number(event.contract_revenue || 0),
    totalRevenue,
    totalExpenses,
    netReturn: totalRevenue - totalExpenses,
    overview: infoRes.data?.overview ?? '',
    meetingLocation: infoRes.data?.meeting_location ?? '',
    generalNotes: infoRes.data?.general_notes ?? '',
    revenueItems,
    expenseItems,
    payments,
    contacts,
    todos,
    info: {
      overview: infoRes.data?.overview ?? '',
      paymentScheduleNotes: infoRes.data?.payment_schedule_notes ?? '',
      meetingLocation: infoRes.data?.meeting_location ?? '',
      staffingBreakdown: infoRes.data?.staffing_breakdown ?? '',
      parkingNotes: infoRes.data?.parking_notes ?? '',
      waterUsageNotes: infoRes.data?.water_usage_notes ?? '',
      cityResponsibilities: infoRes.data?.city_responsibilities ?? '',
      weatherNotes: infoRes.data?.weather_notes ?? '',
      generalNotes: infoRes.data?.general_notes ?? '',
    },
    flights,
    hotels,
    rentals,
    timeSlots,
    staff,
    documents,
  } satisfies EventDetail
}

async function createEventSupabase() {
  const client = requireSupabase()
  const now = new Date().toISOString()
  const { data: event, error } = await client
    .from('events')
    .insert({
      name: 'New Event',
      city: '',
      state: '',
      start_date: '',
      end_date: '',
      status: 'Planning',
      contract_revenue: 0,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) throw error

  await client.from('event_info').insert({
    event_id: event.id,
    overview: '',
    payment_schedule_notes: '',
    meeting_location: '',
    staffing_breakdown: '',
    parking_notes: '',
    water_usage_notes: '',
    city_responsibilities: '',
    weather_notes: '',
    general_notes: '',
  })

  await client.from('revenue_items').insert([
    { event_id: event.id, label: 'Tube Charge', amount: 0, sort_order: 0 },
    { event_id: event.id, label: 'Additional Insurance', amount: 0, sort_order: 1 },
  ])

  await client.from('expense_items').insert(
    expenseSeed.map(([category, label], index) => ({
      event_id: event.id,
      category,
      label,
      amount: 0,
      notes: '',
      sort_order: index,
    })),
  )

  await client.from('payments').insert([
    { event_id: event.id, description: 'Down Payment', due_date: 'Contract Signed', amount_owed: 0, amount_paid: 0, paid_date: '', check_number: '', notes: '', sort_order: 0 },
    { event_id: event.id, description: 'Installment Payment 2', due_date: '60 days before event', amount_owed: 0, amount_paid: 0, paid_date: '', check_number: '', notes: '', sort_order: 1 },
    { event_id: event.id, description: 'Installment Payment 3', due_date: '30 days before event', amount_owed: 0, amount_paid: 0, paid_date: '', check_number: '', notes: '', sort_order: 2 },
    { event_id: event.id, description: 'Installment Payment 4', due_date: 'Trailer arrival', amount_owed: 0, amount_paid: 0, paid_date: '', check_number: '', notes: '', sort_order: 3 },
  ])

  await client.from('todos').insert(
    todoSeed.map((task, index) => ({
      event_id: event.id,
      task,
      owner: '',
      notes: '',
      progress: 'Not Started',
      due_date: '',
      completed: false,
      sort_order: index,
    })),
  )

  await client.from('contacts').insert([
    { event_id: event.id, name: 'Labor Ready', company: 'People Ready', role: 'Labor', phone: '', email: '', quote_info: '', notes: '', sort_order: 0 },
    { event_id: event.id, name: 'Sunbelt', company: 'Sunbelt Rentals', role: 'Equipment', phone: '', email: '', quote_info: '', notes: '', sort_order: 1 },
    { event_id: event.id, name: 'Insurance Quote Contact', company: '', role: 'Insurance', phone: '', email: '', quote_info: '', notes: '', sort_order: 2 },
  ])

  await client.from('time_slots').insert(
    timeSlotSeed.map((item, index) => ({
      event_id: event.id,
      day_label: item.dayLabel,
      headcount: item.headcount,
      details: item.details,
      hours: item.hours,
      notes: item.notes,
      sort_order: index,
    })),
  )

  await client.from('staff').insert(
    staffSeed.map((item, index) => ({
      event_id: event.id,
      name: item.name,
      role: item.role,
      email: '',
      phone: '',
      assigned_shift: item.assignedShift,
      arrival_date: '',
      departure_date: '',
      flight_summary: '',
      contract_status: item.contractStatus,
      contract_due_date: '',
      contract_notes: '',
      invite_notes: '',
      sort_order: index,
    })),
  )

  return getEventSupabase(event.id)
}

async function replaceRows(client: SupabaseClient, table: string, eventId: number, rows: Record<string, unknown>[]) {
  const { error: deleteError } = await client.from(table).delete().eq('event_id', eventId)
  if (deleteError) throw deleteError

  if (rows.length) {
    const { error: insertError } = await client.from(table).insert(rows)
    if (insertError) throw insertError
  }
}

async function updateEventSupabase(event: EventDetail) {
  const client = requireSupabase()
  const now = new Date().toISOString()

  const { error: eventError } = await client.from('events').update({
    name: event.name,
    city: event.city,
    state: event.state,
    start_date: event.startDate,
    end_date: event.endDate,
    status: event.status,
    contract_revenue: event.contractRevenue,
    updated_at: now,
  }).eq('id', event.id)
  if (eventError) throw eventError

  const { error: infoError } = await client.from('event_info').upsert({
    event_id: event.id,
    overview: event.info.overview,
    payment_schedule_notes: event.info.paymentScheduleNotes,
    meeting_location: event.info.meetingLocation,
    staffing_breakdown: event.info.staffingBreakdown,
    parking_notes: event.info.parkingNotes,
    water_usage_notes: event.info.waterUsageNotes,
    city_responsibilities: event.info.cityResponsibilities,
    weather_notes: event.info.weatherNotes,
    general_notes: event.info.generalNotes,
  })
  if (infoError) throw infoError

  await Promise.all([
    replaceRows(client, 'revenue_items', event.id, event.revenueItems.map((item, index) => ({ event_id: event.id, label: item.label, amount: item.amount, sort_order: index }))),
    replaceRows(client, 'expense_items', event.id, event.expenseItems.map((item, index) => ({ event_id: event.id, category: item.category, label: item.label, amount: item.amount, notes: item.notes, sort_order: index }))),
    replaceRows(client, 'payments', event.id, event.payments.map((item, index) => ({ event_id: event.id, description: item.description, due_date: item.dueDate, amount_owed: item.amountOwed, amount_paid: item.amountPaid, paid_date: item.paidDate, check_number: item.checkNumber, notes: item.notes, sort_order: index }))),
    replaceRows(client, 'contacts', event.id, event.contacts.map((item, index) => ({ event_id: event.id, name: item.name, company: item.company, role: item.role, phone: item.phone, email: item.email, quote_info: item.quoteInfo, notes: item.notes, sort_order: index }))),
    replaceRows(client, 'todos', event.id, event.todos.map((item, index) => ({ event_id: event.id, task: item.task, owner: item.owner, notes: item.notes, progress: item.progress, due_date: item.dueDate, completed: item.completed, sort_order: index }))),
    replaceRows(client, 'flights', event.id, event.flights.map((item, index) => ({ event_id: event.id, trip_type: item.tripType, person: item.person, confirmation: item.confirmation, flight_time: item.flightTime, flight_date: item.flightDate, notes: item.notes, sort_order: index }))),
    replaceRows(client, 'hotels', event.id, event.hotels.map((item, index) => ({ event_id: event.id, date_label: item.dateLabel, confirmation_number: item.confirmationNumber, hotel_name: item.hotelName, notes: item.notes, sort_order: index }))),
    replaceRows(client, 'rentals', event.id, event.rentals.map((item, index) => ({ event_id: event.id, vendor: item.vendor, drop_off_address: item.dropOffAddress, mobile: item.mobile, office: item.office, confirmation: item.confirmation, email: item.email, notes: item.notes, sort_order: index }))),
    replaceRows(client, 'time_slots', event.id, event.timeSlots.map((item, index) => ({ event_id: event.id, day_label: item.dayLabel, headcount: item.headcount, details: item.details, hours: item.hours, notes: item.notes, sort_order: index }))),
    replaceRows(client, 'staff', event.id, event.staff.map((item, index) => ({ event_id: event.id, name: item.name, role: item.role, email: item.email, phone: item.phone, assigned_shift: item.assignedShift, arrival_date: item.arrivalDate, departure_date: item.departureDate, flight_summary: item.flightSummary, contract_status: item.contractStatus, contract_due_date: item.contractDueDate, contract_notes: item.contractNotes, invite_notes: item.inviteNotes, sort_order: index }))),
  ])

  return getEventSupabase(event.id)
}

async function deleteEventSupabase(eventId: number) {
  const client = requireSupabase()
  const { data: documents } = await client.from('documents').select('storage_path').eq('event_id', eventId)
  if (documents?.length) {
    await client.storage.from(storageBucket).remove(documents.map((doc) => doc.storage_path))
  }
  const { error } = await client.from('events').delete().eq('id', eventId)
  if (error) throw error
}

async function uploadDocumentSupabase(eventId: number, documentType: string, notes: string, file: File) {
  const client = requireSupabase()
  const storagePath = `${eventId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
  const { error: storageError } = await client.storage.from(storageBucket).upload(storagePath, file)
  if (storageError) throw storageError

  const uploadedAt = new Date().toISOString().slice(0, 10)
  const { data, error } = await client.from('documents').insert({
    event_id: eventId,
    document_type: documentType,
    original_name: file.name,
    storage_path: storagePath,
    size: file.size,
    notes,
    uploaded_at: uploadedAt,
    sort_order: 0,
  }).select().single()
  if (error) throw error

  return {
    id: data.id,
    documentType,
    originalName: file.name,
    notes,
    uploadedAt,
    size: file.size,
    url: documentUrl(client, storagePath),
  } satisfies EventDocument
}

async function deleteDocumentSupabase(eventId: number, documentId: number) {
  const client = requireSupabase()
  const { data, error } = await client.from('documents').select('*').eq('event_id', eventId).eq('id', documentId).single()
  if (error) throw error
  await client.storage.from(storageBucket).remove([data.storage_path])
  const { error: deleteError } = await client.from('documents').delete().eq('event_id', eventId).eq('id', documentId)
  if (deleteError) throw deleteError
}

function computeAnalytics(comparison: EventSummary[]): AnalyticsSnapshot {
  const currentYear = new Date().getFullYear()
  const yearMap = new Map<number, { year: number; eventCount: number; totalRevenue: number; totalExpenses: number }>()

  const yearly = comparison.filter((event) => {
    const source = isIsoDate(event.startDate) ? event.startDate : isIsoDate(event.endDate) ? event.endDate : ''
    if (!source) return false
    const year = Number(source.slice(0, 4))
    const entry = yearMap.get(year) ?? { year, eventCount: 0, totalRevenue: 0, totalExpenses: 0 }
    entry.eventCount += 1
    entry.totalRevenue += event.totalRevenue
    entry.totalExpenses += event.totalExpenses
    yearMap.set(year, entry)
    return year === currentYear
  })

  const allTimeRevenue = comparison.reduce((sum, item) => sum + item.totalRevenue, 0)
  const allTimeExpenses = comparison.reduce((sum, item) => sum + item.totalExpenses, 0)
  const yearlyRevenue = yearly.reduce((sum, item) => sum + item.totalRevenue, 0)
  const yearlyExpenses = yearly.reduce((sum, item) => sum + item.totalExpenses, 0)

  return {
    yearlyRevenue,
    yearlyExpenses,
    yearlyNet: yearlyRevenue - yearlyExpenses,
    allTimeRevenue,
    allTimeExpenses,
    allTimeNet: allTimeRevenue - allTimeExpenses,
    yearlyBreakdown: [...yearMap.values()]
      .map((entry) => ({ ...entry, netReturn: entry.totalRevenue - entry.totalExpenses }))
      .sort((left, right) => right.year - left.year),
    comparison,
  }
}

export async function listEvents() {
  return useSupabase ? listEventsSupabase() : api<EventSummary[]>('/api/events')
}

export async function getEvent(eventId: number) {
  return useSupabase ? getEventSupabase(eventId) : api<EventDetail>(`/api/events/${eventId}`)
}

export async function createEvent() {
  return useSupabase ? createEventSupabase() : api<EventDetail>('/api/events', { method: 'POST' })
}

export async function updateEventRecord(event: EventDetail) {
  return useSupabase
    ? updateEventSupabase(event)
    : api<EventDetail>(`/api/events/${event.id}`, {
        method: 'PUT',
        body: JSON.stringify(event),
      })
}

export async function deleteEventRecord(eventId: number) {
  if (useSupabase) {
    await deleteEventSupabase(eventId)
    return
  }

  await api(`/api/events/${eventId}`, { method: 'DELETE' })
}

export async function getAnalytics() {
  if (useSupabase) {
    return computeAnalytics(await listEventsSupabase())
  }

  return api<AnalyticsSnapshot>('/api/analytics')
}

export async function getReminders() {
  if (!useSupabase) {
    return api<ReminderItem[]>('/api/reminders')
  }

  const events = await listEventsSupabase()
  const reminders: ReminderItem[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const event of events) {
    const detail = await getEventSupabase(event.id)

    detail.payments.forEach((payment) => {
      if (!isIsoDate(payment.dueDate) || payment.amountOwed <= payment.amountPaid) return
      if (payment.dueDate > today) return
      reminders.push({
        id: `payment-${event.id}-${payment.id}`,
        eventId: event.id,
        eventName: event.name,
        type: 'payment',
        title: payment.description || 'Payment due',
        dueDate: payment.dueDate,
        status: payment.dueDate === today ? 'dueToday' : 'overdue',
      })
    })

    detail.todos.forEach((todo) => {
      if (!isIsoDate(todo.dueDate) || todo.completed || todo.progress === 'Done') return
      if (todo.dueDate > today) return
      reminders.push({
        id: `todo-${event.id}-${todo.id}`,
        eventId: event.id,
        eventName: event.name,
        type: 'todo',
        title: todo.task || 'To-do item due',
        dueDate: todo.dueDate,
        status: todo.dueDate === today ? 'dueToday' : 'overdue',
      })
    })
  }

  return reminders
}

export async function uploadDocument(eventId: number, documentType: string, notes: string, file: File) {
  if (useSupabase) {
    return uploadDocumentSupabase(eventId, documentType, notes, file)
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('documentType', documentType)
  formData.append('notes', notes)
  const response = await fetch(`/api/events/${eventId}/documents`, { method: 'POST', body: formData })
  if (!response.ok) throw new Error(await response.text())
  return (await response.json()) as EventDocument
}

export async function deleteDocument(eventId: number, documentId: number) {
  if (useSupabase) {
    await deleteDocumentSupabase(eventId, documentId)
    return
  }

  await api(`/api/events/${eventId}/documents/${documentId}`, { method: 'DELETE' })
}
