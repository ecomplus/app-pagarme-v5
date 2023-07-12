// pending, paid, canceled, scheduled ou failed.
const parserInvoiceStatusToEcom = (status) => {
  // pending, paid, canceled, scheduled ou failed
  switch (status) {
    case 'pending':
    case 'paid':
      return status
    case 'scheduled':
      return 'under_analysis'
    case 'canceled':
      return 'voided'
    case 'failed':
      return 'unauthorized'
    default:
      return 'unknown'
  }
}

const parserChangeStatusToEcom = (status) => {
  // overpaid paid partial_canceled payment_failed pending processing refunded underpaid
  switch (status) {
    case 'pending':
    case 'paid':
    case 'refunded':
      return status
    case 'overpaid':
      return 'paid'
    case 'processing':
      return 'under_analysis'
    case 'canceled':
      return 'voided'
    case 'payment_failed':
      return 'unauthorized'
    case 'underpaid':
      return 'partially_paid'
    default:
      return 'unknown'
  }
}

module.exports = {
  parserInvoiceStatusToEcom,
  parserChangeStatusToEcom
}
