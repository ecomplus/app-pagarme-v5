const axios = require('./axios-create')

const parseAddress = to => ({
  city: to.city,
  state: to.province || to.province_code,
  country: to.country_code ? to.country_code.toLowerCase() : 'br',
  zip_code: to.zip,
  line_1: `${String(to.number) || 's/n'},${to.street},${to.borough}`,
  line_2: to.complement || ''
})

const parseIntervalPlan = {
  // day, week, month ou year.
  Diaria: {
    interval: 'day',
    interval_count: 1
  },
  Semanal: {
    interval: 'week',
    interval_count: 1
  },
  Mensal: {
    interval: 'month',
    interval_count: 1

  },
  Bimestral: {
    interval: 'month',
    interval_count: 2
  },
  Trimestral: {
    interval: 'month',
    interval_count: 3
  },
  Semestral: {
    interval: 'month',
    interval_count: 6
  },
  Anual: {
    interval: 'year',
    interval_count: 1
  }
}

const createSubscription = async (params, appData, storeId, plan) => {
  const pagarmeAxios = axios(appData.pagarme_secret_key)

  const orderId = params.order_id
  const { amount, buyer, to, items } = params

  const paymentMethod = params.payment_method.code !== 'credit_card' ? 'boleto' : 'credit_card'
  let address
  let billingDay = new Date().getDate()
  if (billingDay > 28) {
    billingDay = 1
  }

  const intervalPlan = parseIntervalPlan[plan.periodicity]

  const pagarmeSubscription = {
    code: orderId,
    payment_method: paymentMethod,
    currency: 'BRL',
    interval: intervalPlan.interval || 'month',
    interval_count: intervalPlan.interval_count || 1,
    billing_type: 'prepaid', //
    statement_descriptor: `Assinatura ${plan.periodicity || 'Mensal'}`
  }

  pagarmeSubscription.metada = {
    order_number: params.order_number,
    store_id: storeId,
    order_id: orderId,
    platform_integration: 'ecomplus'
  }

  if (to && to.street) {
    address = parseAddress(to)
  } else if (params.billing_address) {
    address = parseAddress(params.billing_address)
  }

  if (paymentMethod === 'credit_card') {
    pagarmeSubscription.card_token = params.credit_card.hash
  }

  pagarmeSubscription.customer = {
    name: buyer.fullname,
    type: buyer.registry_type === 'j' ? 'company' : 'individual',
    email: buyer.email,
    code: buyer.customer_id,
    document: buyer.doc_number,
    document_type: buyer.registry_type === 'j' ? 'cnpj' : 'cpf',
    address,
    phones: {
      [`${buyer.phone.type === 'personal' ? 'mobile_phone' : 'home_phone'}`]: {
        country_code: `${(buyer.phone.country_code || 55)}`,
        area_code: (buyer.phone.number).substring(0, 2),
        number: (buyer.phone.number).substring(2)
      }
    }
  }
  const birthDate = buyer.birth_date
  if (birthDate && birthDate.year && birthDate.day) {
    pagarmeSubscription.customer.birthday = `${birthDate.year}-` +
      `${birthDate.month.toString().padStart(2, '0')}-` +
      birthDate.day.toString().padStart(2, '0')
  }

  pagarmeSubscription.discounts = []
  pagarmeSubscription.items = []

  items.forEach(async item => {
    if (item.quantity > 0) {
      const itemSubscription = {
        name: item.name || item.sku,
        quantity: item.quantity,
        description: item.name || item.sku,
        id: `pi_${item.sku || item.variation_id || item.product_id}`,
        status: 'active',
        pricing_scheme: {
          scheme_type: 'unit',
          price: Math.floor((item.final_price || item.price) * 100)
        }
      }
      // if the item is a bonus, create a discount for repeat one time
      if (
        item.flags && (item.flags.includes('freebie') ||
          item.flags.includes('discount-set-free'))
      ) {
        itemSubscription.cycles = 1
      }

      pagarmeSubscription.items.push(itemSubscription)
    }
  })

  if (amount.freight) {
    // If the plan discount is on the total then shipping will be an item,
    //  if the discount is on the subtotal shipping will be an increment
    if (plan?.discount?.apply_at === 'total') {
      pagarmeSubscription.items.push({
        name: 'Frete',
        quantity: 1,
        description: 'Frete',
        id: `pi_freight_${orderId}`,
        status: 'active',
        pricing_scheme: {
          scheme_type: 'unit',
          price: Math.floor((amount.freight).toFixed(2) * 1000) / 10
        }
      })
    } else {
      pagarmeSubscription.increments = []
      pagarmeSubscription.increments.push({
        value: `${Math.floor((amount.freight).toFixed(2) * 1000) / 10}`,
        discount_type: 'flat'
      })
    }
  }

  console.log('>> amount ', JSON.stringify(amount))
  // Add once discont, but webhook invoce check discount plan
  const discountSubscription = amount.discount && {
    value: `${Math.floor((amount.discount).toFixed(2) * 1000) / 10}`,
    discount_type: 'flat',
    cycles: 1
  }

  if (discountSubscription) {
    pagarmeSubscription.discounts.push(discountSubscription)
  }

  console.log('> Subscription: ', JSON.stringify(pagarmeSubscription))

  return pagarmeAxios.post(
    '/subscriptions',
    pagarmeSubscription
  )
}

module.exports = {
  createSubscription
}
