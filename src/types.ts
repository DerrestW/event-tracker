export type EventStatus = 'Planning' | 'Contracted' | 'In Progress' | 'Complete'
export type TodoProgress = 'Not Started' | 'In Process' | 'Done' | 'Waiting On Stakeholder'

export type ExpenseCategory =
  | 'equipment'
  | 'workers'
  | 'lodgingTransportation'
  | 'insurance'
  | 'marketing'
  | 'tubes'
  | 'misc'

export interface RevenueItem {
  id: number
  label: string
  amount: number
}

export interface ExpenseItem {
  id: number
  category: ExpenseCategory
  label: string
  amount: number
  notes: string
}

export interface PaymentEntry {
  id: number
  description: string
  dueDate: string
  amountOwed: number
  amountPaid: number
  paidDate: string
  checkNumber: string
  notes: string
}

export interface ContactEntry {
  id: number
  name: string
  company: string
  role: string
  phone: string
  email: string
  quoteInfo: string
  notes: string
}

export interface TodoEntry {
  id: number
  task: string
  owner: string
  notes: string
  progress: TodoProgress
  dueDate: string
  completed: boolean
}

export interface FlightEntry {
  id: number
  tripType: string
  person: string
  confirmation: string
  flightTime: string
  flightDate: string
  notes: string
}

export interface HotelEntry {
  id: number
  dateLabel: string
  confirmationNumber: string
  hotelName: string
  notes: string
}

export interface RentalEntry {
  id: number
  vendor: string
  dropOffAddress: string
  mobile: string
  office: string
  confirmation: string
  email: string
  notes: string
}

export interface TimeSlotEntry {
  id: number
  dayLabel: string
  headcount: string
  details: string
  hours: string
  notes: string
}

export type ContractStatus = 'Not Sent' | 'Sent' | 'Signed' | 'Missing'

export interface StaffEntry {
  id: number
  name: string
  role: string
  email: string
  phone: string
  assignedShift: string
  arrivalDate: string
  departureDate: string
  flightSummary: string
  contractStatus: ContractStatus
  contractDueDate: string
  contractNotes: string
  inviteNotes: string
}

export interface InvoiceLineItem {
  id: number
  description: string
  quantity: number
  rate: number
}

export interface InvoiceDraft {
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
  lineItems: InvoiceLineItem[]
}

export interface EventInfo {
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

export interface EventDocument {
  id: number
  documentType: string
  originalName: string
  notes: string
  uploadedAt: string
  size: number
  url: string
}

export interface EventSummary {
  id: number
  name: string
  city: string
  state: string
  startDate: string
  endDate: string
  status: EventStatus
  contractRevenue: number
  totalRevenue: number
  totalExpenses: number
  netReturn: number
}

export interface EventDetail extends EventSummary {
  overview: string
  meetingLocation: string
  generalNotes: string
  revenueItems: RevenueItem[]
  expenseItems: ExpenseItem[]
  payments: PaymentEntry[]
  contacts: ContactEntry[]
  todos: TodoEntry[]
  info: EventInfo
  flights: FlightEntry[]
  hotels: HotelEntry[]
  rentals: RentalEntry[]
  timeSlots: TimeSlotEntry[]
  staff: StaffEntry[]
  invoice: InvoiceDraft
  documents: EventDocument[]
}

export interface CategorySpend {
  category: ExpenseCategory
  label: string
  amount: number
  percent: number
}

export interface AnalyticsSnapshot {
  yearlyRevenue: number
  yearlyExpenses: number
  yearlyNet: number
  allTimeRevenue: number
  allTimeExpenses: number
  allTimeNet: number
  yearlyBreakdown: YearSummary[]
  comparison: EventSummary[]
}

export interface YearSummary {
  year: number
  eventCount: number
  totalRevenue: number
  totalExpenses: number
  netReturn: number
}

export interface ReminderItem {
  id: string
  eventId: number
  eventName: string
  type: 'payment' | 'todo'
  title: string
  dueDate: string
  status: 'dueToday' | 'overdue'
}
