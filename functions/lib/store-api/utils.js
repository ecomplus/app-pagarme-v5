const ecomUtils = require('@ecomplus/utils')
const getOrderById = async (appSdk, storeId, orderId, auth) => {
  const { response: { data } } = await appSdk.apiRequest(storeId, `/orders/${orderId}.json`, 'GET', null, auth)
  return data
}

const addPaymentHistory = async (appSdk, storeId, orderId, auth, body) => {
  return appSdk.apiRequest(storeId, `orders/${orderId}/payments_history.json`, 'POST', body, auth)
}

const updateTransaction = (appSdk, storeId, orderId, auth, body, transactionId) => {
  const urlTransaction = transactionId ? `/${transactionId}` : ''
  const method = transactionId ? 'PATCH' : 'POST'

  return appSdk.apiRequest(storeId, `orders/${orderId}/transactions${urlTransaction}.json`, method, body, auth)
}

const getOrderIntermediatorTransactionId = async (appSdk, storeId, invoiceId, auth) => {
  let queryString = `?transactions.intermediator.transaction_id=${invoiceId}`
  queryString += '&fields=transactions,financial_status.current,status'
  const { response: { data } } = await appSdk
    .apiRequest(storeId, `/orders.json${queryString}`, 'GET', null, auth)

  // console.log(`>>> ${JSON.stringify(data)}`)

  return data?.result.length ? data?.result[0] : null
}

const checkItemsAndRecalculeteOrder = (amount, items, plan, itemsPagarme) => {
  let subtotal = 0
  let item
  let i = 0
  while (i < items.length) {
    item = items[i]

    if (item.flags && (item.flags.includes('freebie') || item.flags.includes('discount-set-free'))) {
      items.splice(i, 1)
    } else {
      const itemFound = itemsPagarme.find(itemFind => itemFind.id === `pi_${itemFind.sku}`)
      if (itemFound) {
        item.quantity = itemFound.quantity
        if (item.final_price) {
          item.final_price = (itemFound / 100)
        }
        item.price = (itemFound / 100)
        subtotal += item.quantity * (item.final_price || item.price)
        i++
      } else {
        items.splice(i, 1)
      }
    }
  }

  // TODO:
  // Freigth is an item on PagarMe
  // there is an increment in the subscription referring to the freight
  // if the plan discount is only in the subtotal and the discount is in percentage

  if (subtotal > 0) {
    amount.subtotal = subtotal
    amount.total = amount.subtotal + (amount.tax || 0) + (amount.freight || 0) + (amount.extra || 0)
    let planDiscount
    if (plan && plan.discount) {
      if (plan.discount.percentage) {
        planDiscount = amount[plan.discount.apply_at]
        planDiscount = planDiscount * ((plan.discount.value) / 100)
      }
    }
    // if the plan doesn't exist, because it's subscription before the update
    amount.discount = plan ? ((plan.discount && !plan.discount.percentage ? plan.discount.value : planDiscount) || 0) : (amount.discount || 0)

    amount.total -= amount.discount
    amount.total = amount.total > 0 ? amount.total : 0

    return amount.total > 0 ? Math.floor((amount.total).toFixed(2) * 1000) / 10 : 0
  }

  return 0
}

const createNewOrderBasedOld = (appSdk, storeId, auth, oldOrder, plan, status, charge, subscriptionPagarme) => {
  const { buyers, items, domain, amount } = oldOrder
  const channelType = oldOrder.channel_type
  const shippingLines = oldOrder.shipping_lines
  const shippingMethodLabel = oldOrder.shipping_method_label
  const paymentMethodLabel = oldOrder.payment_method_label
  const originalTransaction = oldOrder.transactions[0]

  const quantity = charge.code?.replace(`${oldOrder._id}-`, '')
  const itemsPagarme = subscriptionPagarme.items

  checkItemsAndRecalculeteOrder(amount, items, plan, itemsPagarme)
  if (amount.balance) {
    delete amount.balance
  }

  items.forEach(item => {
    if (item.stock_status && item.stock_status !== 'unmanaged') {
      item.stock_status = 'pending'
    }
  })
  const transactionPagarme = charge.last_transaction

  const transactions = [
    {
      amount: amount.total,
      status: {
        updated_at: transactionPagarme.updated_at || new Date().toISOString(),
        current: status
      },
      intermediator: {
        transaction_id: `${charge.invoice.id}`,
        transaction_code: `${transactionPagarme.acquirer_auth_code || ''}`,
        transaction_reference: `${transactionPagarme.acquirer_tid || ''};`
      },
      payment_method: originalTransaction.payment_method,
      app: originalTransaction.app,
      _id: ecomUtils.randomObjectId(),
      notes: `Parcela #${quantity} referente à ${subscriptionPagarme?.statement_descriptor || 'Assinatura'}`,
      custom_fields: originalTransaction.custom_fields
    }
  ]

  transactions[0].payment_link = transactionPagarme.url

  const financialStatus = {
    updated_at: transactionPagarme.updated_at || new Date().toISOString(),
    current: status
  }

  const body = {
    opened_at: new Date().toISOString(),
    items,
    shipping_lines: shippingLines,
    buyers,
    channel_type: channelType,
    domain,
    amount,
    shipping_method_label: shippingMethodLabel,
    payment_method_label: paymentMethodLabel,
    transactions,
    financial_status: financialStatus,
    subscription_order: {
      _id: oldOrder._id,
      number: oldOrder.number
    },
    notes: `Parcela #${quantity} referente à ${subscriptionPagarme?.statement_descriptor || 'Assinatura'}`,
    staff_notes: `Valor cobrado no GalaxPay R$${(charge.amount) / 100}`
  }
  return appSdk.apiRequest(storeId, 'orders.json', 'POST', body, auth)
}

const updateOrder = async (appSdk, storeId, orderId, auth, body) => {
  return appSdk.apiRequest(storeId, `orders/${orderId}.json`, 'PATCH', body, auth)
}

const getOrderWithQueryString = async (appSdk, storeId, query, auth) => {
  const { response: { data } } = await appSdk
    .apiRequest(storeId, `/orders.json?${query}`, 'GET', null, auth)

  return data?.result.length ? data?.result : null
}

const getProductById = async (appSdk, storeId, productId, auth) => {
  const { response: { data } } = await appSdk.apiRequest(storeId, `/products/${productId}.json`, 'GET', null, auth)
  return data
}

module.exports = {
  getOrderById,
  addPaymentHistory,
  updateTransaction,
  getOrderIntermediatorTransactionId,
  createNewOrderBasedOld,
  updateOrder,
  getOrderWithQueryString,
  getProductById
}