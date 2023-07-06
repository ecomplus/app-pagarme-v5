const discountPlanPayment = (planName, plan, amount) => {
  let discount
  // console.log('>>Plan ', plan)
  if (plan.discount_first_installment &&
    !plan.discount_first_installment.disable) {
    discount = plan.discount_first_installment
  } else {
    discount = plan.discount
  }

  if (discount && discount.value > 0) {
    // default discount option
    const { value } = discount
    const discountOption = {
      label: planName,
      value,
      type: discount.percentage ? 'percentage' : 'fixed'
    }

    if (amount.total) {
      // check amount value to apply discount
      if (amount.total < discount.min_amount) {
        discount.value = 0
      } else {
        delete discount.min_amount

        // fix local amount object
        const applyDiscount = discount.apply_at

        const maxDiscount = amount[applyDiscount || 'subtotal']
        let discountValue
        if (discount.percentage && discount.percentage === true) {
          discountValue = maxDiscount * discount.value / 100
        } else {
          discountValue = discount.value
          if (discountValue > maxDiscount) {
            discountValue = maxDiscount
          }
        }
        if (discountValue > 0) {
          amount.discount = (amount.discount || 0) + discountValue
          amount.total -= discountValue
          if (amount.total < 0) {
            amount.total = 0
          }
        }
      }
    }
    return { amount, discountOption }
  }
}

const getPlanInTransction = (label, plans) => {
  // find plan by name (label)
  const plan = plans.find((plan) => {
    const planLabel = `Assinatura ${plan.periodicity} ${plan.label || 'Plano'}`

    label = label.trim()
    return label === planLabel
  })

  return plan
}

module.exports = {
  discountPlanPayment,
  getPlanInTransction
}
