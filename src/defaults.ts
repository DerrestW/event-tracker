import type {
  ContractStatus,
  EventDetail,
  EventInfo,
  InvoiceDraft,
  EventStatus,
  ExpenseCategory,
  TodoProgress,
} from './types'

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  equipment: 'Equipment',
  workers: 'Workers',
  lodgingTransportation: 'Lodging & Transportation',
  insurance: 'Insurance',
  marketing: 'Marketing',
  tubes: 'Tubes',
  misc: 'Misc',
}

export const eventStatuses: EventStatus[] = [
  'Planning',
  'Contracted',
  'In Progress',
  'Complete',
]

export const todoProgressOptions: TodoProgress[] = [
  'Not Started',
  'In Process',
  'Done',
  'Waiting On Stakeholder',
]

export const contractStatusOptions: ContractStatus[] = [
  'Not Sent',
  'Sent',
  'Signed',
  'Missing',
]

export const blankInfo: EventInfo = {
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

export const blankInvoice: InvoiceDraft = {
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

export const blankEventDetail = (): EventDetail => ({
  id: 0,
  name: '',
  city: '',
  state: '',
  startDate: '',
  endDate: '',
  status: 'Planning',
  contractRevenue: 0,
  totalRevenue: 0,
  totalExpenses: 0,
  netReturn: 0,
  overview: '',
  meetingLocation: '',
  generalNotes: '',
  revenueItems: [],
  expenseItems: [],
  payments: [],
  contacts: [],
  todos: [],
  info: blankInfo,
  flights: [],
  hotels: [],
  rentals: [],
  timeSlots: [],
  staff: [],
  invoice: {
    ...blankInvoice,
    lineItems: blankInvoice.lineItems.map((item) => ({ ...item })),
  },
  documents: [],
})
